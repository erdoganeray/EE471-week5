# EE471 – Week 5 In-Class Exercise

EE 471 Modern Software Development Practices and Technologies, Izmir Institute of Technology.

| Folder | Task |
|---|---|
| `Week-5-Task-1/` | Speech-studio website (Flask + Azure Speech): text-to-speech & speech-to-text |
| `Week-5-Task-2/` | Voice-activated calculator |

## Setup

1. Clone the repository.
2. Create your local secrets file from the template and fill in your own Azure Speech key and region:
   ```bash
   cp .env.example .env
   ```
   `.env` is listed in `.gitignore`, so it never gets pushed.
3. Create a virtual environment and install the requirements of the task you want to run:
   ```bash
   python -m venv .venv
   ```
   ```bash
   pip install -r Week-5-Task-1/requirements.txt
   ```

## Branches (Task 1)

| Branch | Feature |
|---|---|
| `text-to-speech` | Text → audio file |
| `speech-to-text` | Audio / microphone → text |

The two features are developed on separate branches, as two developers would.
The `speech-to-text` branch was created from the initial commit, before the text-to-speech code existed,
so merging it into `main` afterwards produces the merge conflicts that Part 3 of the exercise asks to resolve.
