import test from "node:test";
import assert from "node:assert/strict";
import { buildPreview, eventFromResponse, extractEvent, validateEvent } from "../lessons/10-tools-for-structured-data.js";

test("extracts arguments from mixed parts and preserves date wording", () => {
  const { response, extracted } = buildPreview();
  response.candidates[0].content.parts.unshift({ text: "private fixture", thought: true });
  assert.deepEqual(eventFromResponse(response), extracted);
  assert.equal(extracted.date_text, "November 12 at 14:00 UTC");
  const missing = { title: "", date_text: "", location: "", attendees: [] };
  assert.deepEqual(validateEvent(missing), missing);
});

test("rejects malformed fields rather than coercing or accepting extras", () => {
  const { extracted } = buildPreview();
  for (const args of [
    undefined, null, [], "{}", {},
    { ...extracted, extra: "unexpected" },
    { ...extracted, title: 12 },
    { ...extracted, date_text: null },
    { ...extracted, location: false },
    { ...extracted, attendees: "Maya" },
    { ...extracted, attendees: [""] },
    { ...extracted, attendees: [12] },
  ]) {
    assert.throws(() => validateEvent(args));
  }
});

test("rejects absent, wrong, duplicate, blocked, and truncated calls", () => {
  const { response } = buildPreview();
  const content = response.candidates[0].content;
  for (const invalid of [
    {},
    { candidates: [{ content: { parts: [{ text: "Just prose" }] } }] },
    { candidates: [{ content: { parts: [{ functionCall: { name: "wrong", args: {} } }] } }] },
    { candidates: [{ content: { parts: [...content.parts, ...content.parts] } }] },
    { candidates: [{ finishReason: "MAX_TOKENS", content }] },
    { candidates: [{ finishReason: "SAFETY", content }] },
  ]) {
    assert.throws(() => eventFromResponse(invalid));
  }
});

test("requests only the extraction function and makes no tool execution follow-up", async () => {
  const { source, response, extracted } = buildPreview();
  let requests = 0;
  const ai = { models: { generateContent: async (request) => {
    requests++;
    assert.equal(request.model, "gemini-flash-latest");
    assert.deepEqual(request.contents, [{ role: "user", parts: [{ text: source }] }]);
    assert.deepEqual(request.config.toolConfig.functionCallingConfig, {
      mode: "ANY", allowedFunctionNames: ["extract_event"],
    });
    assert.equal(request.config.tools[0].functionDeclarations[0].name, "extract_event");
    return response;
  } } };
  assert.deepEqual(await extractEvent(ai, source), extracted);
  assert.equal(requests, 1);
  await assert.rejects(extractEvent(ai, "  "), /non-empty/);
  assert.equal(requests, 1);
});
