function showStatus(box, message, type) {
    box.textContent = message;
    box.className = `status ${type}`;
    box.hidden = false;
}

// ---- Tabs ----

const tabs = document.querySelectorAll(".tab");

tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        tabs.forEach((other) => {
            const selected = other === tab;
            other.classList.toggle("active", selected);
            other.setAttribute("aria-selected", String(selected));
            document.getElementById(other.dataset.panel).hidden = !selected;
        });
    });
});

// ---- Text to Speech ----

const textInput = document.getElementById("text-input");
const synthesizeBtn = document.getElementById("synthesize-btn");
const ttsClearBtn = document.getElementById("tts-clear-btn");
const ttsStatus = document.getElementById("tts-status");
const ttsResult = document.getElementById("tts-result");
const audioPlayer = document.getElementById("audio-player");
const downloadLink = document.getElementById("download-link");

// Object URL of the latest generated audio, released when replaced or cleared
let audioUrl = null;

function resetAudio() {
    if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
    }
    audioPlayer.removeAttribute("src");
    ttsResult.hidden = true;
}

synthesizeBtn.addEventListener("click", async () => {
    const text = textInput.value.trim();
    if (!text) {
        showStatus(ttsStatus, "Please enter some text.", "error");
        return;
    }

    synthesizeBtn.disabled = true;
    showStatus(ttsStatus, "Synthesizing...", "info");

    try {
        const response = await fetch("/api/synthesize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Request failed (${response.status})`);
        }

        // The backend returns the WAV file; play it and offer it for download
        const blob = await response.blob();
        resetAudio();
        audioUrl = URL.createObjectURL(blob);
        audioPlayer.src = audioUrl;
        downloadLink.href = audioUrl;
        ttsResult.hidden = false;
        showStatus(ttsStatus, "✓ Speech synthesized successfully!", "success");
    } catch (err) {
        showStatus(ttsStatus, err.message, "error");
    } finally {
        synthesizeBtn.disabled = false;
    }
});

ttsClearBtn.addEventListener("click", () => {
    textInput.value = "";
    resetAudio();
    ttsStatus.hidden = true;
    textInput.focus();
});

// ---- Speech to Text ----

const recordBtn = document.getElementById("record-btn");
const stopBtn = document.getElementById("stop-btn");
const fileInput = document.getElementById("file-input");
const recordingBox = document.getElementById("recording");
const audioPreview = document.getElementById("audio-preview");
const transcribeBtn = document.getElementById("transcribe-btn");
const sttClearBtn = document.getElementById("stt-clear-btn");
const sttResult = document.getElementById("stt-result");
const transcriptionText = document.getElementById("transcription");
const copyBtn = document.getElementById("copy-btn");
const sttStatus = document.getElementById("stt-status");

// The audio to transcribe: a recording or a chosen file
let audioBlob = null;
let audioName = "recording.wav";
let previewUrl = null;

// Microphone recording state
let audioContext = null;
let mediaStream = null;
let sourceNode = null;
let processorNode = null;
let chunks = [];

function setAudio(blob, name) {
    audioBlob = blob;
    audioName = name;
    if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
    }
    if (blob) {
        previewUrl = URL.createObjectURL(blob);
        audioPreview.src = previewUrl;
    } else {
        audioPreview.removeAttribute("src");
    }
    audioPreview.hidden = !blob;
}

// Builds a 16-bit mono WAV file, the format Azure Speech reads directly
function encodeWav(chunks, sampleRate) {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
    const view = new DataView(new ArrayBuffer(44 + length * 2));
    const writeText = (offset, text) => {
        for (let i = 0; i < text.length; i++) {
            view.setUint8(offset + i, text.charCodeAt(i));
        }
    };

    writeText(0, "RIFF");
    view.setUint32(4, 36 + length * 2, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);             // size of the format block
    view.setUint16(20, 1, true);              // PCM
    view.setUint16(22, 1, true);              // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // bytes per second
    view.setUint16(32, 2, true);              // bytes per sample
    view.setUint16(34, 16, true);             // bits per sample
    writeText(36, "data");
    view.setUint32(40, length * 2, true);

    let offset = 44;
    for (const chunk of chunks) {
        for (const sample of chunk) {
            const clipped = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff, true);
            offset += 2;
        }
    }
    return new Blob([view], { type: "audio/wav" });
}

recordBtn.addEventListener("click", async () => {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
        showStatus(sttStatus, "Microphone access was denied.", "error");
        return;
    }

    // Record at 16 kHz and collect the raw samples of every audio block
    audioContext = new AudioContext({ sampleRate: 16000 });
    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    processorNode = audioContext.createScriptProcessor(4096, 1, 1);
    chunks = [];
    processorNode.onaudioprocess = (event) => {
        chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    sourceNode.connect(processorNode);
    processorNode.connect(audioContext.destination);

    fileInput.value = "";
    setAudio(null);
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    recordingBox.hidden = false;
    sttStatus.hidden = true;
});

stopBtn.addEventListener("click", () => {
    processorNode.disconnect();
    sourceNode.disconnect();
    mediaStream.getTracks().forEach((track) => track.stop());
    setAudio(encodeWav(chunks, audioContext.sampleRate), "recording.wav");
    audioContext.close();

    recordBtn.disabled = false;
    stopBtn.disabled = true;
    recordingBox.hidden = true;
    showStatus(sttStatus, "Recording ready. Click \"Transcribe Audio\".", "info");
});

fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    setAudio(file ?? null, file?.name);
    sttStatus.hidden = true;
});

transcribeBtn.addEventListener("click", async () => {
    if (!audioBlob) {
        showStatus(sttStatus, "Please record or choose a WAV file first.", "error");
        return;
    }

    transcribeBtn.disabled = true;
    showStatus(sttStatus, "Transcribing...", "info");

    try {
        const form = new FormData();
        form.append("audio", audioBlob, audioName);
        const response = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Request failed (${response.status})`);
        }

        transcriptionText.textContent = data.text;
        sttResult.hidden = false;
        showStatus(sttStatus, "✓ Audio transcribed successfully!", "success");
    } catch (err) {
        showStatus(sttStatus, err.message, "error");
    } finally {
        transcribeBtn.disabled = false;
    }
});

copyBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(transcriptionText.textContent);
        showStatus(sttStatus, "✓ Text copied to clipboard!", "success");
    } catch {
        showStatus(sttStatus, "Could not copy the text.", "error");
    }
});

sttClearBtn.addEventListener("click", () => {
    fileInput.value = "";
    setAudio(null);
    transcriptionText.textContent = "";
    sttResult.hidden = true;
    sttStatus.hidden = true;
});
