# Week 5 – Task 1: Vibe Coding Prompts

Prompts given to the AI coding assistant while building the speech-studio website.
Each entry is a plain-English summary of what was asked, not a verbatim copy.

## Part 1: Text-to-speech (`text-to-speech` branch)

### 1. Understand the assignment
> Read the Week 5 in-class exercise PDF and explain what needs to be done in each task.

### 2. Plan the work
> Text-to-speech and speech-to-text will be built on separate branches, as if by two developers. Start with
> text-to-speech. Before writing any code, explain step by step what you will do. Keep the scope small, and set
> things up so that merging the two branches later produces a merge conflict.

### 3. Set up the repository
> Initialize the repository. Add a `.env` file for the Azure Speech key and region, but push only a `.env.example`
> template so anyone who clones the repository can fill in their own keys. Make sure `.gitignore` excludes `.env`.
> Create a `PROMPTS.md` in each task folder, and push an empty `speech-to-text` branch for the second feature.

### 4. Build the text-to-speech website
> On a `text-to-speech` branch, build a Flask website that runs on localhost. The user types text, clicks
> "Synthesize Speech", and the backend converts it to a WAV file with Azure Speech. The page should play the
> audio, offer a download button, and have a "Clear" button. Show clear error messages if the key is missing.

### 5. Get the Azure keys
> Explain where and how to get the Azure Speech key and region for the `.env` file. The region I picked was
> rejected by my student subscription's policy; how do I find a region I am allowed to use?

### 6. Test and merge
> I filled in `.env`. Restart the server and test text-to-speech end to end in the browser.
> If it works, commit it, push the `text-to-speech` branch, and merge it into `main`.

## Part 2: Speech-to-text (`speech-to-text` branch)

_Not started yet._
