// Part 4: real-time diarization, speech translation and pronunciation assessment.
// These run in the browser with the Azure Speech SDK for JavaScript, so results appear while the
// audio is being processed. The Flask server only hands out short-lived tokens (GET /api/speech-token).

// SDK offsets and durations are in 100-nanosecond ticks
const TICKS_PER_SECOND = 10_000_000;

// ---- Shared helpers ----

let tokenCache = null;

// The Flask server trades the secret key for a token that is valid for 10 minutes
async function getSpeechToken() {
    if (!tokenCache || Date.now() - tokenCache.time > 9 * 60 * 1000) {
        const response = await fetch("/api/speech-token");
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || "Could not get a speech token.");
        }
        tokenCache = { token: data.token, region: data.region, time: Date.now() };
    }
    return tokenCache;
}

async function getSpeechConfig() {
    const { token, region } = await getSpeechToken();
    return SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
}

// Live microphone, or a WAV file sent through the same real-time API
function audioConfigFor(file) {
    return file
        ? SpeechSDK.AudioConfig.fromWavFileInput(file)
        : SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
}

// Speaks text with the Text to Speech backend of Part 1; each text is synthesized once
const spokenAudio = new Map();

async function playSpeech(text) {
    if (!spokenAudio.has(text)) {
        const audioUrl = fetch("/api/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        }).then(async (response) => {
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || "Speech synthesis failed.");
            }
            return URL.createObjectURL(await response.blob());
        });
        spokenAudio.set(text, audioUrl);
        audioUrl.catch(() => spokenAudio.delete(text)); // try again next time
    }
    await new Audio(await spokenAudio.get(text)).play();
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

// Diarization and translation share one flow: start with the microphone or a file, show results while
// the audio is processed, and finish with the Stop button or at the end of the file.
// createRecognizer(audioConfig) builds the SDK object; start/stop name its start and stop methods.
function setupSession(ui, createRecognizer, start, stop) {
    let recognizer = null;

    function setRunning(running) {
        ui.liveBtn.disabled = running;
        ui.fileBtn.disabled = running;
        ui.stopBtn.disabled = !running;
    }

    function end(message, type) {
        if (!recognizer) {
            return;
        }
        const finished = recognizer;
        recognizer = null;
        finished[stop](() => finished.close(), () => finished.close());
        setRunning(false);
        if (message) {
            showStatus(ui.status, message, type);
        }
    }

    async function begin(file) {
        setRunning(true);
        showStatus(ui.status, file ? "Processing the file..." : "Listening... speak now.", "info");
        try {
            recognizer = await createRecognizer(audioConfigFor(file));
            recognizer.canceled = (_, event) => {
                if (event.reason === SpeechSDK.CancellationReason.Error) {
                    end(`Stopped: ${event.errorDetails}`, "error");
                } else {
                    end("✓ Finished.", "success"); // end of the file
                }
            };
            recognizer.sessionStopped = () => end("✓ Finished.", "success");
            await new Promise((resolve, reject) => recognizer[start](resolve, (err) => reject(new Error(err))));
        } catch (err) {
            recognizer?.close();
            recognizer = null;
            setRunning(false);
            showStatus(ui.status, err.message, "error");
        }
    }

    ui.liveBtn.addEventListener("click", () => begin(null));
    ui.stopBtn.addEventListener("click", () => end("Stopped.", "info"));
    ui.fileBtn.addEventListener("click", () => {
        const file = ui.fileInput.files[0];
        if (!file) {
            showStatus(ui.status, "Please choose a WAV file first.", "error");
            return;
        }
        begin(file);
    });

    return { stop: () => end() };
}

// ---- Real-time diarization: who said what ----

const diarStatus = document.getElementById("diar-status");
const diarResult = document.getElementById("diar-result");
const diarStats = document.getElementById("diar-stats");
const diarConversation = document.getElementById("diar-conversation");
const diarPartial = document.getElementById("diar-partial");
const diarFile = document.getElementById("diar-file");

let conversation = [];          // { speaker, text, start, duration } per sentence
const speakerNames = new Map(); // "Guest-1" -> "Speaker 1", in order of appearance

function speakerName(id) {
    if (!id || id === "Unknown") {
        return "Unknown";
    }
    if (!speakerNames.has(id)) {
        speakerNames.set(id, `Speaker ${speakerNames.size + 1}`);
    }
    return speakerNames.get(id);
}

function renderConversation() {
    diarConversation.replaceChildren(...conversation.map((utterance) => {
        const bubble = document.createElement("div");
        // One color per speaker; "Unknown" (index -1) gets the neutral color
        const index = [...speakerNames.values()].indexOf(utterance.speaker);
        bubble.className = `utterance speaker-${index < 0 ? "unknown" : index % 4}`;

        const header = document.createElement("div");
        header.className = "utterance-header";
        header.textContent = `${utterance.speaker} · ${formatTime(utterance.start)}`;
        const text = document.createElement("div");
        text.textContent = utterance.text;

        bubble.append(header, text);
        return bubble;
    }));

    // Talk time per speaker
    const talkTime = new Map();
    for (const utterance of conversation) {
        talkTime.set(utterance.speaker, (talkTime.get(utterance.speaker) ?? 0) + utterance.duration);
    }
    const known = [...talkTime.keys()].filter((name) => name !== "Unknown").length;
    const parts = [...talkTime].map(([name, seconds]) => `${name}: ${seconds.toFixed(1)} s`);
    diarStats.textContent = conversation.length
        ? `${known} speaker${known === 1 ? "" : "s"} · ${parts.join(" · ")}`
        : "";
}

const diarSession = setupSession(
    {
        liveBtn: document.getElementById("diar-live-btn"),
        stopBtn: document.getElementById("diar-stop-btn"),
        fileBtn: document.getElementById("diar-file-btn"),
        fileInput: diarFile,
        status: diarStatus,
    },
    async (audioConfig) => {
        const config = await getSpeechConfig();
        config.speechRecognitionLanguage = "en-US";
        const transcriber = new SpeechSDK.ConversationTranscriber(config, audioConfig);

        conversation = [];
        speakerNames.clear();
        renderConversation();
        diarResult.hidden = false;

        // Partial text while a sentence is still being spoken
        transcriber.transcribing = (_, event) => {
            diarPartial.textContent = event.result.text ? `… ${event.result.text}` : "";
        };
        // Final text of a sentence, with the speaker who said it
        transcriber.transcribed = (_, event) => {
            diarPartial.textContent = "";
            if (event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech || !event.result.text) {
                return;
            }
            conversation.push({
                speaker: speakerName(event.result.speakerId),
                text: event.result.text,
                start: event.result.offset / TICKS_PER_SECOND,
                duration: event.result.duration / TICKS_PER_SECOND,
            });
            renderConversation();
        };
        return transcriber;
    },
    "startTranscribingAsync",
    "stopTranscribingAsync",
);

document.getElementById("diar-download-btn").addEventListener("click", () => {
    const lines = conversation.map((u) => `[${formatTime(u.start)}] ${u.speaker}: ${u.text}`);
    const url = URL.createObjectURL(new Blob([lines.join("\n") + "\n"], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "conversation.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById("diar-clear-btn").addEventListener("click", () => {
    diarSession.stop();
    conversation = [];
    speakerNames.clear();
    diarFile.value = "";
    diarPartial.textContent = "";
    diarResult.hidden = true;
    diarStatus.hidden = true;
});

// ---- Speech translation ----

const LANGUAGE_NAMES = { tr: "Turkish", en: "English", de: "German", fr: "French", es: "Spanish" };

const transSource = document.getElementById("trans-source");
const transTargets = document.querySelectorAll("#trans-targets input");
const transStatus = document.getElementById("trans-status");
const transResult = document.getElementById("trans-result");
const transList = document.getElementById("trans-list");
const transPartial = document.getElementById("trans-partial");
const transFile = document.getElementById("trans-file");

// A language cannot be translated into itself: turn off the target that matches the spoken language
function updateTargets() {
    const spoken = transSource.value.slice(0, 2);
    transTargets.forEach((box) => {
        box.disabled = box.value === spoken;
        if (box.disabled) {
            box.checked = false;
        }
    });
}
transSource.addEventListener("change", updateTargets);
updateTargets();

// One line per language: tag, text and a button that speaks it
function translationLine(tag, text, playable) {
    const line = document.createElement("div");
    line.className = "translation-line";
    const label = document.createElement("span");
    label.className = "lang-tag";
    label.textContent = tag;
    const content = document.createElement("span");
    content.className = "translation-text";
    content.textContent = text;
    line.append(label, content);

    if (playable && text) {
        const play = document.createElement("button");
        play.className = "btn-play";
        play.title = "Play";
        play.textContent = "🔊";
        play.addEventListener("click", () => {
            playSpeech(text).catch((err) => showStatus(transStatus, err.message, "error"));
        });
        line.append(play);
    }
    return line;
}

function translationBlock(result, targets, final) {
    const block = document.createElement("div");
    block.className = final ? "translation-item" : "translation-item partial";
    block.append(translationLine(transSource.value.slice(0, 2).toUpperCase(), result.text, false));
    for (const lang of targets) {
        block.append(translationLine(lang.toUpperCase(), result.translations.get(lang) ?? "", final));
    }
    return block;
}

let transTargetLanguages = [];

const transSession = setupSession(
    {
        liveBtn: document.getElementById("trans-live-btn"),
        stopBtn: document.getElementById("trans-stop-btn"),
        fileBtn: document.getElementById("trans-file-btn"),
        fileInput: transFile,
        status: transStatus,
    },
    async (audioConfig) => {
        transTargetLanguages = [...transTargets].filter((box) => box.checked).map((box) => box.value);
        if (!transTargetLanguages.length) {
            throw new Error("Choose at least one language to translate to.");
        }

        const { token, region } = await getSpeechToken();
        const config = SpeechSDK.SpeechTranslationConfig.fromAuthorizationToken(token, region);
        config.speechRecognitionLanguage = transSource.value;
        transTargetLanguages.forEach((lang) => config.addTargetLanguage(lang));
        const recognizer = new SpeechSDK.TranslationRecognizer(config, audioConfig);

        transList.replaceChildren();
        transPartial.replaceChildren();
        transResult.hidden = false;

        // Live update: the sentence and its translations while it is still being spoken
        recognizer.recognizing = (_, event) => {
            transPartial.replaceChildren(translationBlock(event.result, transTargetLanguages, false));
        };
        recognizer.recognized = (_, event) => {
            transPartial.replaceChildren();
            if (event.result.reason === SpeechSDK.ResultReason.TranslatedSpeech && event.result.text) {
                transList.append(translationBlock(event.result, transTargetLanguages, true));
            }
        };
        return recognizer;
    },
    "startContinuousRecognitionAsync",
    "stopContinuousRecognitionAsync",
);

document.getElementById("trans-clear-btn").addEventListener("click", () => {
    transSession.stop();
    transFile.value = "";
    transList.replaceChildren();
    transPartial.replaceChildren();
    transResult.hidden = true;
    transStatus.hidden = true;
});

// ---- Pronunciation assessment ----

const pronSample = document.getElementById("pron-sample");
const pronText = document.getElementById("pron-text");
const pronLiveBtn = document.getElementById("pron-live-btn");
const pronFileBtn = document.getElementById("pron-file-btn");
const pronFile = document.getElementById("pron-file");
const pronStatus = document.getElementById("pron-status");
const pronResult = document.getElementById("pron-result");
const pronScores = document.getElementById("pron-scores");
const pronWords = document.getElementById("pron-words");

const SCORE_NAMES = [
    ["PronScore", "Pronunciation"],
    ["AccuracyScore", "Accuracy"],
    ["FluencyScore", "Fluency"],
    ["CompletenessScore", "Completeness"],
    ["ProsodyScore", "Prosody"],
];

pronSample.addEventListener("change", () => {
    pronText.value = pronSample.value;
});

function renderScores(scores) {
    pronScores.replaceChildren(...SCORE_NAMES.filter(([key]) => key in scores).map(([key, name]) => {
        const value = Math.round(scores[key]);
        const row = document.createElement("div");
        row.className = "score-row";
        row.innerHTML = '<span class="score-name"></span><div class="bar"><div class="bar-fill"></div></div>'
            + '<span class="score-value"></span>';
        row.querySelector(".score-name").textContent = name;
        row.querySelector(".score-value").textContent = value;
        const fill = row.querySelector(".bar-fill");
        fill.style.width = `${value}%`;
        fill.classList.add(value >= 80 ? "good" : value >= 60 ? "fair" : "poor");
        return row;
    }));
}

// Error type of a word: Mispronunciation, Omission or Insertion, otherwise a pause or tone problem
function wordCategory(assessment) {
    const errorType = assessment.ErrorType ?? "None";
    if (errorType !== "None") {
        return { css: errorType.toLowerCase(), label: errorType };
    }
    const prosody = assessment.Feedback?.Prosody ?? {};
    const prosodyErrors = [...(prosody.Break?.ErrorTypes ?? []), ...(prosody.Intonation?.ErrorTypes ?? [])]
        .filter((type) => type !== "None");
    if (prosodyErrors.length) {
        return { css: "prosody", label: prosodyErrors.join(", ") };
    }
    return { css: "correct", label: "Correct" };
}

function renderWords(words) {
    pronWords.replaceChildren(...words.map((word) => {
        const assessment = word.PronunciationAssessment ?? {};
        const category = wordCategory(assessment);
        const button = document.createElement("button");
        button.className = `word word-${category.css}`;
        button.textContent = word.Word;
        button.title = `${category.label} · accuracy ${Math.round(assessment.AccuracyScore ?? 0)}`;
        // Hear the correct pronunciation, made by the Part 1 text-to-speech
        button.addEventListener("click", () => {
            playSpeech(word.Word).catch((err) => showStatus(pronStatus, err.message, "error"));
        });
        return button;
    }));
}

async function assessPronunciation(file) {
    const reference = pronText.value.trim();
    if (!reference) {
        showStatus(pronStatus, "Please enter the sentence to read.", "error");
        return;
    }

    pronLiveBtn.disabled = true;
    pronFileBtn.disabled = true;
    showStatus(pronStatus, file
        ? "Assessing the file..."
        : "Listening... read the sentence aloud. It stops by itself when you finish.", "info");

    let recognizer = null;
    try {
        const config = await getSpeechConfig();
        config.speechRecognitionLanguage = "en-US";
        // Allow short pauses while reading before the sentence counts as finished
        config.setProperty(SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1500");
        recognizer = new SpeechSDK.SpeechRecognizer(config, audioConfigFor(file));

        const assessmentConfig = new SpeechSDK.PronunciationAssessmentConfig(
            reference,
            SpeechSDK.PronunciationAssessmentGradingSystem.HundredMark,
            SpeechSDK.PronunciationAssessmentGranularity.Phoneme,
            true, // miscue: find omitted and inserted words
        );
        assessmentConfig.enableProsodyAssessment = true;
        assessmentConfig.applyTo(recognizer);

        const result = await new Promise((resolve, reject) => {
            recognizer.recognizeOnceAsync(resolve, (err) => reject(new Error(err)));
        });
        if (result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
            throw new Error(result.reason === SpeechSDK.ResultReason.NoMatch
                ? "No speech was recognized. Please try again."
                : result.errorDetails || "Pronunciation assessment failed.");
        }

        const best = JSON.parse(result.json).NBest[0];
        renderScores(best.PronunciationAssessment);
        renderWords(best.Words);
        pronResult.hidden = false;
        showStatus(pronStatus, `✓ Assessed: "${result.text}"`, "success");
    } catch (err) {
        showStatus(pronStatus, err.message, "error");
    } finally {
        recognizer?.close();
        pronLiveBtn.disabled = false;
        pronFileBtn.disabled = false;
    }
}

pronLiveBtn.addEventListener("click", () => assessPronunciation(null));
pronFileBtn.addEventListener("click", () => {
    const file = pronFile.files[0];
    if (!file) {
        showStatus(pronStatus, "Please choose a WAV file first.", "error");
        return;
    }
    assessPronunciation(file);
});

document.getElementById("pron-clear-btn").addEventListener("click", () => {
    pronFile.value = "";
    pronScores.replaceChildren();
    pronWords.replaceChildren();
    pronResult.hidden = true;
    pronStatus.hidden = true;
});
