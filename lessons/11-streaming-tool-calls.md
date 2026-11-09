# Lesson 11: Streaming Tool Calls

Combine lesson 04's streamed text with lesson 08's tool loop. Visible text prints
as chunks arrive; complete function calls are collected and validated before
the local tool runs. The example counts whitespace-separated tokens in text.
It does not write files, create reminders, or execute generated code.

## Run

From the repository root with Node.js 20 or newer:

```bash
npm run lesson:11 -- --preview
npm run lesson:11
```

The preview feeds hand-written SDK-shaped chunks through the real collector,
conversation loop, and local tool. It needs no key or network and has no
artificial delays. Live chat uses the existing `GEMINI_API_KEY` with
`gemini-flash-latest`. Try `Count the words in "Hello streaming tools"` and type
`exit` to quit. Previous successful turns remain in conversation history.

## Streaming text and streaming arguments

[`generateContentStream`](https://googleapis.github.io/js-genai/release_docs/)
returns an async iterator of response chunks. A chunk can contain text, a
complete `functionCall`, thought metadata, or just response metadata. Not every
chunk is display text. This lesson examines the first candidate's parts directly
instead of extracting only `chunk.text`, which would discard tool information.

The installed SDK types mark `streamFunctionCallArguments`, `partialArgs`, and
`willContinue` as unsupported for this Gemini API setup. The
[SDK configuration reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.FunctionCallingConfig.html)
also identifies the argument-streaming option as unsupported in Gemini API.
Therefore this lesson leaves it unset and expects complete argument objects.
It does not reproduce a provider-specific mode that streams raw JSON fragments
or disables argument validation. Unexpected incremental-call fields fail clearly.

Even with complete objects, validate the tool name, keys, and field types.
If using a different supported API that returns JSON fragments, buffer them
until the full call is complete before parsing and validating. A display preview
of a fragment is not permission to execute it.

## Follow the loop

1. `streamChat` requests a stream with the tool declaration on every round.
2. `collectStream` prints visible text through `onText`, skips thought text for
   display, and retains every model part intact, including thought signatures.
   Text chunks remain separate parts in the stored model message.
3. After iteration ends, a `STOP` finish reason and non-empty parts are required.
   A broken connection, missing completion, or non-STOP reason fails before any
   tool executes. Displayed text may already be visible even when a stream fails.
4. `runConversation` finds all complete calls. `executeToolCall` validates and
   runs `count_words`, returning one success or error result per call with its
   original name and optional ID. All results are appended in one user message.
5. The next stream produces the final answer or another tool request. Visible
   text is printed only as it arrives, so the assembled answer is not printed
   again. History is committed only when a final text response succeeds.

`count_words` splits trimmed text on whitespace. Punctuation remains attached;
languages without whitespace word boundaries need a different counting method.
An empty string counts as zero. This is a teaching tool, not a linguistic tokenizer.

The application allows at most five model requests per user turn. It runs local
tools synchronously after each completed stream. This is response streaming,
not concurrent tool execution. The model chooses whether to call the tool and
may provide no introductory text, so chunk timing and wording can vary.

## Offline checks

```bash
node --check lessons/11-streaming-tool-calls.js
node --test tests/11-streaming-tool-calls.test.js
```

Tests use fake async streams to check immediate text delivery, thought filtering,
preserved signatures, ID pairing, mixed successful and failed calls, stream
completion before tool execution, invalid arguments, interrupted streams,
incomplete responses, request limits, and the preview. If child processes are
blocked, run `node tests/11-streaming-tool-calls.test.js` directly. These tests
do not establish live API availability or real chunk timing.
