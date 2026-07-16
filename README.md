# Gemini / Claude API Lessons

This project keeps each course topic in a separate file so earlier lessons stay easy to review.

## Project structure

```text
lessons/
  01-gemini-chat.js
  02-claude-basic.js
```

## Run lessons

Run lesson 1:

```bash
npm run lesson:01
```

Run lesson 2:

```bash
npm run lesson:02
```

You can also run files directly:

```bash
node lessons/01-gemini-chat.js
node lessons/02-claude-basic.js
```

## Environment variables

Create a `.env` file locally. Do not push it to GitHub.

```env
GEMINI_API_KEY=your_gemini_key_here
ANTHROPIC_API_KEY=your_claude_key_here
```
