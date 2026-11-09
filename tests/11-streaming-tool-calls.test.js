import test from "node:test";
import assert from "node:assert/strict";
import { collectStream, count_words, executeToolCall, runConversation, runPreview } from "../lessons/11-streaming-tool-calls.js";

const chunk = (parts, finishReason) => ({ candidates: [{ content: { parts }, finishReason }] });
async function* stream(chunks) {
  yield* chunks;
}
const callPart = { functionCall: { id: "count-1", name: "count_words", args: { text: "one two" } }, thoughtSignature: "fixture-signature" };

test("streams visible text immediately and preserves complete signed tool parts", async () => {
  const displayed = [];
  const content = await collectStream((async function* () {
    yield chunk([{ text: "First " }]);
    assert.deepEqual(displayed, ["First "]);
    yield chunk([{ text: "private", thought: true }]);
    yield {}; // Metadata-only chunks do not erase the finish reason or history.
    yield chunk([{ text: "second." }, callPart], "STOP");
  })(), { onText: (text) => displayed.push(text) });
  assert.deepEqual(displayed, ["First ", "second."]);
  assert.strictEqual(content.parts[3], callPart);
  assert.equal(content.parts[3].thoughtSignature, "fixture-signature");
});

test("validates complete arguments and echoes optional IDs on errors", () => {
  assert.equal(count_words({ text: "  one\ttwo\nthree! " }).count, 3);
  assert.equal(count_words({ text: "  " }).count, 0);
  for (const args of [null, [], {}, { text: 3 }, { text: "one", extra: true }]) {
    const result = executeToolCall({ id: "bad-count", name: "count_words", args });
    assert.equal(result.functionResponse.id, "bad-count");
    assert.match(result.functionResponse.response.error, /string field/);
  }
  const unknown = executeToolCall({ name: "unknown", args: {} }).functionResponse;
  assert.equal(Object.hasOwn(unknown, "id"), false);
  assert.match(unknown.response.error, /Unknown tool/);
});

test("waits for stream completion, returns all results, and streams the final answer once", async () => {
  const messages = [{ role: "user", parts: [{ text: "Count two tokens." }] }];
  let completed = false;
  let requests = 0;
  const seenText = [];
  const seenResults = [];
  const ai = { models: { generateContentStream: async function* ({ contents, config }) {
    requests++;
    assert.equal(config.tools[0].functionDeclarations[0].name, "count_words");
    if (requests === 1) {
      yield chunk([callPart, { functionCall: { id: "bad", name: "unknown", args: {} } }]);
      assert.equal(seenResults.length, 0);
      yield chunk([], "STOP");
      completed = true;
    } else {
      assert.strictEqual(contents[1].parts[0], callPart);
      assert.deepEqual(contents[2].parts.map((part) => part.functionResponse.id), ["count-1", "bad"]);
      assert.equal(contents[2].parts[0].functionResponse.response.output.count, 2);
      yield chunk([{ text: "Two " }]);
      yield chunk([{ text: "tokens." }], "STOP");
    }
  } } };
  await runConversation(ai, messages, {
    onText: (text) => seenText.push(text),
    onToolResult: (result) => { assert.equal(completed, true); seenResults.push(result); },
  });
  assert.equal(requests, 2);
  assert.equal(messages.length, 4);
  assert.equal(seenText.join(""), "Two tokens.");
  assert.equal(seenResults.length, 2);
});

test("rejects missing completion, blocked responses, partial arguments, and network failures", async () => {
  for (const chunks of [
    [], [chunk([callPart])], [chunk([callPart], "MAX_TOKENS")],
    [chunk([callPart], "SAFETY")],
    [chunk([{ functionCall: { name: "count_words", partialArgs: [] } }], "STOP")],
    [chunk([{ functionCall: { name: "count_words", willContinue: true } }], "STOP")],
  ]) {
    let results = 0;
    const messages = [{ role: "user", parts: [{ text: "Count." }] }];
    const ai = { models: { generateContentStream: () => stream(chunks) } };
    await assert.rejects(runConversation(ai, messages, { onToolResult: () => results++ }));
    assert.equal(results, 0);
    assert.equal(messages.length, 1);
  }
  await assert.rejects(collectStream((async function* () {
    yield chunk([callPart]);
    throw new Error("Connection lost");
  })()), /Connection lost/);
});

test("request limit and empty visible answers leave history uncommitted", async () => {
  for (const parts of [[callPart], [{ text: "hidden", thought: true }]]) {
    let requests = 0;
    const messages = [{ role: "user", parts: [{ text: "Count." }] }];
    const ai = { models: { generateContentStream: () => {
      requests++;
      return stream([chunk(parts, "STOP")]);
    } } };
    await assert.rejects(runConversation(ai, messages), /without a final answer|no final text/);
    assert.equal(requests, parts[0].functionCall ? 5 : 1);
    assert.equal(messages.length, 1);
  }
});

test("offline preview runs the actual loop and local tool", async () => {
  const messages = await runPreview();
  assert.equal(messages[2].parts[0].functionResponse.response.output.count, 3);
  assert.equal(messages.at(-1).parts.map((part) => part.text).join(""), "The text contains 3 whitespace-separated tokens.");
});
