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
  08-tool-functions-and-schemas.js
  08-tool-functions-and-schemas.md
  09-batch-tool.js
  09-batch-tool.md
  10-tools-for-structured-data.js
  10-tools-for-structured-data.md
  11-streaming-tool-calls.js
  11-streaming-tool-calls.md
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

Run lesson 8, Tool Functions and Schemas (offline preview, then live chat):

```bash
npm run lesson:08 -- --preview
npm run lesson:08
```

Run lesson 9, The Batch Tool (offline preview, then live chat):

```bash
npm run lesson:09 -- --preview
npm run lesson:09
```

Run lesson 10, Tools for Structured Data (offline preview, then live extraction):

```bash
npm run lesson:10 -- --preview
npm run lesson:10
```

Run lesson 11, Streaming Tool Calls (offline preview, then live chat):

```bash
npm run lesson:11 -- --preview
npm run lesson:11
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
node lessons/08-tool-functions-and-schemas.js
node lessons/09-batch-tool.js
node lessons/10-tools-for-structured-data.js
node lessons/11-streaming-tool-calls.js
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

This lesson follows the cycle of setting a goal, writing a baseline prompt, evaluating it, applying a technique, and re-evaluating. The current episode, **Providing Examples**, compares the XML meal-plan prompt with the same prompt plus one labeled input/output example; `--multi-shot` compares it with two examples. The hand-written examples include explanations of their useful qualities and are separate from evaluation cases. Use `--xml-tags`, `--being-specific`, or `--clear-and-direct` to revisit earlier episodes. A local `PromptEvaluator` generates three synthetic athlete cases and compares each pair with identical inputs and the same rubric. Each live run saves experiment metadata, responses, scores, feedback, and an HTML report under `output/lesson-07/`; subsequent runs reuse the saved dataset. The first three-case run makes 13 application-level Gemini requests, and later runs make 12 before any retries; examples increase input tokens rather than request count.

Read the [lesson 07 walkthrough](lessons/07-prompt-engineering.md) when reviewing the process. Use `npm run lesson:07 -- --preview` to inspect the prompts without API calls, or `npm run lesson:07 -- --generate-dataset` to explicitly replace this lesson's cases. Run offline checks with `node --test tests/07-prompt-engineering.test.js`. Model scores are approximate, and improved scores are not guaranteed.

## Lesson 08: Tool Functions and Schemas

This lesson gives Gemini three JavaScript tools: read the clock, add whole UTC days, and save a reminder. `chat` returns a complete model message from one API request; `runConversation` handles repeated tool calls, and `textFromMessage` extracts visible text. Message helpers preserve mixed parts and thought signatures, results match call IDs, and every follow-up request includes all tool declarations. Try "Save a reminder for my doctor's appointment 177 days after January 1, 2050, at 09:00 UTC" to calculate June 27, 2050 and save it locally. Missing times or time zones require clarification. Use your existing `GEMINI_API_KEY`; no additional dependencies are needed.

The loop detects `functionCall` parts, checks Gemini finish reasons for incomplete responses, and displays intermediate explanations and the final answer once. A `runTool` router handles registered functions; failed calls still return matching error results alongside successful calls in the same batch.

Read the [lesson 08 walkthrough](lessons/08-tool-functions-and-schemas.md). Preview without API calls using `npm run lesson:08 -- --preview`, or start chat with `npm run lesson:08` and type `exit` to quit. Run offline checks with `node --test tests/08-tool-functions-and-schemas.test.js`.

Reminders persist in the Git-ignored `output/lesson-08/reminders.json`. List them with `npm run lesson:08 -- --list-reminders`, or display due items with `npm run lesson:08 -- --check-reminders`; both work without an API key. There are no background notifications. Preview never saves reminders, and tests use temporary stores. A successful save survives a later API failure; identical text/time retries reuse the existing reminder.

## Lesson 09: The Batch Tool

This lesson exposes a `run_batch` function to Gemini to group independent product and shipping lookups. It uses fictional local shop data, validates JSON arguments, runs async lookups with `Promise.all`, and returns ordered successes and errors together. Dependent calls still need separate rounds. No files are generated and no dependencies are added.

Read the [lesson 09 walkthrough](lessons/09-batch-tool.md). Run `npm run lesson:09 -- --preview` without API calls, or `npm run lesson:09` for live chat using your existing key. Run offline checks with `node --test tests/09-batch-tool.test.js`.

## Lesson 10: Tools for Structured Data

This lesson extracts an event record through a function declaration. It requests `extract_event` using `ANY` mode with `allowedFunctionNames`, validates the returned arguments, and prints JSON. Each input is independent; missing fields use empty strings or arrays and date wording stays unchanged. No tool action is executed, no follow-up request is made, and no files are written.

Read the [lesson 10 walkthrough](lessons/10-tools-for-structured-data.md). Use `npm run lesson:10 -- --preview` offline, or `npm run lesson:10` for live extraction. Run offline checks with `node --test tests/10-tools-for-structured-data.test.js`.

## Lesson 11: Streaming Tool Calls

This lesson streams visible Gemini text, retains complete model parts and thought signatures, then validates and executes a read-only word-count tool after a successful stream finishes. It returns matching function results and streams the follow-up answer. It expects complete argument objects; incremental argument streaming is unsupported by the installed SDK for this API setup. No dependencies or generated files are added.

Read the [lesson 11 walkthrough](lessons/11-streaming-tool-calls.md). Run `npm run lesson:11 -- --preview` offline, or `npm run lesson:11` for live chat. Run offline checks with `node --test tests/11-streaming-tool-calls.test.js`.
