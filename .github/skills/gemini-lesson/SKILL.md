---
name: gemini-lesson
description: 'Use when the user says new lesson, next lesson, create lesson, paste lesson info, course topic, Gemini API lesson, system prompt lesson, or asks to generate/update lesson files. Creates the next lesson file in lessons/, uses only GEMINI_API_KEY and @google/genai, updates package.json scripts and README.md, validates errors, and explains run/git commands.'
argument-hint: 'Paste the lesson topic or course notes'
---

# Gemini Lesson Workflow

Use this skill when the user is learning API course topics and wants each topic saved as a separate lesson file.

## Project Rules

- Use Node.js ES modules.
- Use Gemini only: `@google/genai`.
- Use only `GEMINI_API_KEY` from `.env`.
- Do not use Claude, Anthropic, OpenAI, or other API keys unless the user explicitly changes this project rule.
- Store lesson files in `lessons/`.
- Use numbered filenames:
  - `01-gemini-chat.js`
  - `02-system-prompt.js`
  - `03-topic-name.js`
- Use kebab-case for topic names.
- Preserve older lesson files. Never overwrite older lesson files unless the user explicitly asks.

## Workflow

When the user pastes a new lesson topic or says to create the next lesson:

1. Inspect the project:
   - List `lessons/`.
   - Read `package.json`.
   - Read `README.md` if it exists.
   - Read the newest similar lesson file for style.

2. Decide the next lesson number:
   - Find the highest existing lesson number.
   - Add 1.
   - Format with two digits, for example `03`.

3. Decide the lesson filename:
   - Infer a short topic name from the user's lesson notes.
   - Convert it to kebab-case.
   - Example: `Temperature and Max Tokens` → `03-temperature-max-tokens.js`.

4. Create the new lesson file:
   - Use Gemini chat CLI style.
   - Include `import "dotenv/config";`.
   - Include `GoogleGenAI` from `@google/genai`.
   - Check `process.env.GEMINI_API_KEY`.
   - Use `const model = "gemini-flash-latest";` unless the user asks otherwise.
   - Include helper functions when useful:
     - `addUserMessage(messages, text)`
     - `addAssistantMessage(messages, text)`
     - `chat(...)`
   - Match the lesson topic in the code.
   - Keep code beginner-friendly and readable.
   - Add short comments only where useful for learning.

5. Update `package.json`:
   - Add a script for the new lesson:
     - `"lesson:03": "node lessons/03-topic-name.js"`
   - Keep existing scripts.
   - Do not add non-Gemini dependencies unless required and approved.

6. Update `README.md`:
   - Add the new lesson file to the project structure.
   - Add the new run command.
   - Add or update a short explanation for the new lesson.
   - Keep environment variables limited to:
     - `GEMINI_API_KEY=your_gemini_key_here`

7. Validate:
   - Check editor errors for changed files.
   - Search for forbidden references:
     - `Claude`
     - `Anthropic`
     - `ANTHROPIC_API_KEY`
     - `@anthropic-ai/sdk`
   - If found, remove them unless the user explicitly requested them.

8. Final response:
   - Summarize created/updated files.
   - Give the run command, for example:
     - `npm run lesson:03`
   - Give Git commands:
     - `git add .`
     - `git commit -m "Add lesson 03 topic name"`
     - `git push`

## Standard Gemini CLI Lesson Template

Use this structure as the default starting point, adapting the config and prompt for the lesson topic:

```javascript
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
}

const ai = new GoogleGenAI({ apiKey });
const model = "gemini-flash-latest";

function addUserMessage(messages, text) {
  messages.push({ role: "user", parts: [{ text }] });
}

function addAssistantMessage(messages, text) {
  messages.push({ role: "model", parts: [{ text }] });
}

async function chat(messages) {
  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config: {
      maxOutputTokens: 1000,
    },
  });

  return response.text;
}

async function main() {
  const messages = [];
  const rl = createInterface({ input, output });

  console.log("Lesson XX: Topic Name");
  console.log("Type \"exit\" to quit.\n");

  while (true) {
    const userInput = await rl.question("You: ");

    if (userInput.trim().toLowerCase() === "exit") {
      break;
    }

    addUserMessage(messages, userInput);

    const answer = await chat(messages);
    addAssistantMessage(messages, answer);

    console.log(`Bot: ${answer}\n`);
  }

  rl.close();
}

main().catch(console.error);
```

## System Prompt Pattern for Gemini

For system prompt lessons, use Gemini `config.systemInstruction`:

```javascript
async function chat(messages, systemInstruction) {
  const config = {
    maxOutputTokens: 1000,
  };

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config,
  });

  return response.text;
}
```
