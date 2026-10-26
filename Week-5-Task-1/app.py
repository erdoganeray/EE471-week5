"""Azure Speech Services website: Flask backend for text-to-speech and speech-to-text with Azure Speech."""

import os
import threading
import wave
from array import array
from io import BytesIO

import azure.cognitiveservices.speech as speechsdk
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request

# Read SPEECH_KEY and SPEECH_REGION from the .env file in the repository root
load_dotenv()

SPEECH_KEY = os.getenv("SPEECH_KEY")
SPEECH_REGION = os.getenv("SPEECH_REGION")
# Multilingual voice: reads both English and Turkish text naturally
VOICE_NAME = "en-US-AvaMultilingualNeural"
MAX_TEXT_LENGTH = 5000
RECOGNITION_LANGUAGE = "en-US"
MAX_AUDIO_BYTES = 10 * 1024 * 1024  # 10 MB, about 5 minutes of 16 kHz audio

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_AUDIO_BYTES


# ---- Text to Speech ----

def synthesize_to_wav(text):
    """Send text to Azure Speech and return the synthesized audio as WAV bytes."""
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_synthesis_voice_name = VOICE_NAME
    speech_config.set_speech_synthesis_output_format(
        speechsdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
    )

    # audio_config=None keeps the audio in memory instead of playing it on the server's speakers
    synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=None)
    result = synthesizer.speak_text_async(text).get()

    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        return result.audio_data

    details = result.cancellation_details
    raise RuntimeError(f"Speech synthesis canceled: {details.reason}. {details.error_details or ''}".strip())


# ---- Speech to Text ----

def wav_to_audio_config(wav_bytes):
    """Read a 16-bit PCM WAV file and pass its samples to Azure through an audio stream."""
    with wave.open(BytesIO(wav_bytes)) as wav:
        if wav.getsampwidth() != 2 or wav.getnchannels() not in (1, 2):
            raise ValueError("Unsupported WAV format")
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        frames = wav.readframes(wav.getnframes())

    # Speech recognition expects mono audio: average the left and right channels
    if channels == 2:
        samples = array("h", frames)
        frames = array("h", ((left + right) // 2 for left, right in zip(samples[::2], samples[1::2]))).tobytes()

    stream_format = speechsdk.audio.AudioStreamFormat(samples_per_second=sample_rate, bits_per_sample=16, channels=1)
    stream = speechsdk.audio.PushAudioInputStream(stream_format)
    stream.write(frames)
    stream.close()
    return speechsdk.audio.AudioConfig(stream=stream)


def transcribe(wav_bytes):
    """Send the audio to Azure Speech and return the recognized text."""
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_recognition_language = RECOGNITION_LANGUAGE
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=wav_to_audio_config(wav_bytes))

    # Continuous recognition reads the whole file; recognize_once() would stop after the first sentence
    sentences = []
    errors = []
    done = threading.Event()

    def on_recognized(event):
        if event.result.reason == speechsdk.ResultReason.RecognizedSpeech:
            sentences.append(event.result.text)

    def on_canceled(event):
        if event.cancellation_details.reason == speechsdk.CancellationReason.Error:
            errors.append(event.cancellation_details.error_details)
        done.set()

    recognizer.recognized.connect(on_recognized)
    recognizer.canceled.connect(on_canceled)
    recognizer.session_stopped.connect(lambda _: done.set())

    recognizer.start_continuous_recognition()
    done.wait(timeout=120)
    recognizer.stop_continuous_recognition()

    if errors:
        raise RuntimeError(f"Speech recognition failed: {errors[0]}")
    return " ".join(sentences)


# ---- Routes ----

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/synthesize", methods=["POST"])
def synthesize():
    text = (request.get_json(silent=True) or {}).get("text", "").strip()

    if not text:
        return jsonify(error="Please enter some text."), 400
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify(error=f"Text is too long (max {MAX_TEXT_LENGTH} characters)."), 400
    if not SPEECH_KEY or not SPEECH_REGION:
        return jsonify(error="SPEECH_KEY or SPEECH_REGION is missing in the .env file."), 500

    try:
        audio = synthesize_to_wav(text)
    except RuntimeError as exc:
        return jsonify(error=str(exc)), 502

    return Response(audio, mimetype="audio/wav")


@app.route("/api/transcribe", methods=["POST"])
def transcribe_audio():
    audio = request.files.get("audio")

    if audio is None:
        return jsonify(error="Please record or choose an audio file."), 400
    if not SPEECH_KEY or not SPEECH_REGION:
        return jsonify(error="SPEECH_KEY or SPEECH_REGION is missing in the .env file."), 500

    try:
        text = transcribe(audio.read())
    except (wave.Error, EOFError, ValueError):
        return jsonify(error="Please use a 16-bit PCM WAV file."), 400
    except RuntimeError as exc:
        return jsonify(error=str(exc)), 502

    if not text:
        return jsonify(error="No speech was recognized in the audio."), 422
    return jsonify(text=text)


@app.errorhandler(413)
def file_too_large(_):
    return jsonify(error=f"The audio file is too large (max {MAX_AUDIO_BYTES // (1024 * 1024)} MB)."), 413


if __name__ == "__main__":
    app.run(debug=True)
