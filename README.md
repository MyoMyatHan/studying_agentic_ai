# Gemini API Lessons

This project keeps each course topic in a separate file so earlier lessons stay easy to review.

## Project structure

```text
lessons/
  01-gemini-chat.js
  02-system-prompt.js
```

## Install dependencies

```bash
npm install
```

## Run lessons

Run lesson 1:

```bash
npm run lesson:01
```

Run lesson 2, System Prompt:

```bash
npm run lesson:02
```

You can also run files directly:

```bash
node lessons/01-gemini-chat.js
node lessons/02-system-prompt.js
```

## Environment variables

Create a `.env` file locally. Do not push it to GitHub.

```env
GEMINI_API_KEY=your_gemini_key_here
```

## Lesson 02: System Prompt

This lesson uses a system prompt with Gemini to make the assistant act like a patient math tutor. Instead of immediately giving direct answers, it gives hints, asks guiding questions, and walks the student through the problem step by step.
