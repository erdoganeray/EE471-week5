"""Text-to-Speech website: Flask backend that turns user text into a WAV file with Azure Speech."""

import os

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

app = Flask(__name__)


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


if __name__ == "__main__":
    app.run(debug=True)
