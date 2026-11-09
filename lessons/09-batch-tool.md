# Lesson 09: The Batch Tool

Lesson 08 already handles several function calls and dependent tool chains.
This lesson adds a higher-level `run_batch` tool: Gemini supplies several
independent invocations in one function call, and JavaScript returns their
results together. The example looks up products and shipping in a fictional
local shop. It never buys anything, writes files, or reads reminder records.

## Run it

From the repository root with Node.js 20 or newer:

```bash
npm run lesson:09 -- --preview
npm run lesson:09
```

Preview needs no API key. Its model messages are hand-written teaching fixtures;
the lookup functions actually run locally. Live chat uses the existing
`GEMINI_API_KEY` in `.env` and `gemini-flash-latest`. Type `exit` to quit.
Try: "Look up the mug and notebook, and local shipping, in one batch."
Only `--preview` is supported as a CLI option.

## Follow the code

1. `lookup_product` and `lookup_shipping` validate inputs and return fixed demo
   data. They are async so their callers can also support future I/O lookups.
2. `batchSchema` exposes only `run_batch` to Gemini. Its `invocations` array
   contains a `tool_name` and an `arguments_json` string for each lookup.
   For example: `{ tool_name: "lookup_product", arguments_json: '{"product":"mug"}' }`.
   The string is parsed with `JSON.parse`; parsed arguments still need validation.
3. `run_batch` rejects empty or oversized batches and dispatches only names in
   its registry. Nested batches and arbitrary function execution are excluded.
4. `Promise.all` starts the independent async tasks and preserves input order.
   Each task catches its own error so successful siblings still return data.
   Each entry has a zero-based `index` identifying the original invocation.
   A malformed batch envelope instead produces a top-level error.
5. `executeToolCall` returns one Gemini `functionResponse` for the outer batch,
   copying its function name and optional call ID. The inner lookup results
   belong in `response.output.batch_output`, not separate Gemini responses.
6. `runConversation` stores the complete model message, including any thought
   signatures, then appends every top-level function result in one user message.
   Tools remain declared on each follow-up request. The loop ends at a text
   answer or fails after five API requests. Non-STOP finish reasons fail early.

## Batching and concurrency

[Gemini supports native parallel and sequential function calling](https://ai.google.dev/gemini-api/docs/function-calling).
A batch wrapper is an application design choice for practicing orchestration.
It groups lookups explicitly; the model may still choose several separate
batches. A successful batch and final answer normally take two model requests,
but neither a particular call shape nor fewer requests is guaranteed.

Grouping calls into one request is separate from executing them concurrently.
This implementation uses `Promise.all` for async concurrency, not CPU parallelism.
The fixture lookups do no network I/O, so this demo establishes no speedup.
The batch has at most ten invocations; the model request loop has its own limit.

Only batch operations whose inputs are already known. A shipping quote for a
known region is independent of a product lookup. If a later lookup needs data
returned by an earlier one, first receive that result, then request the next
batch. An instruction cannot enforce that dependency rule for arbitrary future
tools; this demo deliberately registers only independent read-only lookups.

## Check offline

```bash
node --check lessons/09-batch-tool.js
node --test tests/09-batch-tool.test.js
```

Tests use fake Gemini responses to check mixed successes/errors, invalid input,
blocked nested calls, ID pairing, full model history, follow-up declarations,
incomplete responses, and the loop limit. They do not verify live model behavior.
