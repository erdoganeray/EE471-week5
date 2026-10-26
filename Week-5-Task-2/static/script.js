// Voice-activated calculator page logic.
// Input comes from the buttons or from the microphone. Every calculation is sent to the
// Flask server (POST /api/calculate), which uses the Calculator class from Mini Project 1.
// Speech recognition and speech synthesis run in the browser with the Azure Speech SDK.

const display = document.getElementById("display");
const keypad = document.getElementById("keypad");
const micButton = document.getElementById("mic");
const voiceStatus = document.getElementById("voice-status");

let current = "0";     // number shown on the display
let previous = null;   // first number, saved when an operator is pressed
let operator = null;   // "+", "-", "*" or "/"
let startNew = false;  // true after an operator or "=": the next digit starts a new number
let error = null;      // error message from the server, if any

// What the calculator says for each key (command table of the exercise)
const KEY_WORDS = {
  "0": "Zero", "1": "One", "2": "Two", "3": "Three", "4": "Four",
  "5": "Five", "6": "Six", "7": "Seven", "8": "Eight", "9": "Nine",
  ".": "Point", "/": "Over", "*": "Times", "+": "Plus", "-": "Minus",
};

// Spoken words that press a key, including words the recognizer often hears instead ("to" for "two")
const VOICE_COMMANDS = {
  zero: "0", one: "1", won: "1", two: "2", to: "2", too: "2", three: "3",
  four: "4", for: "4", five: "5", six: "6", seven: "7", eight: "8", ate: "8", nine: "9",
  point: ".", over: "/", times: "*", plus: "+", minus: "-", is: "=",
};

const VOICE_NAME = "en-US-AvaMultilingualNeural";

// ---- Calculator ----

// Sends one calculation to the server and returns its JSON answer
async function calculate(a, op, b) {
  try {
    const response = await fetch("/api/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: a, operator: op, b: b }),
    });
    return await response.json();
  } catch {
    return { error: "Server not reachable" };
  }
}

function pressDigit(digit) {
  if (startNew) {
    current = "0";
    startNew = false;
    error = null;
  }
  if (digit === ".") {
    if (!current.includes(".")) {
      current += ".";
    }
  } else {
    current = current === "0" ? digit : current + digit;
  }
}

async function pressOperator(op) {
  // 2 + 3 x ... : finish 2 + 3 first
  if (operator && !startNew) {
    await pressEquals();
  }
  if (error) {
    return;
  }
  previous = Number(current);
  operator = op;
  startNew = true;
}

// Returns true if a calculation was made
async function pressEquals() {
  if (!operator || startNew) {
    return false;
  }
  const answer = await calculate(previous, operator, Number(current));
  if ("error" in answer) {
    error = answer.error;
  } else {
    current = String(answer.result);
  }
  operator = null;
  startNew = true;
  return true;
}

function render() {
  display.textContent = error ?? current;
  display.classList.toggle("error", error !== null);
}

// Presses one key and returns what the calculator should say, or null
async function pressKey(value) {
  if (value === "=") {
    const calculated = await pressEquals();
    render();
    if (!calculated) {
      return null;
    }
    return error ?? `is ${current}`;
  }
  if ("+-*/".includes(value)) {
    await pressOperator(value);
  } else {
    pressDigit(value);
  }
  render();
  return error ?? KEY_WORDS[value];
}

// Key presses run one at a time and in order, because "=" waits for the server.
// Button presses say every key; voice commands only say the result, since the user just said the keys.
let inputQueue = Promise.resolve();

function enqueueKeys(values, speakEveryKey) {
  inputQueue = inputQueue.then(async () => {
    for (const value of values) {
      const words = await pressKey(value);
      if (words && (speakEveryKey || value === "=")) {
        speak(words);
      }
    }
  }).catch((err) => showVoiceStatus(err.message));
}

keypad.addEventListener("click", (event) => {
  const value = event.target.dataset.value;
  if (!value) {
    return; // clicked between the buttons
  }
  enqueueKeys([value], true);
});

// ---- Azure Speech ----

function showVoiceStatus(message) {
  voiceStatus.textContent = message;
}

// The Flask server trades the secret key for a token that is valid for 10 minutes
let tokenCache = null;

async function getSpeechConfig() {
  if (!tokenCache || Date.now() - tokenCache.time > 9 * 60 * 1000) {
    const response = await fetch("/api/speech-token");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not get a speech token");
    }
    tokenCache = { token: data.token, region: data.region, time: Date.now() };
  }
  return SpeechSDK.SpeechConfig.fromAuthorizationToken(tokenCache.token, tokenCache.region);
}

// ---- Speech output: the calculator speaks ----

// Each text is synthesized once and reused ("Five" is needed many times)
const audioCache = new Map();

function synthesize(text) {
  if (!audioCache.has(text)) {
    const audio = getSpeechConfig().then((config) => new Promise((resolve, reject) => {
      config.speechSynthesisVoiceName = VOICE_NAME;
      config.speechSynthesisOutputFormat = SpeechSDK.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
      // No audio output device: keep the audio in memory and play it in order with playAudio()
      const synthesizer = new SpeechSDK.SpeechSynthesizer(config, null);
      synthesizer.speakTextAsync(
        text,
        (result) => {
          synthesizer.close();
          if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            resolve(result.audioData);
          } else {
            reject(new Error(result.errorDetails || "Speech synthesis failed"));
          }
        },
        (err) => {
          synthesizer.close();
          reject(new Error(err));
        },
      );
    }));
    audioCache.set(text, audio);
    audio.catch(() => audioCache.delete(text)); // try again next time
  }
  return audioCache.get(text);
}

// The microphone must not take the calculator's own voice as a command
let speaking = false;
let speakingEndedAt = 0;
let playQueue = Promise.resolve();

function playAudio(data) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([data], { type: "audio/wav" }));
    const player = new Audio(url);
    const done = () => {
      URL.revokeObjectURL(url);
      speaking = false;
      speakingEndedAt = Date.now();
      resolve();
    };
    speaking = true;
    player.onended = done;
    player.onerror = done;
    player.play().catch(done);
  });
}

function speak(text) {
  const audio = synthesize(text); // starts now, while earlier words may still be playing
  playQueue = playQueue.then(async () => {
    try {
      await playAudio(await audio);
    } catch (err) {
      showVoiceStatus(err.message);
    }
  });
}

// ---- Speech input: voice commands ----

let recognizer = null;

// "five plus two is" -> ["five", "plus", "two", "is"]
function spokenWords(result) {
  // The lexical form keeps numbers as words ("five"), unlike the display text ("5")
  const details = JSON.parse(result.json);
  const lexical = details.NBest?.[0]?.Lexical ?? result.text;
  return lexical.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/);
}

function setListening(listening) {
  micButton.classList.toggle("listening", listening);
  micButton.setAttribute("aria-pressed", String(listening));
  showVoiceStatus(listening
    ? 'Listening... say, for example: "five plus two is"'
    : 'Press the microphone and say, for example: "five plus two is"');
}

async function startListening() {
  const config = await getSpeechConfig();
  config.speechRecognitionLanguage = "en-US";
  config.outputFormat = SpeechSDK.OutputFormat.Detailed;
  // End each phrase after a short pause so commands run quickly
  config.setProperty(SpeechSDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "500");

  recognizer = new SpeechSDK.SpeechRecognizer(config, SpeechSDK.AudioConfig.fromDefaultMicrophoneInput());

  // Tell the recognizer which words to expect
  const phraseList = SpeechSDK.PhraseListGrammar.fromRecognizer(recognizer);
  phraseList.addPhrases([...Object.values(KEY_WORDS), "Is"]);

  recognizer.recognized = (_, event) => {
    if (event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
      return;
    }
    // Skip what the microphone heard while (or right after) the calculator was speaking
    if (speaking || Date.now() - speakingEndedAt < 1000) {
      return;
    }
    const keys = spokenWords(event.result).map((word) => VOICE_COMMANDS[word]).filter(Boolean);
    showVoiceStatus(`Heard: "${event.result.text}"`);
    enqueueKeys(keys, false);
  };

  recognizer.canceled = (_, event) => {
    stopListening();
    if (event.reason === SpeechSDK.CancellationReason.Error) {
      showVoiceStatus(`Microphone stopped: ${event.errorDetails}`);
    }
  };

  await new Promise((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(resolve, (err) => reject(new Error(err)));
  });
  setListening(true);
}

function stopListening() {
  if (!recognizer) {
    return;
  }
  const stopping = recognizer;
  recognizer = null;
  setListening(false);
  stopping.stopContinuousRecognitionAsync(() => stopping.close(), () => stopping.close());
}

micButton.addEventListener("click", async () => {
  if (recognizer) {
    stopListening();
    return;
  }
  micButton.disabled = true;
  try {
    await startListening();
  } catch (err) {
    recognizer?.close();
    recognizer = null;
    showVoiceStatus(err.message);
  } finally {
    micButton.disabled = false;
  }
});
