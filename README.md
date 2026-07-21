# Gemini API Lessons

This project keeps each course topic in a separate file so earlier lessons stay easy to review.

## Project structure

```text
lessons/
  01-gemini-chat.js
  02-system-prompt.js
  03-temperature.js
  04-response-streaming.js
  05-structured-data.js
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

Run lesson 3, Temperature:

```bash
npm run lesson:03
```

Run lesson 4, Response Streaming:

```bash
npm run lesson:04
```

Run lesson 5, Structured Data:

```bash
npm run lesson:05
```

You can also run files directly:

```bash
node lessons/01-gemini-chat.js
node lessons/02-system-prompt.js
node lessons/03-temperature.js
node lessons/04-response-streaming.js
node lessons/05-structured-data.js
```

## Environment variables

Create a `.env` file locally. Do not push it to GitHub.

```env
GEMINI_API_KEY=your_gemini_key_here
```

## Lesson 02: System Prompt

This lesson uses a system prompt with Gemini to make the assistant act like a patient math tutor. Instead of immediately giving direct answers, it gives hints, asks guiding questions, and walks the student through the problem step by step.

## Lesson 03: Temperature

This lesson adds a `temperature` setting to Gemini requests. It shows how low temperature values make responses more predictable, while high temperature values make responses more varied and creative.

## Lesson 04: Response Streaming

This lesson uses Gemini response streaming to print the assistant's answer chunk by chunk as it is generated. It also stores the complete streamed response in the conversation history so the chat can continue with context.

## Lesson 05: Structured Data

This lesson uses assistant message prefilling and stop sequences with Gemini to generate clean structured data. It asks for AWS EventBridge rules as JSON, preloads the assistant response with a JSON markdown fence, stops generation before the closing fence, trims the result, and parses it with `JSON.parse`.
