# Week 5 – Task 2: Vibe Coding Prompts

Prompts given to the AI coding assistant while building the voice-activated calculator.
Each entry is a plain-English summary of what was asked, not a verbatim copy.

## Eray

### 1. Plan the voice calculator
> Look at my Week 4 web calculator and my Mini Project 1 `Calculator` class, then explain step by step how you will
> turn it into a voice-activated calculator for Task 2. Keep the scope to what the exercise asks.

### 2. Reuse the earlier projects
> Add Mini Project 1 to this repository as a Git submodule, like in Week 4, and start Task 2 from the Week 4
> calculator files. Order the third keypad row as 1 2 3, as in the exercise picture.

### 3. Microphone button for voice commands
> Add a round microphone button on the left of the calculator. When pressed, listen with Azure speech-to-text and
> turn each spoken word from the command table (zero to nine, point, over, times, plus, minus, is) into the matching
> key press. Do not send the Azure key to the browser: let the Flask server hand out a short-lived token instead.

### 4. Speaking buttons
> Make every button speak its word with Azure text-to-speech, and say the result after "=", for example
> "Three", "plus", "five", "is eight". When the input comes from the microphone, only say the result, and make sure
> the microphone does not pick up the calculator's own voice as a command.

### 5. Test, document and push
> Test the four example calculations with the buttons and the voice command parsing, update the README
> (including setup steps for anyone who clones the repository), and push everything to GitHub.
