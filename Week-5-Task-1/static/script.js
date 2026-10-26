const textInput = document.getElementById("text-input");
const synthesizeBtn = document.getElementById("synthesize-btn");
const clearBtn = document.getElementById("clear-btn");
const statusBox = document.getElementById("status");
const resultBox = document.getElementById("result");
const audioPlayer = document.getElementById("audio-player");
const downloadLink = document.getElementById("download-link");

// Object URL of the latest generated audio, released when replaced or cleared
let audioUrl = null;

function showStatus(message, type) {
    statusBox.textContent = message;
    statusBox.className = `status ${type}`;
    statusBox.hidden = false;
}

function resetAudio() {
    if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        audioUrl = null;
    }
    audioPlayer.removeAttribute("src");
    resultBox.hidden = true;
}

synthesizeBtn.addEventListener("click", async () => {
    const text = textInput.value.trim();
    if (!text) {
        showStatus("Please enter some text.", "error");
        return;
    }

    synthesizeBtn.disabled = true;
    showStatus("Synthesizing...", "info");

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
        resultBox.hidden = false;
        showStatus("✓ Speech synthesized successfully!", "success");
    } catch (err) {
        showStatus(err.message, "error");
    } finally {
        synthesizeBtn.disabled = false;
    }
});

clearBtn.addEventListener("click", () => {
    textInput.value = "";
    resetAudio();
    statusBox.hidden = true;
    textInput.focus();
});
