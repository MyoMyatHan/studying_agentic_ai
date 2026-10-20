import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { FinishReason, GenerateContentResponse } from "@google/genai";
import {
  get_current_datetime,
  get_current_datetime_schema,
  add_duration_to_datetime,
  add_duration_to_datetime_schema,
  set_reminder,
  set_reminder_schema,
  readReminders,
  toolSchemas,
  addUserMessage,
  textFromMessage,
  hasToolRequests,
  runTool,
  executeToolCall,
  buildToolFlowPreview,
  buildSequentialToolPreview,
  chat,
  runConversation,
} from "../lessons/08-tool-functions-and-schemas.js";

function modelResponse(parts, finishReason = FinishReason.STOP) {
  const response = new GenerateContentResponse();
  response.candidates = [{ content: { role: "model", parts }, finishReason }];
  return response;
}

function fakeClient(responses) {
  const requests = [];
  return {
    requests,
    models: {
      generateContent: async (request) => {
        requests.push({ ...request, contents: [...request.contents] });
        assert.ok(responses.length > 0, "Unexpected extra Gemini request");
        const response = responses.shift();
        if (response instanceof Error) {
          throw response;
        }
        return typeof response === "function" ? response(request) : response;
      },
    },
  };
}

function userMessages() {
  return [{ role: "user", parts: [{ text: "What time is it?" }] }];
}

function temporaryReminderFile(t) {
  const directory = mkdtempSync(join(tmpdir(), "gemini-lesson-08-"));
  // Remove only the exact temporary directory created by this test.
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, "reminders.json");
}

test("reminders persist across reads, retain prior records, and deduplicate retries", (t) => {
  const reminderFile = join(dirname(temporaryReminderFile(t)), "nested", "reminders.json");
  const args = { reminder_text: "  Doctor's appointment  ", remind_at: "2050-06-27T09:00:00.000Z" };
  const first = set_reminder(args, { reminderFile });
  assert.equal(first.status, "saved");
  assert.equal(first.delivery, "local_only");
  assert.equal(first.reminder.reminder_text, "Doctor's appointment");
  assert.match(first.message, /--check-reminders/);
  const savedSource = readFileSync(reminderFile, "utf8");
  const retry = set_reminder(args, { reminderFile });
  assert.equal(retry.reminder.id, first.reminder.id);
  assert.equal(readFileSync(reminderFile, "utf8"), savedSource);
  const second = set_reminder({ reminder_text: "Bring appointment notes", remind_at: "2050-06-27T08:00:00.000Z" }, { reminderFile });
  assert.notEqual(first.reminder.id, second.reminder.id);
  assert.deepEqual(readReminders(reminderFile), [first.reminder, second.reminder]);
});

test("reminder validation rejects incomplete, invalid, and past times without writing files", (t) => {
  const reminderFile = temporaryReminderFile(t);
  const valid = { reminder_text: "Appointment", remind_at: "2050-06-27T09:00:00.000Z" };
  for (const args of [null, [], "appointment"]) {
    assert.throws(() => set_reminder(args, { reminderFile }), /Arguments must be an object/);
  }
  for (const reminder_text of ["", "   ", 12, null]) {
    assert.throws(() => set_reminder({ ...valid, reminder_text }, { reminderFile }), /reminder_text must be/);
  }
  for (const remind_at of [undefined, null, "2050-06-27", "2050-06-27T09:00:00", "2050-02-30T09:00:00.000Z"]) {
    assert.throws(() => set_reminder({ ...valid, remind_at }, { reminderFile }), /canonical UTC ISO timestamp/);
  }
  assert.throws(() => set_reminder({ ...valid, remind_at: "2000-01-01T00:00:00.000Z" }, { reminderFile }), /must be in the future/);
  assert.throws(() => set_reminder({ ...valid, reminderFile: "model-chosen.json" }, { reminderFile }), /Only reminder_text and remind_at/);
  assert.equal(existsSync(reminderFile), false);
});

test("corrupt reminder storage returns a matching tool error and preserves existing bytes", (t) => {
  const reminderFile = temporaryReminderFile(t);
  for (const source of ["not JSON", "{}", '[{"id":"incomplete"}]']) {
    writeFileSync(reminderFile, source);
    const result = executeToolCall({
      id: "save-error", name: "set_reminder", args: { reminder_text: "Appointment", remind_at: "2050-06-27T09:00:00.000Z" },
    }, reminderFile);
    assert.equal(result.functionResponse.id, "save-error");
    assert.equal(typeof result.functionResponse.response.error, "string");
    assert.equal(result.functionResponse.response.output, undefined);
    assert.equal(readFileSync(reminderFile, "utf8"), source);
  }
});

test("Gemini can calculate 177 days after January 1, 2050 and save the exact result", async (t) => {
  const reminderFile = temporaryReminderFile(t);
  const ai = fakeClient([
    modelResponse([{ functionCall: {
      id: "calculate", name: "add_duration_to_datetime", args: { datetime: "2050-01-01T09:00:00.000Z", days: 177 },
    } }]),
    ({ contents }) => {
      const calculated = contents.at(-1).parts[0].functionResponse.response.output;
      assert.equal(calculated.datetime, "2050-06-27T09:00:00.000Z");
      return modelResponse([{ functionCall: {
        id: "save", name: "set_reminder", args: { reminder_text: "Doctor's appointment", remind_at: calculated.datetime },
      } }]);
    },
    ({ contents }) => {
      const saved = contents.at(-1).parts[0].functionResponse.response.output;
      assert.equal(saved.status, "saved");
      assert.equal(saved.reminder.remind_at, "2050-06-27T09:00:00.000Z");
      return modelResponse([{ text: `Saved locally: ${saved.reminder.remind_at}. Check due reminders with --check-reminders.` }]);
    },
  ]);
  const messages = [];
  addUserMessage(messages, "Save a reminder for my doctor's appointment 177 days after January 1, 2050, at 09:00 UTC.");
  const final = await runConversation(ai, messages, { reminderFile });
  assert.match(textFromMessage(final), /Saved locally/);
  assert.equal(ai.requests.length, 3);
  assert.equal(readReminders(reminderFile).length, 1);
  assert.equal(messages[4].parts[0].functionResponse.id, "save");
  for (const request of ai.requests) {
    assert.deepEqual(request.config.tools, [{ functionDeclarations: [get_current_datetime_schema, add_duration_to_datetime_schema, set_reminder_schema] }]);
    assert.equal("reminderFile" in request.config, false);
  }
});

test("a saved reminder survives a later API failure and retrying does not duplicate it", async (t) => {
  const reminderFile = temporaryReminderFile(t);
  const args = { reminder_text: "Appointment", remind_at: "2050-06-27T09:00:00.000Z" };
  const ai = fakeClient([
    modelResponse([{ functionCall: { id: "save-before-failure", name: "set_reminder", args } }]),
    new Error("Simulated final request failure"),
  ]);
  const messages = userMessages();
  await assert.rejects(runConversation(ai, messages, { reminderFile }), /Simulated final request failure/);
  assert.deepEqual(messages, userMessages());
  const [saved] = readReminders(reminderFile);
  assert.ok(saved.id);
  const retry = executeToolCall({ id: "retry-save", name: "set_reminder", args }, reminderFile);
  assert.equal(retry.functionResponse.response.output.reminder.id, saved.id);
  assert.equal(readReminders(reminderFile).length, 1);
});

test("local reminder commands work without a key and preview preserves the store", (t) => {
  const directory = dirname(temporaryReminderFile(t));
  const reminderFile = join(directory, "output", "lesson-08", "reminders.json");
  const script = resolve("lessons/08-tool-functions-and-schemas.js");
  const options = { cwd: directory, encoding: "utf8", env: { ...process.env, GEMINI_API_KEY: "" } };
  const empty = spawnSync(process.execPath, [script, "--list-reminders"], options);
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(existsSync(reminderFile), false);
  mkdirSync(dirname(reminderFile), { recursive: true });
  const source = JSON.stringify([
    { id: "due", reminder_text: "Due example", remind_at: "2000-01-01T00:00:00.000Z" },
    { id: "future", reminder_text: "Future example", remind_at: "2050-06-27T09:00:00.000Z" },
  ]);
  writeFileSync(reminderFile, source);
  const all = spawnSync(process.execPath, [script, "--list-reminders"], options);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /Due example/);
  assert.match(all.stdout, /Future example/);
  const due = spawnSync(process.execPath, [script, "--check-reminders"], options);
  assert.equal(due.status, 0, due.stderr);
  assert.match(due.stdout, /Due example/);
  assert.doesNotMatch(due.stdout, /Future example/);
  const preview = spawnSync(process.execPath, [script, "--preview"], options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /calculation only; nothing saved/);
  assert.equal(readFileSync(reminderFile, "utf8"), source);
});

test("clock returns a current UTC instant and explicit date/time formats", () => {
  const before = Date.now();
  const result = get_current_datetime();
  const after = Date.now();
  assert.equal(result.time_zone, "UTC");
  assert.equal(result.date_format, "iso");
  assert.ok(Date.parse(result.datetime) >= before);
  assert.ok(Date.parse(result.datetime) <= after);
  assert.match(result.datetime, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  assert.match(get_current_datetime({ date_format: "date" }).datetime, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(get_current_datetime({ date_format: "time" }).datetime, /^\d{2}:\d{2}:\d{2}$/);
});

test("runtime validation rejects invalid arguments with actionable errors", () => {
  for (const args of [null, [], "time", 5]) {
    assert.throws(() => get_current_datetime(args), /Arguments must be an object/);
  }
  for (const date_format of ["", "  ", null, 12, false]) {
    assert.throws(() => get_current_datetime({ date_format }), /non-empty string/);
  }
  assert.throws(() => get_current_datetime({ date_format: "%H:%M" }), /Use iso, date, or time/);
  assert.throws(() => get_current_datetime({ time_zone: "UTC" }), /Only date_format/);
  const unknown = executeToolCall({ name: "constructor", args: {} });
  assert.match(unknown.functionResponse.response.error, /Unknown tool/);
  assert.equal(unknown.functionResponse.response.output, undefined);
  for (const name of ["constructor", "toString", "__proto__", "not_a_tool"]) {
    assert.throws(() => runTool(name, {}), /Unknown tool/);
  }
});

test("a mixed batch returns every success and error with IDs and displays each model message once", async () => {
  const calls = [
    { id: "clock", name: "get_current_datetime", args: {} },
    { id: "invalid-date", name: "add_duration_to_datetime", args: { datetime: "invalid", days: 103 } },
    { id: "unknown", name: "constructor", args: {} },
    { id: "valid-date", name: "add_duration_to_datetime", args: { datetime: "2026-10-20T08:30:00.000Z", days: 103 } },
  ];
  const toolResponse = modelResponse([
    { text: "I will check the requested dates." },
    { text: "Private thought", thought: true },
    ...calls.map((functionCall) => ({ functionCall })),
  ]);
  const finalResponse = modelResponse([{ text: "The valid future date is Sunday; two calls failed." }]);
  // Both responses use STOP; the functionCall parts decide whether another request is needed.
  assert.equal(toolResponse.candidates[0].finishReason, finalResponse.candidates[0].finishReason);
  assert.equal(hasToolRequests(toolResponse.candidates[0].content), true);
  assert.equal(hasToolRequests(finalResponse.candidates[0].content), false);
  const ai = fakeClient([toolResponse, finalResponse]);
  const visibleMessages = [];
  const messages = userMessages();
  const finalMessage = await runConversation(ai, messages, {
    onMessage: (message) => visibleMessages.push(textFromMessage(message)),
  });
  assert.equal(finalMessage, finalResponse.candidates[0].content);
  assert.equal(ai.requests.length, 2);
  const results = ai.requests[1].contents[2].parts.map((part) => part.functionResponse);
  assert.equal(results.length, calls.length);
  assert.deepEqual(results.map(({ id, name }) => ({ id, name })), calls.map(({ id, name }) => ({ id, name })));
  assert.equal(results[0].response.output.time_zone, "UTC");
  assert.match(results[1].response.error, /canonical UTC ISO timestamp/);
  assert.match(results[2].response.error, /Unknown tool/);
  assert.equal(results[3].response.output.datetime, "2027-01-31T08:30:00.000Z");
  assert.deepEqual(visibleMessages, [
    "I will check the requested dates.",
    "The valid future date is Sunday; two calls failed.",
  ]);
  assert.equal("onMessage" in ai.requests[0].config, false);
});

test("duration calculation handles 103 days, leap days, year boundaries, and subtraction in UTC", () => {
  const cases = [
    ["2026-10-20T08:30:00.000Z", 103, "2027-01-31T08:30:00.000Z", "Sunday"],
    ["2024-02-28T23:30:00.000Z", 1, "2024-02-29T23:30:00.000Z", "Thursday"],
    ["2025-12-31T00:00:00.000Z", 1, "2026-01-01T00:00:00.000Z", "Thursday"],
    ["2024-03-01T00:00:00.000Z", -1, "2024-02-29T00:00:00.000Z", "Thursday"],
    ["2026-10-20T08:30:00.000Z", 0, "2026-10-20T08:30:00.000Z", "Tuesday"],
  ];
  for (const [datetime, days, expected, weekday] of cases) {
    assert.deepEqual(add_duration_to_datetime({ datetime, days }), {
      datetime: expected, weekday, time_zone: "UTC",
    });
  }
});

test("duration validation rejects invalid dates, ambiguous times, invalid days, and overflow", () => {
  const datetime = "2026-10-20T08:30:00.000Z";
  for (const args of [null, [], "2026-10-20"]) {
    assert.throws(() => add_duration_to_datetime(args), /Arguments must be an object/);
  }
  for (const value of ["", null, "2026-02-30T00:00:00.000Z", "2026-10-20", "2026-10-20T08:30:00", "bad date"]) {
    assert.throws(() => add_duration_to_datetime({ datetime: value, days: 1 }), /datetime must be/);
  }
  for (const days of ["103", 1.5, undefined, null, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => add_duration_to_datetime({ datetime, days }), /days must be a safe whole number/);
  }
  assert.throws(() => add_duration_to_datetime({ datetime, days: 1, hours: 2 }), /Only datetime and days/);
  const result = executeToolCall({ name: "add_duration_to_datetime", id: "overflow", args: { datetime, days: Number.MAX_SAFE_INTEGER } });
  assert.equal(result.functionResponse.id, "overflow");
  assert.match(result.functionResponse.response.error, /supported date range/);
});

test("chat makes one request, forwards options, and returns the complete model message", async () => {
  const response = modelResponse([
    { text: "I will check the clock." },
    { functionCall: { name: "get_current_datetime", args: {} }, thoughtSignature: "keep-signature" },
  ]);
  const ai = fakeClient([response]);
  const messages = userMessages();
  const content = await chat(ai, messages, {
    tools: [get_current_datetime_schema], system: "Use UTC.", temperature: 0.2, stopSequences: ["END"],
  });
  assert.equal(content, response.candidates[0].content);
  assert.equal(ai.requests.length, 1);
  assert.equal(messages.length, 1);
  assert.deepEqual(ai.requests[0].config, {
    maxOutputTokens: 1000,
    temperature: 0.2,
    stopSequences: ["END"],
    systemInstruction: "Use UTC.",
    tools: [{ functionDeclarations: [get_current_datetime_schema] }],
  });
  const textOnly = fakeClient([modelResponse([{ text: "Hello." }])]);
  await chat(textOnly, messages, { tools: [], system: null });
  assert.equal("tools" in textOnly.requests[0].config, false);
  assert.equal("systemInstruction" in textOnly.requests[0].config, false);
});

test("text extraction keeps all visible text while excluding thoughts and tool metadata", () => {
  const message = modelResponse([
    { text: "Internal reasoning", thought: true },
    { text: "The answer is Sunday." },
    { functionCall: { name: "get_current_datetime", args: {} }, thoughtSignature: "keep" },
    { text: "The time is in UTC." },
  ]).candidates[0].content;
  assert.equal(textFromMessage(message), "The answer is Sunday.\nThe time is in UTC.");
  assert.equal(message.parts.length, 4);
  assert.equal(message.parts[2].thoughtSignature, "keep");
});

test("dependent calls pass the clock result to the duration tool before the final response", async () => {
  let clockDatetime;
  let expectedOutput;
  const ai = fakeClient([
    modelResponse([{ functionCall: { id: "now", name: "get_current_datetime", args: { date_format: "iso" } } }]),
    ({ contents }) => {
      clockDatetime = contents.at(-1).parts[0].functionResponse.response.output.datetime;
      return modelResponse([
        { text: "Now I can calculate the future date." },
        {
          functionCall: { id: "future", name: "add_duration_to_datetime", args: { datetime: clockDatetime, days: 103 } },
          thoughtSignature: "duration-signature",
        },
      ]);
    },
    ({ contents }) => {
      expectedOutput = contents.at(-1).parts[0].functionResponse.response.output;
      return modelResponse([{ text: `${expectedOutput.weekday}: ${expectedOutput.datetime} (UTC)` }]);
    },
  ]);
  const messages = [];
  addUserMessage(messages, { role: "user", parts: [{ text: "What day is 103 days from today?" }] });
  const result = await runConversation(ai, messages, { tools: toolSchemas, temperature: 0.3 });
  assert.equal(ai.requests.length, 3);
  assert.equal(ai.requests[1].contents[2].parts[0].functionResponse.id, "now");
  assert.equal(ai.requests[2].contents[3].parts[1].functionCall.args.datetime, clockDatetime);
  assert.equal(ai.requests[2].contents[3].parts[1].thoughtSignature, "duration-signature");
  assert.equal(ai.requests[2].contents[4].parts[0].functionResponse.id, "future");
  assert.equal(Date.parse(expectedOutput.datetime) - Date.parse(clockDatetime), 103 * 86400000);
  assert.equal(textFromMessage(result), `${expectedOutput.weekday}: ${expectedOutput.datetime} (UTC)`);
  assert.deepEqual(messages.map((message) => message.role), ["user", "model", "user", "model", "user", "model"]);
  for (const request of ai.requests) {
    assert.deepEqual(request.config.tools, [{ functionDeclarations: [get_current_datetime_schema, add_duration_to_datetime_schema, set_reminder_schema] }]);
    assert.equal(request.config.temperature, 0.3);
  }
});

test("conversation returns all tool results with IDs and retains complete signed model content", async () => {
  const toolResponse = modelResponse([
    { text: "Checking the clock." },
    {
      functionCall: { name: "get_current_datetime", id: "clock-1", args: {} },
      thoughtSignature: "test-signature-preserve-verbatim",
    },
    { text: "I will also get just the time." },
    { functionCall: { name: "get_current_datetime", id: "clock-2", args: { date_format: "time" } } },
  ]);
  const finalResponse = modelResponse([{ text: "The current time is shown in UTC." }]);
  const ai = fakeClient([toolResponse, finalResponse]);
  const messages = userMessages();
  assert.equal(await runConversation(ai, messages), finalResponse.candidates[0].content);
  assert.equal(ai.requests.length, 2);
  for (const request of ai.requests) {
    assert.deepEqual(request.config.tools, [{ functionDeclarations: toolSchemas }]);
  }
  assert.equal(ai.requests[0].model, "gemini-flash-latest");
  assert.equal(ai.requests[1].contents[1], toolResponse.candidates[0].content);
  assert.equal(ai.requests[1].contents[1].parts[0].text, "Checking the clock.");
  assert.equal(ai.requests[1].contents[1].parts[2].text, "I will also get just the time.");
  assert.equal(ai.requests[1].contents[1].parts[1].thoughtSignature, "test-signature-preserve-verbatim");
  const results = ai.requests[1].contents[2];
  assert.equal(results.role, "user");
  assert.deepEqual(results.parts.map((part) => part.functionResponse.id), ["clock-1", "clock-2"]);
  assert.equal(results.parts[0].functionResponse.response.output.time_zone, "UTC");
  assert.equal(results.parts[1].functionResponse.response.output.date_format, "time");
  assert.equal(messages[1], toolResponse.candidates[0].content);
  assert.equal(messages[3], finalResponse.candidates[0].content);
});

test("Gemini can see a validation error and retry with corrected arguments", async () => {
  const ai = fakeClient([
    modelResponse([{ functionCall: { id: "invalid-format", name: "get_current_datetime", args: { date_format: "" } } }]),
    modelResponse([{ functionCall: { name: "get_current_datetime", args: { date_format: "iso" } } }]),
    modelResponse([{ text: "Here is the time in UTC." }]),
  ]);
  const messages = userMessages();
  await runConversation(ai, messages);
  assert.match(ai.requests[1].contents[2].parts[0].functionResponse.response.error, /non-empty string/);
  assert.equal(ai.requests[1].contents[2].parts[0].functionResponse.id, "invalid-format");
  assert.equal(ai.requests[1].contents[2].parts[0].functionResponse.response.output, undefined);
  for (const request of ai.requests) {
    assert.deepEqual(request.config.tools, [{ functionDeclarations: toolSchemas }]);
  }
  assert.ok(ai.requests[2].contents[4].parts[0].functionResponse.response.output.datetime);
  assert.equal("id" in ai.requests[2].contents[4].parts[0].functionResponse, false);
});

test("ordinary text responses retain prior conversation without executing a tool", async () => {
  const messages = userMessages();
  const ai = fakeClient([
    modelResponse([{ text: "Hello." }]),
    modelResponse([{ text: "Welcome back." }, { text: "How can I help?" }]),
  ]);
  assert.equal(textFromMessage(await runConversation(ai, messages)), "Hello.");
  messages.push({ role: "user", parts: [{ text: "Hello again" }] });
  assert.equal(textFromMessage(await runConversation(ai, messages)), "Welcome back.\nHow can I help?");
  assert.equal(ai.requests[1].contents[1].parts[0].text, "Hello.");
  assert.equal(messages.length, 4);
  assert.equal(messages[3].parts.length, 2);
});

test("offline preview shows the full history with one matching result per call", () => {
  const messages = buildToolFlowPreview();
  assert.deepEqual(messages.map((message) => message.role), ["user", "model", "user", "model"]);
  assert.ok(messages[1].parts.some((part) => part.text));
  const calls = messages[1].parts.filter((part) => part.functionCall).map((part) => part.functionCall);
  const results = messages[2].parts.map((part) => part.functionResponse);
  assert.equal(calls.length, 2);
  assert.equal(results.length, calls.length);
  for (const [index, call] of calls.entries()) {
    assert.equal(results[index].id, call.id);
    assert.equal(results[index].name, call.name);
    assert.equal(results[index].response.output.date_format, call.args.date_format);
    assert.ok(messages[3].parts[0].text.includes(results[index].response.output.datetime));
  }
});

test("sequential preview uses the actual clock result for the dependent calculation", () => {
  const messages = buildSequentialToolPreview();
  assert.deepEqual(messages.map((message) => message.role), ["user", "model", "user", "model", "user", "model"]);
  const now = messages[2].parts[0].functionResponse.response.output.datetime;
  const call = messages[3].parts.find((part) => part.functionCall).functionCall;
  assert.equal(call.name, "add_duration_to_datetime");
  assert.deepEqual(call.args, { datetime: now, days: 103 });
  const future = messages[4].parts[0].functionResponse.response.output;
  assert.equal(Date.parse(future.datetime) - Date.parse(now), 103 * 86400000);
  assert.ok(textFromMessage(messages[5]).includes(future.weekday));
});

test("repeated tool calls stop at the request limit without saving partial history", async () => {
  const ai = fakeClient(Array.from({ length: 5 }, () => modelResponse([
    { functionCall: { name: "get_current_datetime", args: {} } },
  ])));
  const messages = userMessages();
  await assert.rejects(runConversation(ai, messages), /Stopped after 5 Gemini requests/);
  assert.equal(ai.requests.length, 5);
  assert.deepEqual(messages, userMessages());
});

test("empty, blocked, and network failures report errors without partial history", async () => {
  const failures = [
    [{ candidates: [] }, /returned no content/],
    [modelResponse([{ text: "" }]), /no final text/],
    [new Error("Simulated network failure"), /Simulated network failure/],
  ];
  for (const [response, expected] of failures) {
    const ai = fakeClient([
      modelResponse([{ functionCall: { name: "get_current_datetime", args: {} } }]),
      response,
    ]);
    const messages = userMessages();
    await assert.rejects(runConversation(ai, messages), expected);
    assert.deepEqual(messages, userMessages());
  }
});

test("incomplete finish reasons cannot masquerade as final answers or trigger tool execution", async () => {
  for (const finishReason of [FinishReason.MAX_TOKENS, FinishReason.SAFETY, FinishReason.MALFORMED_FUNCTION_CALL]) {
    for (const parts of [
      [{ text: "A partial answer" }],
      [{ functionCall: { id: "partial-call", name: "get_current_datetime", args: {} } }],
    ]) {
      const ai = fakeClient([modelResponse(parts, finishReason)]);
      const messages = userMessages();
      const emitted = [];
      await assert.rejects(runConversation(ai, messages, { onMessage: (message) => emitted.push(message) }), new RegExp(finishReason));
      assert.deepEqual(messages, userMessages());
      assert.equal(ai.requests.length, 1);
      assert.equal(emitted.length, 0);
    }
  }
});

test("preview works without a key and live mode reports a missing key", () => {
  const options = { encoding: "utf8", env: { ...process.env, GEMINI_API_KEY: "" } };
  const preview = spawnSync(process.execPath, ["lessons/08-tool-functions-and-schemas.js", "--preview"], options);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /parametersJsonSchema/);
  assert.match(preview.stdout, /Complete multi-part exchange/);
  assert.match(preview.stdout, /Sequential tool exchange: 103 days from today/);
  assert.match(preview.stdout, /add_duration_to_datetime/);
  assert.match(preview.stdout, /"functionCall"/);
  assert.match(preview.stdout, /"functionResponse"/);
  assert.match(preview.stdout, /No API calls or generated files/);
  const live = spawnSync(process.execPath, ["lessons/08-tool-functions-and-schemas.js"], options);
  assert.equal(live.status, 1);
  assert.match(live.stderr, /GEMINI_API_KEY is not set/);
});
