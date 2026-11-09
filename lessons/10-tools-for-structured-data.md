# Lesson 10: Tools for Structured Data

Use a function declaration as an output contract: the model fills the function's
arguments with extracted information, and your application validates and consumes
those arguments. Here the output is an event record with `title`, `date_text`,
`location`, and `attendees`.

## Run

From the repository root, using Node.js 20 or newer:

```bash
npm run lesson:10 -- --preview
npm run lesson:10
```

Preview prints a schema, a hand-written model response, and the record obtained
by running the real validator. It needs no API key and makes no network calls.
Live mode uses the existing `GEMINI_API_KEY` and `gemini-flash-latest`. Enter a
single event description per line and type `exit` to quit. Each description is
an independent request; there is no conversation history. No files are written.

Try: `Project review tomorrow in Room 3 with Maya and Lin.`
The requested output preserves `tomorrow` rather than resolving it to a date.
Missing string fields use `""`; missing attendees use `[]`. A required key means
the key must exist, not that the source must contain a value for it.

## How extraction works

1. `eventSchema` defines the record as function parameters using
   `parametersJsonSchema`. The declaration is named `extract_event`.
2. `extractEvent` sends source text as a user message with the declaration and
   `config.toolConfig.functionCallingConfig`. The mode is `ANY` and
   `allowedFunctionNames` contains only `extract_event`. This requests function
   calls instead of leaving the choice between prose and a call to the model.
   See the [official JavaScript SDK example](https://googleapis.github.io/js-genai/).
3. `eventFromResponse` checks the finish reason, searches all model parts for
   function calls, and requires exactly one call with the expected name. Forced
   calling alone does not guarantee exactly one call or a usable response.
4. `validateEvent` checks exact keys, field types, and attendee entries before
   returning a plain object. `functionCall.args` is already an object; do not
   run `JSON.parse` on it. `JSON.stringify` only formats the console output.

There is deliberately no JavaScript `extract_event` function to execute. The
function arguments are the result of this one-request extraction. No tool
result or second model request is needed because this example stops here.
If you instead continue a tool conversation, preserve the full model response
and return matching function results before asking the model to continue.

## Compare with earlier lessons

Lessons 05 and 06 use response prefilling and stop sequences, then parse generated
JSON text. This lesson reads structured arguments from a function call. Lessons
08 and 09 execute real tool functions and return their results to the model;
this lesson uses the declaration solely to collect a structured record.

Gemini also offers a separate structured-output API for JSON responses; it is
another approach, described in the [structured output guide](https://ai.google.dev/gemini-api/docs/structured-output).
This episode practices extraction through function calling.

A valid shape does not establish factual accuracy. The local validator does not
prove that a title or attendee came from the source. Review live outputs against
their source text. The system instruction asks for original date wording and
missing-value markers so the model need not guess a year or time zone. Nothing
is scheduled and no reminders are created.

## Offline checks

```bash
node --check lessons/10-tools-for-structured-data.js
node --test tests/10-tools-for-structured-data.test.js
```

The tests use fake model responses to check extraction from mixed parts, missing
values, malformed records, duplicate or wrong calls, incomplete responses, the
forced-call configuration, and the absence of a follow-up request. If your
environment blocks the test runner's child process, run
`node tests/10-tools-for-structured-data.test.js` directly. These checks do not
establish live API availability or model accuracy.
