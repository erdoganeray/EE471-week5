# EE471 – Week 5 In-Class Exercise

EE 471 Modern Software Development Practices and Technologies, Izmir Institute of Technology.

| Path | Content |
|---|---|
| `Week-5-Task-1/` | Speech-studio website (Flask + Azure Speech): text-to-speech & speech-to-text |
| `Week-5-Task-2/` | Voice-activated calculator |
| `EE471_MP1_Calculator/` | [Mini Project 1](https://github.com/erdoganeray/EE471_MP1_Calculator), included as a Git submodule (used by Task 2) |

## Setup

1. Clone the repository together with the submodule:
   ```bash
   git clone --recurse-submodules https://github.com/erdoganeray/EE471-week5.git
   ```
   If it was already cloned without it:
   ```bash
   git submodule update --init
   ```
2. Get an Azure Speech key (see [below](#getting-an-azure-speech-key)).
3. Create your local secrets file from the template and fill in your key and region:
   ```bash
   cp .env.example .env
   ```
   `.env` is listed in `.gitignore`, so it never gets pushed.
4. Create a virtual environment in the repository root, activate it, and install the requirements of the task you want to run:
   ```bash
   python -m venv .venv
   ```
   ```bash
   .venv\Scripts\activate
   ```
   (macOS/Linux: `source .venv/bin/activate`)
   ```bash
   pip install -r Week-5-Task-1/requirements.txt
   ```

### Getting an Azure Speech key

1. Sign in to https://portal.azure.com (students: [Azure for Students](https://azure.microsoft.com/free/students) gives free credit without a credit card).
2. Search for **Speech services** and click **+ Create**.
3. Choose a resource group, a **region**, a unique name and the **Free F0** pricing tier, then **Review + create**.
   - Student subscriptions only allow some regions. If you get `RequestDisallowedByAzure`, open **Policy → Assignments → Allowed resource deployment regions → Parameters** to see the allowed ones (e.g. `francecentral`, `swedencentral`).
4. Open the resource → **Keys and Endpoint**. Put **KEY 1** into `SPEECH_KEY` and **Location/Region** (lowercase, no spaces, e.g. `francecentral`) into `SPEECH_REGION`.

Never put the key in code, commits or screen recordings.

## Task 1: Speech-studio website

```bash
cd Week-5-Task-1
python app.py
```

Then open http://127.0.0.1:5000 in Chrome or Edge. Prompts are in [PROMPTS.md](Week-5-Task-1/PROMPTS.md).

| Tab | What it does | API |
|---|---|---|
| **Text to Speech** | Type text → play or download the generated WAV file | `POST /api/synthesize` with `{"text": "..."}` → `audio/wav` |
| **Speech to Text** | Record with the microphone or choose a 16-bit PCM WAV file (mono or stereo) → transcription with a copy button | `POST /api/transcribe` with form field `audio` → `{"text": "..."}` |
| **Diarization** | Live microphone or WAV file → who said what, as colored speaker bubbles with timestamps, talk time per speaker and a `.txt` download | Browser SDK `ConversationTranscriber` |
| **Translation** | Speak English or Turkish → live translation into Turkish, English, German, French and/or Spanish; 🔊 plays a translation with the Text to Speech backend | Browser SDK `TranslationRecognizer` |
| **Pronunciation** | Read a sample or custom sentence (live or WAV) → pronunciation, accuracy, fluency, completeness and prosody scores; words colored by error type, click a word to hear it | Browser SDK `PronunciationAssessmentConfig` |

Errors are returned as `{"error": "<message>"}` and shown on the page.

The first two tabs send the audio to Flask, which calls the Python Speech SDK. The Part 4 tabs (diarization,
translation, pronunciation) run the [Speech SDK for JavaScript](https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk)
in the browser so results appear in real time; `GET /api/speech-token` gives the browser a 10-minute token,
so the secret key never leaves the server. WAV files work best as 16 kHz, 16-bit mono.

### Branches

| Branch | Feature |
|---|---|
| `text-to-speech` | Text → audio file |
| `speech-to-text` | Audio / microphone → text |
| `advanced-features` | Part 4: diarization, translation, pronunciation assessment |

The two features are developed on separate branches, as two developers would.
The `speech-to-text` branch was created from the initial commit, before the text-to-speech code existed,
so merging it into `main` afterwards produces the merge conflicts that Part 3 of the exercise asks to resolve.

## Task 2: Voice-activated calculator

The Week 4 web calculator (Flask + the Mini Project 1 `Calculator` class) with a microphone button and a voice.

```bash
pip install -r Week-5-Task-2/requirements.txt
cd Week-5-Task-2
python app.py
```

Then open http://127.0.0.1:5000 in Chrome or Edge and allow microphone access. Prompts are in [PROMPTS.md](Week-5-Task-2/PROMPTS.md).

- **Microphone button → voice commands:** press it and say e.g. "five plus two is". Each word presses the matching key; the calculator then says the result ("is seven"). Press it again to stop.
- **Buttons → voice:** every key press is spoken, e.g. `3 + 5 =` says "Three", "Plus", "Five", "is eight".

| Key | 0–9 | . | ÷ | x | + | - | = |
|---|---|---|---|---|---|---|---|
| Word | Zero–Nine | Point | Over | Times | Plus | Minus | Is |

| File | Purpose |
|---|---|
| `app.py` | Flask server: the page, `POST /api/calculate`, and `GET /api/speech-token`, which trades the secret key for a 10-minute Azure token so the key never reaches the browser |
| `web_calculator.py` | `WebCalculator` from Week 4, extending the Mini Project 1 `Calculator` (unchanged) |
| `static/script.js` | Calculator logic, speech recognition (voice commands) and speech synthesis (speaking keys) with the Azure Speech SDK for JavaScript |
| `static/index.html`, `style.css` | Calculator page with the microphone button |
