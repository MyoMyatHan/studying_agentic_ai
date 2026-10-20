import "dotenv/config";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FinishReason, GoogleGenAI } from "@google/genai";

const model = "gemini-flash-latest";
const maxRequestsPerTurn = 5;
const defaultReminderFile = resolve("output/lesson-08/reminders.json");
const systemInstruction = `You are a helpful assistant learning to use tools.
Use get_current_datetime whenever you need the current date or time; never guess it.
The tool reads the computer's clock and returns UTC, not the user's local time.
Use the requested format, or iso when the user needs both date and time.
For questions such as "What day is 103 days from today?", first call
get_current_datetime with date_format iso. After receiving its result, pass that
exact timestamp and the requested number of days to add_duration_to_datetime.
Use the returned weekday and datetime in your answer. A day means 24 hours in UTC.
If a tool returns an error, use its message to correct the arguments and retry.
For an explicit starting date, use add_duration_to_datetime directly; do not
replace that date with today. Ask for missing reminder times or time zones before
calling set_reminder. Never assume midnight for a date-only appointment request.
Only call set_reminder when the user requests a reminder and its time is clear.
Pass the calculated timestamp unchanged. Confirm saving only after a successful
tool result. Reminders are saved locally; tell the user to run
npm run lesson:08 -- --check-reminders to see due reminders. No background,
desktop, email, or push notifications are provided by this lesson.`;

// A tool is an ordinary JavaScript function. Validate even schema-guided input.
export function get_current_datetime(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Arguments must be an object with an optional date_format.");
  }
  if (Object.keys(args).some((key) => key !== "date_format")) {
    throw new Error("Only date_format is supported. Use iso, date, or time.");
  }

  const { date_format = "iso" } = args;
  if (typeof date_format !== "string" || !date_format.trim()) {
    throw new Error("date_format must be a non-empty string: iso, date, or time.");
  }
  if (!["iso", "date", "time"].includes(date_format)) {
    throw new Error("Unsupported date_format. Use iso, date, or time.");
  }

  const iso = new Date().toISOString();
  const formats = { iso, date: iso.slice(0, 10), time: iso.slice(11, 19) };
  return { datetime: formats[date_format], date_format, time_zone: "UTC" };
}

// JSDoc checks the declaration's SDK shape in editors without requiring TypeScript.
/** @type {import("@google/genai").FunctionDeclaration} */
export const get_current_datetime_schema = {
  name: "get_current_datetime",
  description: "Reads the current date and time from the computer's clock in UTC. "
    + "Use it when the user asks what time or date it is, or needs a current time reference. "
    + "Returns an object with datetime, date_format, and time_zone, using the requested format. "
    + "It does not calculate future dates, store reminders, or send notifications.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      date_format: {
        type: "string",
        enum: ["iso", "date", "time"],
        description: "Output format in UTC: iso gives YYYY-MM-DDTHH:mm:ss.sssZ, "
          + "date gives YYYY-MM-DD, and time gives HH:mm:ss in 24-hour time. "
          + "Omit this argument to use iso.",
      },
    },
    required: [],
    additionalProperties: false,
  },
};

export function add_duration_to_datetime(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Arguments must be an object containing datetime and days.");
  }
  if (Object.keys(args).some((key) => !["datetime", "days"].includes(key))) {
    throw new Error("Only datetime and days are supported.");
  }
  const { datetime, days } = args;
  if (typeof datetime !== "string" || !datetime.trim()) {
    throw new Error("datetime must be a non-empty UTC ISO timestamp from get_current_datetime (iso format).");
  }
  const start = new Date(datetime);
  // Round-trip validation rejects invalid calendar dates and ambiguous local times.
  if (Number.isNaN(start.getTime()) || start.toISOString() !== datetime) {
    throw new Error("datetime must be a canonical UTC ISO timestamp, such as 2026-10-20T08:30:00.000Z.");
  }
  if (!Number.isSafeInteger(days)) {
    throw new Error("days must be a safe whole number; use a negative number to subtract days.");
  }

  // UTC arithmetic avoids the computer's local time zone and daylight-saving changes.
  const result = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
  if (Number.isNaN(result.getTime())) {
    throw new Error("The resulting datetime is outside JavaScript's supported date range. Use fewer days.");
  }
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(result);
  return { datetime: result.toISOString(), weekday, time_zone: "UTC" };
}

/** @type {import("@google/genai").FunctionDeclaration} */
export const add_duration_to_datetime_schema = {
  name: "add_duration_to_datetime",
  description: "Adds a whole number of days to a UTC ISO timestamp using JavaScript date arithmetic. "
    + "Use it to answer questions about dates a specified number of days before or after a known instant. "
    + "For relative-to-now questions, first obtain the iso result from get_current_datetime and pass it unchanged. "
    + "Returns datetime, weekday, and time_zone in UTC; it does not schedule reminders.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      datetime: {
        type: "string",
        description: "Canonical UTC ISO timestamp including milliseconds and Z, for example "
          + "2026-10-20T08:30:00.000Z. Use the clock tool's iso output for calculations from now.",
      },
      days: {
        type: "integer",
        description: "Number of 24-hour UTC days to add, for example 103. Zero keeps the instant; negative values subtract days.",
      },
    },
    required: ["datetime", "days"],
    additionalProperties: false,
  },
};

export function readReminders(reminderFile = defaultReminderFile) {
  let source;
  try {
    source = readFileSync(reminderFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const reminders = JSON.parse(source);
  if (!Array.isArray(reminders) || reminders.some((reminder) => !reminder
    || typeof reminder.id !== "string" || !reminder.id
    || typeof reminder.reminder_text !== "string" || !reminder.reminder_text.trim()
    || typeof reminder.remind_at !== "string" || !Number.isFinite(Date.parse(reminder.remind_at))
    || new Date(reminder.remind_at).toISOString() !== reminder.remind_at)) {
    throw new Error("The reminder file must contain an array of valid reminder records. Repair it before saving more reminders.");
  }
  return reminders;
}

export function set_reminder(args = {}, { reminderFile = defaultReminderFile } = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Arguments must be an object containing reminder_text and remind_at.");
  }
  if (Object.keys(args).some((key) => !["reminder_text", "remind_at"].includes(key))) {
    throw new Error("Only reminder_text and remind_at are supported.");
  }
  const { reminder_text, remind_at } = args;
  if (typeof reminder_text !== "string" || !reminder_text.trim()) {
    throw new Error("reminder_text must be a non-empty string describing the reminder.");
  }
  if (typeof remind_at !== "string" || !Number.isFinite(Date.parse(remind_at))
    || new Date(remind_at).toISOString() !== remind_at) {
    throw new Error("remind_at must be a canonical UTC ISO timestamp with milliseconds and Z. Ask for a missing time or time zone.");
  }
  if (Date.parse(remind_at) <= Date.now()) {
    throw new Error("remind_at must be in the future. Check the current time and requested date.");
  }

  const reminders = readReminders(reminderFile);
  // Retrying the same text/time reuses the saved record instead of creating duplicates.
  let reminder = reminders.find((item) => item.reminder_text === reminder_text.trim() && item.remind_at === remind_at);
  if (!reminder) {
    reminder = { id: randomUUID(), reminder_text: reminder_text.trim(), remind_at, created_at: new Date().toISOString() };
    mkdirSync(dirname(reminderFile), { recursive: true });
    const temporaryFile = `${reminderFile}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporaryFile, `${JSON.stringify([...reminders, reminder], null, 2)}\n`, { flag: "wx" });
      renameSync(temporaryFile, reminderFile);
    } finally {
      if (existsSync(temporaryFile)) {
        unlinkSync(temporaryFile);
      }
    }
  }
  return {
    status: "saved",
    reminder,
    delivery: "local_only",
    message: "Saved locally. Run npm run lesson:08 -- --check-reminders to view due reminders; there are no background notifications.",
  };
}

/** @type {import("@google/genai").FunctionDeclaration} */
export const set_reminder_schema = {
  name: "set_reminder",
  description: "Saves a future reminder in the lesson's local JSON file. "
    + "Use it only when the user asks to save a reminder and its text, time, and time zone are clear; ask for missing details first. "
    + "For calculated dates, pass the exact timestamp returned by add_duration_to_datetime. "
    + "Returns a saved record with an ID and local-only delivery instructions; it does not send background notifications.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      reminder_text: { type: "string", description: "Non-empty description of what the user wants to remember, such as Doctor's appointment." },
      remind_at: {
        type: "string",
        description: "Future canonical UTC ISO timestamp with milliseconds and Z, such as 2050-06-27T09:00:00.000Z. Resolve the user's time and time zone before calling.",
      },
    },
    required: ["reminder_text", "remind_at"],
    additionalProperties: false,
  },
};

export const toolSchemas = [get_current_datetime_schema, add_duration_to_datetime_schema, set_reminder_schema];
const toolFunctions = new Map([
  ["get_current_datetime", get_current_datetime],
  ["add_duration_to_datetime", add_duration_to_datetime],
  ["set_reminder", set_reminder],
]);

// Accept text, an array of parts (including results), or a complete Content object.
export function addUserMessage(messages, content) {
  const parts = typeof content === "string" ? [{ text: content }]
    : Array.isArray(content) ? content : content.parts;
  messages.push({ role: "user", parts });
}

// Accept text, an array of parts, or the complete Content returned by Gemini.
export function addAssistantMessage(messages, content) {
  if (typeof content === "string") {
    messages.push({ role: "model", parts: [{ text: content }] });
  } else if (Array.isArray(content)) {
    messages.push({ role: "model", parts: content });
  } else {
    messages.push(content);
  }
}

// Extract display text without losing tool parts or signatures from the saved message.
export function textFromMessage(message) {
  return (message.parts ?? [])
    .filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text)
    .join("\n");
}

// Gemini requests tools through functionCall parts, not a special stop reason.
export function hasToolRequests(message) {
  return (message.parts ?? []).some((part) => part.functionCall);
}

// Route only explicitly registered tools; Map avoids inherited object properties.
export function runTool(toolName, toolInput, reminderFile = defaultReminderFile) {
  const tool = toolFunctions.get(toolName);
  if (!tool) {
    throw new Error("Unknown tool. Use get_current_datetime, add_duration_to_datetime, or set_reminder.");
  }
  return tool(toolInput, { reminderFile });
}

export function executeToolCall(call, reminderFile = defaultReminderFile) {
  let response;
  try {
    response = { output: runTool(call.name, call.args, reminderFile) };
  } catch (error) {
    // Sending the error back lets Gemini correct its arguments on the next request.
    response = { error: error.message };
  }

  return {
    functionResponse: {
      name: call.name,
      ...(call.id !== undefined ? { id: call.id } : {}),
      response,
    },
  };
}

// Make one API request and return the complete model message, not just its text.
export async function chat(ai, messages, {
  tools = toolSchemas,
  system = systemInstruction,
  temperature = 1,
  stopSequences = [],
} = {}) {
  const config = { maxOutputTokens: 1000, temperature, stopSequences };
  if (tools.length > 0) {
    config.tools = [{ functionDeclarations: tools }];
  }
  if (system) {
    config.systemInstruction = system;
  }
  const response = await ai.models.generateContent({ model, contents: messages, config });
  const candidate = response.candidates?.[0];
  // STOP can accompany tool calls. Other finish reasons indicate an incomplete turn.
  if (candidate?.finishReason && candidate.finishReason !== FinishReason.STOP) {
    throw new Error(`Gemini stopped with ${candidate.finishReason}; cannot continue an incomplete response.`);
  }
  const content = candidate?.content;
  if (!content?.parts?.length) {
    throw new Error("Gemini returned no content. The response may have been blocked.");
  }
  return content;
}

export function runTools(message, reminderFile = defaultReminderFile) {
  // Calls can occur anywhere among text parts; never assume parts[1].
  return message.parts.filter((part) => part.functionCall).map(({ functionCall: call }) => {
    console.log(`[Tool] ${call.name}(${JSON.stringify(call.args ?? {})})`);
    const result = executeToolCall(call, reminderFile);
    console.log(`[Result] ${JSON.stringify(result.functionResponse.response)}`);
    return result;
  });
}

export async function runConversation(ai, messages, { onMessage, reminderFile = defaultReminderFile, ...options } = {}) {
  // Commit only a completed turn, so a failed request cannot leave partial tool history.
  const turnMessages = [...messages];
  for (let request = 0; request < maxRequestsPerTurn; request++) {
    const content = await chat(ai, turnMessages, options);

    // Preserve the complete model content, including any thought signatures.
    addAssistantMessage(turnMessages, content);
    const wantsTools = hasToolRequests(content);
    if (!wantsTools && !textFromMessage(content).trim()) {
      throw new Error("Gemini returned no final text answer.");
    }
    // Let the CLI display visible text from both tool-request and final messages.
    onMessage?.(content);
    if (!wantsTools) {
      messages.push(...turnMessages.slice(messages.length));
      return content;
    }

    const parts = runTools(content, reminderFile);
    // Return every result together, in call order, before asking Gemini to continue.
    addUserMessage(turnMessages, parts);
  }

  throw new Error(`Stopped after ${maxRequestsPerTurn} Gemini requests without a final answer.`);
}

// Illustrate dependent calls: the second call uses the first call's actual result.
export function buildSequentialToolPreview() {
  const messages = [];
  addUserMessage(messages, "What day is 103 days from today in UTC?");
  const clockCall = { id: "preview-clock", name: "get_current_datetime", args: { date_format: "iso" } };
  addAssistantMessage(messages, [{ text: "First I need the current instant." }, { functionCall: clockCall }]);
  const clockResult = executeToolCall(clockCall);
  addUserMessage(messages, [clockResult]);

  const durationCall = {
    id: "preview-duration",
    name: "add_duration_to_datetime",
    args: { datetime: clockResult.functionResponse.response.output.datetime, days: 103 },
  };
  addAssistantMessage(messages, [{ text: "Now I can add 103 days." }, { functionCall: durationCall }]);
  const durationResult = executeToolCall(durationCall);
  addUserMessage(messages, [durationResult]);
  const { datetime, weekday } = durationResult.functionResponse.response.output;
  addAssistantMessage(messages, `103 days from the clock reading is ${weekday}, ${datetime} (UTC).`);
  return messages;
}

// Hand-written model messages for teaching; only the local clock function runs.
export function buildToolFlowPreview() {
  const messages = [];
  addUserMessage(messages, "What is today's date and the exact time as HH:MM:SS in UTC?");
  const modelContent = {
    role: "model",
    parts: [
      { text: "I will read the clock for the UTC date and time." },
      { functionCall: { id: "preview-date", name: "get_current_datetime", args: { date_format: "date" } } },
      { functionCall: { id: "preview-time", name: "get_current_datetime", args: { date_format: "time" } } },
    ],
  };
  addAssistantMessage(messages, modelContent);
  const calls = modelContent.parts.filter((part) => part.functionCall).map((part) => part.functionCall);
  const results = calls.map((call) => executeToolCall(call));
  addUserMessage(messages, results);
  const [date, time] = results.map((part) => part.functionResponse.response.output.datetime);
  addAssistantMessage(messages, `The UTC date is ${date} and the time is ${time}.`);
  return messages;
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.length > 1 || flags.some((flag) => !["--preview", "--list-reminders", "--check-reminders"].includes(flag))) {
    throw new Error("Usage: npm run lesson:08 -- [--preview | --list-reminders | --check-reminders]");
  }

  if (flags.includes("--list-reminders") || flags.includes("--check-reminders")) {
    const reminders = readReminders();
    const selected = flags.includes("--check-reminders")
      ? reminders.filter((reminder) => Date.parse(reminder.remind_at) <= Date.now()) : reminders;
    console.log(flags.includes("--check-reminders") ? "Due reminders (local check):" : "Saved reminders:");
    console.log(JSON.stringify(selected, null, 2));
    return;
  }

  if (flags.includes("--preview")) {
    console.log("Lesson 08: Tool Functions and Schemas (offline preview)\n");
    console.log("Gemini tool declarations:");
    console.log(JSON.stringify(toolSchemas, null, 2));
    console.log("\nDirect JavaScript calls (computer clock, UTC):");
    console.log(get_current_datetime());
    console.log(get_current_datetime({ date_format: "time" }));
    console.log("\nValidation error returned to Gemini:");
    console.log(executeToolCall({ id: "preview-invalid", name: "get_current_datetime", args: { date_format: "" } }));
    console.log("\nComplete multi-part exchange (hand-written model messages; real local tool results):");
    console.log(JSON.stringify(buildToolFlowPreview(), null, 2));
    console.log("\nSequential tool exchange: 103 days from today (hand-written model messages; real local tool results):");
    console.log(JSON.stringify(buildSequentialToolPreview(), null, 2));
    console.log("\nReminder example (calculation only; nothing saved):");
    console.log(add_duration_to_datetime({ datetime: "2050-01-01T09:00:00.000Z", days: 177 }));
    console.log("Then call set_reminder with reminder_text and that exact timestamp after the user has supplied the time and time zone.");
    console.log("\nNo API calls or generated files. The preview never saves reminders.");
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const messages = [];
  const rl = createInterface({ input, output });
  console.log("Lesson 08: Tool Functions and Schemas using Gemini");
  console.log("Ask: What day is 103 days from today in UTC? Or: What time is it in UTC?");
  console.log("Try: Save a reminder for my doctor's appointment 177 days after January 1, 2050, at 09:00 UTC.");
  console.log("Reminders are stored in output/lesson-08/reminders.json. Run --check-reminders to see due items; no background notifications.");
  console.log("Type \"exit\" to quit.\n");

  try {
    while (true) {
      const text = (await rl.question("You: ")).trim();
      if (text.toLowerCase() === "exit") {
        break;
      }
      if (!text) {
        continue;
      }
      addUserMessage(messages, text);
      await runConversation(ai, messages, {
        onMessage: (message) => {
          const text = textFromMessage(message).trim();
          if (text) {
            console.log(`Bot: ${text}\n`);
          }
        },
      });
    }
  } finally {
    rl.close();
  }
}

// Safe imports allow offline tests to exercise tools without starting the CLI.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Lesson 08 failed: ${error.message}`);
    process.exitCode = 1;
  });
}
