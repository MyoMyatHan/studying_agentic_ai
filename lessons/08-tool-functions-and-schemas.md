# Lesson 08: Tool Functions and Schemas

This starts the reminder project with JavaScript and Gemini. A model cannot read
your computer's clock or create a reminder just by promising to do so. Tools give
it access to code that can provide data or perform an action.

The project has three steps:

| Tool | Purpose | In this lesson? |
| --- | --- | --- |
| `get_current_datetime` | Read an exact current time reference. | Implemented, declared, and connected to chat. |
| `add_duration_to_datetime` | Add whole UTC days and return the resulting date and weekday. | Implemented and connected to the conversation loop. |
| `set_reminder` | Save a future reminder for local due checks. | Implemented with JSON storage and CLI list/check commands. |

Start with the clock, calculate a future date, and save a reminder using the
calculated timestamp. Reminders persist in `output/lesson-08/reminders.json`.
Run the due-check command to display them when due. This standalone CLI has no
background scheduler or desktop, email, or push notification delivery; the tool
result and system instruction make that delivery limit explicit.

## Run it

Use Node.js 20 or newer and run commands from the repository root. Install the
locked dependencies with `npm ci` if needed. No new packages are required.

Inspect the schema, direct function results, a validation error, and a complete
multi-part conversation and a sequential two-tool conversation offline. The
preview uses hand-written model messages and real local tool results; it does
not contact Gemini:

```bash
npm run lesson:08 -- --preview
```

The preview also calculates the appointment date from the course example. It
does not execute `set_reminder` or create/modify a reminder file.

For live chat, use your Gemini API key from Google AI Studio in the local `.env`:

```env
GEMINI_API_KEY=your_gemini_key_here
```

```bash
npm run lesson:08
```

List saved reminders or display those whose UTC timestamp has passed. These
commands work without an API key and do not modify the file:

```bash
npm run lesson:08 -- --list-reminders
npm run lesson:08 -- --check-reminders
```

Due reminders are shown again on subsequent checks; there is no delivered flag.
Saving through `set_reminder` writes the file. It is ignored by Git, along with
temporary files used while saving. Run one local lesson process at a time when
saving reminders.

The lesson uses the existing `@google/genai` dependency and
`gemini-flash-latest` model with your key. A key on Gemini's free tier can be used
subject to model availability and its quota; this example does not bypass rate
limits. Each tool round trip makes another Gemini request. A normal clock question
typically takes two requests, with a limit of five requests per user turn.
A question that needs the clock followed by date arithmetic typically takes
three requests: one for each tool request and one for the final answer.
Adding a reminder after those two tools typically takes four requests. Calculating
from a supplied date and then saving generally takes three requests.

Try these requests, then type `exit`:

- `What is the current date and time?`
- `Give me today's date in UTC, without the time.`
- `What time is it in UTC? Use 24-hour time.`
- `What is today's date and the exact time as HH:MM:SS in UTC?`
- `What day is 103 days from today in UTC?`
- `Set a reminder for a week from Thursday.` (Supply the time and time zone when asked.)
- `Save a reminder for my doctor's appointment 177 days after January 1, 2050, at 09:00 UTC.`

## 1. Write an ordinary JavaScript function

`get_current_datetime` reads `new Date()` and returns an object containing
`datetime`, `date_format`, and `time_zone`. It accepts an optional argument object:

```javascript
get_current_datetime();
get_current_datetime({ date_format: "date" });
get_current_datetime({ date_format: "time" });
```

JavaScript does not have a built-in `strftime` method. This lesson instead offers
three explicit formats: `iso` (the default), `date`, and `time`. For an illustrative
instant of `2026-10-20T08:30:00.000Z`, the results would be:

| `date_format` | `datetime` |
| --- | --- |
| `iso` | `2026-10-20T08:30:00.000Z` |
| `date` | `2026-10-20` |
| `time` | `08:30:00` |

All three use UTC. `Z` marks UTC in an ISO timestamp. The computer's clock must be
correct, and UTC may have a different calendar date from the user's local zone.
The reminder assistant must resolve the user's time zone and clarify
ambiguous dates or missing times before saving a reminder.

Descriptive names and runtime validation matter. The function rejects null,
arrays, unknown parameters, non-string formats, empty strings, and unsupported
formats. A useful error says what to fix: `Unsupported date_format. Use iso,
date, or time.` A schema guides the model; the JavaScript function still checks
what it receives.

### Add a second tool for date arithmetic

`add_duration_to_datetime` accepts `datetime` and `days`:

```javascript
add_duration_to_datetime({
  datetime: "2026-10-20T08:30:00.000Z",
  days: 103,
});
// { datetime: "2027-01-31T08:30:00.000Z", weekday: "Sunday", time_zone: "UTC" }
```

The input must be a canonical UTC ISO timestamp with milliseconds and `Z`.
For calculations from now, use the exact `datetime` value from the clock's `iso`
result. Date-only strings, ambiguous local timestamps, and invalid calendar
dates are rejected rather than silently normalized.

`days` must be a safe whole number. Zero preserves the instant; a negative number
subtracts days. The tool adds `days * 24 * 60 * 60 * 1000` milliseconds and returns
the resulting timestamp and weekday. JavaScript handles month boundaries, leap
days, and year boundaries. Results outside JavaScript's date range return an
error. This lesson defines a day as exactly 24 hours in UTC; local calendar-day
arithmetic across daylight-saving changes needs a separate design. It does not
yet support months, years, or fractional days.

### Add a third tool to save reminders

`set_reminder` accepts a non-empty `reminder_text` and a future `remind_at` in
canonical UTC ISO format. Unlike the read-only clock and calculator, this tool
has a side effect: it saves a record to disk.

```javascript
// This call writes a reminder when run; --preview does not execute it.
set_reminder({
  reminder_text: "Doctor's appointment",
  remind_at: "2050-06-27T09:00:00.000Z",
});
```

The result contains `status: "saved"`, a reminder with an ID, `delivery:
"local_only"`, and instructions to run the due-check command. Gemini should
confirm a local save only after receiving that successful result. It must ask
about a missing time or time zone instead of inventing a midnight appointment.

The function validates arguments before writing. It reads and preserves existing
records, writes a temporary file, then renames it into place. Malformed existing
JSON or invalid stored records cause a tool error rather than being overwritten.
Retrying the same trimmed text and exact timestamp returns the existing record
and ID, preventing duplicate saves for that combination.

## 2. Describe the tool with a schema

Read `get_current_datetime_schema` next to the function in the
[lesson source](08-tool-functions-and-schemas.js). Its description and argument
documentation are written directly in this lesson.

- `name` matches the tool name used by the dispatcher.
- `description` explains what the tool does, when to use it, what it returns,
  and its limits.
- `parametersJsonSchema` describes the argument object for the installed Gemini
  SDK: `date_format` is a string restricted by `enum` to three choices.
- `required: []` allows an empty argument object. JavaScript applies the default.
- `additionalProperties: false` tells the model not to add other parameters.

JSON Schema is a general way to describe data, rather than a tool-calling-only
format. Here it documents the input contract. The JSDoc
`import("@google/genai").FunctionDeclaration` annotation also gives compatible
editors SDK type information while keeping the source plain JavaScript. The
annotation does not perform runtime validation.

The second declaration, `add_duration_to_datetime_schema`, requires both
`datetime` (string) and `days` (integer), and explains the dependency on the clock
for relative dates. `set_reminder_schema` requires `reminder_text` and
`remind_at`, describes local persistence, and explains when to ask for missing
details. `toolSchemas` contains all three declarations so they remain available
throughout a conversation.

## 3. Let Gemini request the function

The request sends the conversation through `contents` and registers the
declaration through `config.tools`:

```javascript
const messages = [];
addUserMessage(messages, "What is the exact time, formatted as HH:MM:SS in UTC?");

const response = await ai.models.generateContent({
  model,
  contents: messages,
  config: {
    systemInstruction,
    maxOutputTokens: 1000,
    tools: [{ functionDeclarations: toolSchemas }],
  },
});
```

Gemini chooses whether to answer normally or return a structured function call.
Your Node.js application executes the function; the model does not run JavaScript
itself. This separation is the key idea in Google's
[function-calling guide](https://ai.google.dev/gemini-api/docs/function-calling).

## 4. Understand multi-part model messages

A Gemini response can contain multiple candidates. This lesson uses the first
candidate, whose `content` contains a `role` and an array called `parts`. For
example, a hand-written illustration of a model message is:

```javascript
{
  role: "model",
  parts: [
    { text: "I will read the current time." },
    {
      functionCall: {
        id: "clock-1",
        name: "get_current_datetime",
        args: { date_format: "time" },
      },
    },
  ],
}
```

The text part explains the action. The `functionCall` part gives your application
the function name and argument object, plus an ID when provided. A message can
have multiple text parts, multiple calls, or calls without introductory text.
Never assume that a tool call is always at `parts[1]`. After `chat` returns the
first candidate's complete content, `runTools` selects every part with a
`functionCall` property.

`response.text` is convenient for displaying a final answer, but it does not
contain the function-call structure. Saving only that string would lose the
context needed for a follow-up request. The complete `content` can also include
thought signatures on its parts; preserve those unchanged rather than rebuilding
the model message from extracted text and calls.

## 5. Update message helpers and preserve history

The helpers in this lesson accept more than a single string:

```javascript
addUserMessage(messages, "What time is it?");
const message = await chat(ai, messages);
addAssistantMessage(messages, message);
```

Both helpers accept text, an array of parts, or an entire content object.
`addUserMessage` assigns the user role while preserving the supplied parts,
including tool results. `addAssistantMessage` preserves complete model content.
For API responses, pass the entire model content so every part is retained.
The history role for Gemini's responses is `"model"`.

The `generateContent` calls used here send the complete conversation on every
request. The local `messages` array is what carries context between requests.
`runConversation` stages new model messages and tool results in `turnMessages`, then adds
them to the saved history once a final answer succeeds. This avoids leaving a
partial tool exchange in saved history if a request fails.
Staging history does not undo tool side effects: a reminder successfully saved
before a later API failure remains on disk. Use `--list-reminders` to inspect it;
retrying the identical text/time reuses that saved record.

## 6. Execute calls and return matching results

`functionCall.args` is already a JavaScript argument object. Our tool expects
that object, so it can be called directly:

```javascript
const output = get_current_datetime(call.args);
```

`runTool(toolName, toolInput)` routes a name to a function. A `Map` contains only
the explicitly registered implementations:

```javascript
const toolFunctions = new Map([
  ["get_current_datetime", get_current_datetime],
  ["add_duration_to_datetime", add_duration_to_datetime],
  ["set_reminder", set_reminder],
]);
```

The router looks up the function, rejects an unknown name, and calls it with the
argument object. To add a tool, write and validate the function, add its schema
to `toolSchemas`, and register its name in `toolFunctions`. The conversation
loop stays the same. The map also prevents names such as `constructor` from
resolving to inherited object properties.

`executeToolCall` calls the router inside `try/catch` and wraps its output in a
Gemini `functionResponse` part. For the illustrative clock call above, a
successful result looks like this:

```javascript
{
  functionResponse: {
    id: "clock-1",
    name: "get_current_datetime",
    response: {
      output: { datetime: "15:04:22", date_format: "time", time_zone: "UTC" },
    },
  },
}
```

The response name matches the requested function name. If Gemini supplies a call
ID, echo that exact ID in its result; if no ID is supplied, omit it. Unlike a
plain text answer, `response` is a structured JSON object, so do not stringify
the entire result when sending it to Gemini. `JSON.stringify` in the CLI is only
for printing readable diagnostics.

When validation fails, the result instead contains
`response: { error: "Unsupported date_format. Use iso, date, or time." }`.
This lesson uses the `error` key to report failure, rather than an `is_error`
field. Returning the error gives Gemini a chance to correct its arguments.
Errors keep the same function name and supplied call ID as successful results.
Both validation failures and unknown tool names produce an error result.

A single model message may request several tool calls. Execute each call and
return all results together in a user message, keeping the same call order:

```javascript
const calls = message.parts.filter((part) => part.functionCall).map((part) => part.functionCall);
const resultParts = calls.map((call) => executeToolCall(call));
addUserMessage(messages, resultParts);
```

Each call gets exactly one result, including calls that fail. The `try/catch`
belongs inside the per-call execution wrapper: if one call fails, later calls
in the same batch still run. Keep all success and error results together in the
same user message so Gemini can see what happened to every request.

This example runs the local tools synchronously in order. If tools later become
asynchronous, keep each result paired with its original name and ID, and retain
the original call order when building the result message.

## 7. Send the follow-up request

After sending results, the conversation has this shape:

| Order | Role | Parts |
| --- | --- | --- |
| 1 | `user` | Original question as text. |
| 2 | `model` | Full response, including any text and function calls. |
| 3 | `user` | One matching `functionResponse` part for every call. |
| 4 | `model` | Final answer using the returned data, or further tool calls. |

The follow-up request uses the same `generateContent` structure from step 3,
including the tool declaration. Keep it available on every request in the loop:
Gemini can request another tool call after seeing a result. Continue until the
response has no function calls and includes a final text answer.

Follow `runConversation`, `chat`, and `executeToolCall` in the source to trace the full cycle:

1. Send the conversation and tool declaration to Gemini.
2. Keep Gemini's full model content in history, including any thought signatures.
3. Find every `functionCall` part and dispatch only supported tool names.
4. Return each result as a `functionResponse` part in a user-role message,
   preserving the call ID when supplied. Multiple calls receive results together
   in the same order.
5. Ask Gemini to continue with the complete history and the tool declaration,
   using those results to produce its final answer or request another tool call.

Run the offline preview to inspect this four-message history as JSON, including
two distinct calls and their matching results. `buildToolFlowPreview` constructs
the model messages by hand for teaching; live `chat` preserves actual API content.

The CLI prints visible `Bot:` text from intermediate and final model messages,
plus `[Tool]` and `[Result]` lines so you can see the exchange. Tool
errors go back as `{ error: "..." }`, allowing Gemini to retry with corrected
arguments. The request limit prevents endless retries; a blocked, empty, failed,
or unfinished turn exits with an error instead of pretending to succeed.

## 8. Separate one request from the conversation loop

`chat` now makes exactly one Gemini request and returns the full model content,
rather than just a string. It accepts tool declarations and generation options:

```javascript
const message = await chat(ai, messages, {
  tools: toolSchemas,
  system: "Use the available tools for current time and date calculations.",
  temperature: 1,
  stopSequences: [],
});
```

The optional `system` maps to `config.systemInstruction`. `temperature` and
`stopSequences` are also Gemini config fields. Omitting options uses the lesson's
system instruction and all three tools; passing `tools: []` omits tools for a
text-only API call. The explicit output-token limit stays at 1000.

`textFromMessage(message)` selects all visible text parts, excludes thought
parts and tool metadata, and joins the text with newlines. Use it to display the
answer; keep the full message in history.

`runTools(message)` dispatches every requested call and returns the result parts.
`hasToolRequests(message)` checks for `functionCall` parts. This is the Gemini
adaptation of the course's `stop_reason: "tool_use"` check: Gemini does not expose
that special stop value. Its candidate-level `finishReason` describes why token
generation ended, which is a separate concern:

| Response | What the loop does |
| --- | --- |
| `finishReason: "STOP"` with function calls | Execute the calls and continue. |
| `finishReason: "STOP"` with visible text and no calls | Return the final message. |
| `MAX_TOKENS`, `SAFETY`, or another non-`STOP` finish reason | Report an incomplete response instead of using partial text or calls. |
| No content, or no calls and no visible text | Report an error. |

`chat` checks the finish reason before returning the complete content.
`runConversation` then uses `hasToolRequests` to decide whether tools need to
run. Testing only for `finishReason === "STOP"` would incorrectly end some tool
conversations. Keep finish metadata out of the history message; history retains
the original `content` object with its role and parts.

`runConversation` handles repeated requests automatically. The central pattern is:

```javascript
// Simplified teaching version; the source also stages history and checks errors.
for (let request = 0; request < 5; request++) {
  const message = await chat(ai, messages, { tools: toolSchemas });
  addAssistantMessage(messages, message);
  const text = textFromMessage(message).trim();
  if (text) {
    console.log(`Bot: ${text}`);
  }
  if (!hasToolRequests(message)) {
    return message;
  }
  addUserMessage(messages, runTools(message));
}
throw new Error("Stopped before reaching a final answer.");
```

The loop stops when there are no requested calls and visible final text is
available. It allows a maximum of five Gemini requests per user turn, rather
than running indefinitely. Each request receives the same tool declarations
and options. The full implementation exposes an optional `onMessage` callback
for displaying each model message. The CLI uses it to print intermediate
explanations and the final answer exactly once:

```javascript
await runConversation(ai, messages, {
  onMessage: (message) => {
    const text = textFromMessage(message).trim();
    if (text) {
      console.log(`Bot: ${text}`);
    }
  },
});
```

`onMessage` is a local display hook, not a Gemini API option. Only visible text
is printed; thought parts stay out of the display. Callers that omit the hook
can still use the returned final message and extract its text themselves.

## 9. Chain dependent tools across requests

For `What day is 103 days from today in UTC?`, the duration call needs the clock's
result. The model must receive that result before making the dependent call:

| Order | Role | Content |
| --- | --- | --- |
| 1 | `user` | Ask what day is 103 days from today. |
| 2 | `model` | Call `get_current_datetime` with `date_format: "iso"`. |
| 3 | `user` | Return the current UTC timestamp. |
| 4 | `model` | Call `add_duration_to_datetime` with that timestamp and `days: 103`. |
| 5 | `user` | Return the calculated timestamp and weekday. |
| 6 | `model` | Explain the resulting date and weekday to the user. |

This is different from two independent calls in one model message: the second
tool's arguments depend on the first tool's output. The application does not
guess or hard-code the future timestamp. It returns each result and lets Gemini
choose its next call. The system instruction teaches this ordering.

The offline preview includes both patterns: `buildToolFlowPreview` shows two
independent clock calls in one message, and `buildSequentialToolPreview` shows a
six-message dependent exchange. These use hand-written model messages to make
the structure inspectable without a key. The offline tests also exercise the
real `runConversation` loop with a fake Gemini client that constructs its second
call from the actual clock result. Live model behavior can vary.

## 10. Calculate a date and save a reminder

The original request, `Set a reminder for my doctor's appointment. It's 177 days
after January 1, 2050.`, supplies a date rule but no time or time zone. Gemini
should ask for those details before saving. After the user specifies `09:00 UTC`,
the sequence is:

1. Call `add_duration_to_datetime` with
   `{ datetime: "2050-01-01T09:00:00.000Z", days: 177 }`.
2. Receive `2050-06-27T09:00:00.000Z` and weekday `Monday`.
3. Call `set_reminder` with that exact timestamp and the appointment text.
4. Receive the persisted record and confirm the local save, including the
   `--check-reminders` instruction.

This request starts from an explicit date, so the calculation does not need a
clock lookup. A request relative to today uses the clock first. A question about
a future date alone does not authorize saving a reminder; the system instruction
restricts saves to user reminder requests.

All three tool schemas stay available in the list on each API
request:

```javascript
const toolSchemas = [
  get_current_datetime_schema,
  add_duration_to_datetime_schema,
  set_reminder_schema,
];
```

No change to the loop's core tool-request detection is needed to support the
third tool. Add a function, describe its arguments, include its schema, and
register its implementation in the router. The existing message preservation,
call IDs, error wrapper, and follow-up logic apply to every registered tool.

The test client exercises the full calculation-to-save sequence using a
temporary reminder file. The application-level `reminderFile` option passed to
`runConversation` selects that test store; it is not a model argument or API
option. Preview uses only the calculator for this example and leaves storage
untouched.

## Offline checks

```bash
node --check lessons/08-tool-functions-and-schemas.js
node --test tests/08-tool-functions-and-schemas.test.js
```

The tests use fake Gemini responses to check mixed text/call parts, complete
history, matching call IDs on successes and errors, declarations on follow-up
requests, multiple calls, the offline preview, and the request limit without
consuming quota.
They also check leap days, year boundaries, subtraction, invalid timestamps,
date overflow, option forwarding, text extraction, and the dependent two-tool loop.
Additional checks cover mixed success/error batches, registered-tool routing,
intermediate and final display callbacks, `STOP` with and without calls, and
rejection of incomplete responses.
Reminder checks cover persistence, duplicate retries, preservation of existing
records, invalid/past timestamps, corrupt storage, the calculation-to-save
sequence, saved records surviving later API failures, and offline list/check
commands. They use temporary directories rather than real lesson output.
They do not establish live API availability or guarantee model behavior.
