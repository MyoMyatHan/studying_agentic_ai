# Gemini API Lessons

This project keeps each course topic in a separate file so earlier lessons stay easy to review.

## Working with AI agents

Read [AGENTS.md](AGENTS.md) for project conventions, the lesson workflow, and validation commands. The [Gemini lesson skill](.github/skills/gemini-lesson/SKILL.md) provides a detailed workflow and starter template for lesson work.

## Project structure

```text
lessons/
  01-gemini-chat.js
  02-system-prompt.js
  03-temperature.js
  04-response-streaming.js
  05-structured-data.js
  06-prompt-evaluation-dataset.js
  07-prompt-engineering.js
  07-prompt-engineering.md
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

Run lesson 6, Prompt Evaluation Dataset:

```bash
npm run lesson:06
```

Run lesson 7, Prompt Engineering (preview first, then live evaluation):

```bash
npm run lesson:07 -- --preview
npm run lesson:07
```

You can also run files directly:

```bash
node lessons/01-gemini-chat.js
node lessons/02-system-prompt.js
node lessons/03-temperature.js
node lessons/04-response-streaming.js
node lessons/05-structured-data.js
node lessons/06-prompt-evaluation-dataset.js
node lessons/07-prompt-engineering.js
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

## Lesson 06: Prompt Evaluation Dataset

This lesson uses Gemini to generate a small evaluation dataset for testing prompts that produce AWS-specific Python code, JSON configuration, or regular expressions. It uses assistant message prefilling and stop sequences to get clean JSON, parses the dataset with `JSON.parse`, and saves it to `dataset.json`.

## Lesson 07: Prompt Engineering

This lesson follows the cycle of setting a goal, writing a baseline prompt, evaluating it, applying a technique, and re-evaluating. The current episode, **Structure with XML Tags**, compares the specific meal-plan prompt with the same prompt wrapping athlete data in `<athlete_information>` tags. The opening and six output guidelines stay unchanged. Use `--being-specific` to revisit the output-guidelines experiment or `--clear-and-direct` for the opening-line experiment. A local `PromptEvaluator` generates three synthetic athlete cases and compares each pair with identical inputs and the same rubric. Each live run saves experiment metadata, responses, scores, feedback, and an HTML report under `output/lesson-07/`; subsequent runs reuse the saved dataset. The first three-case run makes 13 application-level Gemini requests, and later runs make 12 before any retries.

Read the [lesson 07 walkthrough](lessons/07-prompt-engineering.md) when reviewing the process. Use `npm run lesson:07 -- --preview` to inspect the prompts without API calls, or `npm run lesson:07 -- --generate-dataset` to explicitly replace this lesson's cases. Run offline checks with `node --test tests/07-prompt-engineering.test.js`. Model scores are approximate, and improved scores are not guaranteed.
