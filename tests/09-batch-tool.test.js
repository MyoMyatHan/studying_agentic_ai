import test from "node:test";
import assert from "node:assert/strict";
import { buildPreview, run_batch, runConversation, executeToolCall } from "../lessons/09-batch-tool.js";

test("batch preserves ordered successes alongside invalid JSON and unknown tools", async () => {
  const { batch_output: results } = await run_batch({ invocations: [
    { tool_name: "lookup_product", arguments_json: '{"product":"mug"}' },
    { tool_name: "lookup_product", arguments_json: "invalid" },
    { tool_name: "run_batch", arguments_json: "{}" },
    { tool_name: "constructor", arguments_json: "{}" },
    { tool_name: "lookup_shipping", arguments_json: '{"region":"local"}' },
    { tool_name: "lookup_product", arguments_json: "null" },
  ] });
  assert.deepEqual(results.map((result) => result.index), [0, 1, 2, 3, 4, 5]);
  assert.equal(results[0].output.price_usd, 12);
  assert.equal(results[4].output.shipping_usd, 3);
  for (const index of [1, 2, 3, 5]) {
    assert.equal(typeof results[index].error, "string");
  }
});

test("invalid batch envelope returns a matching top-level error", async () => {
  for (const args of [null, {}, { invocations: [] }, { invocations: Array(11).fill({}) }]) {
    const result = await executeToolCall({ id: "bad-batch", name: "run_batch", args });
    assert.equal(result.functionResponse.id, "bad-batch");
    assert.equal(typeof result.functionResponse.response.error, "string");
  }
});

test("follow-up preserves mixed model parts and returns one response per batch call", async () => {
  const preview = await buildPreview();
  const content = preview[1];
  content.parts[1].thoughtSignature = "fixture-signature";
  content.parts.push({ functionCall: { id: "bad-tool", name: "unknown", args: {} } });
  const messages = [preview[0]];
  let requests = 0;
  const ai = { models: { generateContent: async ({ contents, config }) => {
    assert.equal(config.tools[0].functionDeclarations[0].name, "run_batch");
    requests++;
    if (requests === 1) {
      return { candidates: [{ finishReason: "STOP", content }] };
    }
    assert.strictEqual(contents[1], content);
    assert.equal(contents[1].parts[1].thoughtSignature, "fixture-signature");
    const results = contents[2].parts;
    assert.deepEqual(results.map((part) => part.functionResponse.id), ["preview-batch", "bad-tool"]);
    assert.equal(results[0].functionResponse.response.output.batch_output.length, 3);
    assert.match(results[1].functionResponse.response.error, /Only run_batch/);
    return { candidates: [{ finishReason: "STOP", content: preview[3] }] };
  } } };
  await runConversation(ai, messages);
  assert.equal(requests, 2);
  assert.equal(messages.length, 4);
});

test("incomplete responses and endless tool loops fail without committing partial history", async () => {
  const preview = await buildPreview();
  for (const candidate of [
    { finishReason: "MAX_TOKENS", content: preview[1] },
    { finishReason: "STOP", content: preview[1] },
  ]) {
    let requests = 0;
    const ai = { models: { generateContent: async () => {
      requests++;
      return { candidates: [candidate] };
    } } };
    const messages = [preview[0]];
    await assert.rejects(runConversation(ai, messages), /incomplete|without a final answer/);
    assert.equal(requests, candidate.finishReason === "MAX_TOKENS" ? 1 : 5);
    assert.equal(messages.length, 1);
  }
});
