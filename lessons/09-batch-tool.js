import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { FinishReason, GoogleGenAI } from "@google/genai";

const model = "gemini-flash-latest";
const maxRequestsPerTurn = 5;
const systemInstruction = `You help users explore a fictional shop's local demo data.
Products are mug and notebook; shipping regions are local and international.
Use run_batch to look up requested products and shipping. Each invocation has a
tool_name and an arguments_json string: lookup_product takes {"product":"mug"};
lookup_shipping takes {"region":"local"}. Group independent lookups into one
batch of at most 10. Never put a call that depends on another result in the same
batch: receive that result first, then make another call if needed.
Ask about missing product or region details. Tool errors are data: explain them
or correct the arguments. Do not invent prices or confirm purchases.
All prices, stock, and shipping rules are teaching fixtures, not live shop data.`;

function validateObject(args, keys) {
  if (!args || typeof args !== "object" || Array.isArray(args)
    || Object.keys(args).some((key) => !keys.includes(key))) {
    throw new Error(`Expected an object containing only: ${keys.join(", ")}.`);
  }
}

// Async functions model read-only lookups; no network or file writes are needed.
export async function lookup_product(args) {
  validateObject(args, ["product"]);
  const products = new Map([
    ["mug", { product: "mug", price_usd: 12, in_stock: true }],
    ["notebook", { product: "notebook", price_usd: 8, in_stock: false }],
  ]);
  if (!products.has(args.product)) {
    throw new Error("Unknown product. Choose mug or notebook.");
  }
  return products.get(args.product);
}

export async function lookup_shipping(args) {
  validateObject(args, ["region"]);
  const regions = new Map([
    ["local", { region: "local", shipping_usd: 3, business_days: 2 }],
    ["international", { region: "international", shipping_usd: 15, business_days: 10 }],
  ]);
  if (!regions.has(args.region)) {
    throw new Error("Unknown region. Choose local or international.");
  }
  return regions.get(args.region);
}

const toolFunctions = new Map([
  ["lookup_product", lookup_product],
  ["lookup_shipping", lookup_shipping],
]);

/** @type {import("@google/genai").FunctionDeclaration} */
export const batchSchema = {
  name: "run_batch",
  description: "Runs 1 to 10 independent read-only lookups against fictional shop data. "
    + "Returns one ordered success or error entry per invocation. "
    + "lookup_product accepts product (mug or notebook); lookup_shipping accepts "
    + "region (local or international). Do not batch dependent operations.",
  parametersJsonSchema: {
    type: "object",
    properties: {
      invocations: {
        type: "array",
        minItems: 1,
        maxItems: 10,
        items: {
          type: "object",
          properties: {
            tool_name: { type: "string", enum: ["lookup_product", "lookup_shipping"] },
            arguments_json: {
              type: "string",
              description: 'JSON object string: {"product":"mug"} or {"region":"local"}.',
            },
          },
          required: ["tool_name", "arguments_json"],
          additionalProperties: false,
        },
      },
    },
    required: ["invocations"],
    additionalProperties: false,
  },
};

export async function run_batch(args) {
  validateObject(args, ["invocations"]);
  if (!Array.isArray(args.invocations) || args.invocations.length < 1 || args.invocations.length > 10) {
    throw new Error("invocations must contain 1 to 10 independent calls.");
  }
  // Promise.all keeps input order even when async operations finish out of order.
  // Catch inside each task so one failure does not discard successful siblings.
  const batch_output = await Promise.all(args.invocations.map(async (invocation, index) => {
    try {
      validateObject(invocation, ["tool_name", "arguments_json"]);
      const tool = toolFunctions.get(invocation.tool_name);
      if (!tool) {
        throw new Error("Unknown tool. Choose lookup_product or lookup_shipping; nested batches are not allowed.");
      }
      if (typeof invocation.arguments_json !== "string") {
        throw new Error("arguments_json must be a JSON object encoded as a string.");
      }
      const output = await tool(JSON.parse(invocation.arguments_json));
      return { index, tool_name: invocation.tool_name, output };
    } catch (error) {
      return { index, error: error.message };
    }
  }));
  return { source: "fictional_local_fixtures", batch_output };
}

export async function executeToolCall(call) {
  let response;
  try {
    if (call.name !== "run_batch") {
      throw new Error("Only run_batch is exposed to Gemini.");
    }
    response = { output: await run_batch(call.args) };
  } catch (error) {
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

export function textFromMessage(message) {
  return message.parts.filter((part) => typeof part.text === "string" && !part.thought)
    .map((part) => part.text).join("\n");
}

export async function chat(ai, messages) {
  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config: {
      maxOutputTokens: 2000,
      systemInstruction,
      tools: [{ functionDeclarations: [batchSchema] }],
    },
  });
  const candidate = response.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== FinishReason.STOP) {
    throw new Error(`Gemini stopped with ${candidate.finishReason}; response is incomplete.`);
  }
  if (!candidate?.content?.parts?.length) {
    throw new Error("Gemini returned no content.");
  }
  return candidate.content;
}

export async function runConversation(ai, messages, { onMessage } = {}) {
  const turn = [...messages];
  for (let request = 0; request < maxRequestsPerTurn; request++) {
    const content = await chat(ai, turn);
    // Preserve all model parts, including thought signatures, in follow-up history.
    turn.push(content);
    const calls = content.parts.filter((part) => part.functionCall).map((part) => part.functionCall);
    if (calls.length === 0 && !textFromMessage(content).trim()) {
      throw new Error("Gemini returned no final text answer.");
    }
    onMessage?.(content);
    if (calls.length === 0) {
      messages.push(...turn.slice(messages.length));
      return content;
    }
    const results = [];
    // Each top-level call gets one result, even if its batch contains many lookups.
    for (const call of calls) {
      results.push(await executeToolCall(call));
    }
    turn.push({ role: "user", parts: results });
  }
  throw new Error(`Stopped after ${maxRequestsPerTurn} Gemini requests without a final answer.`);
}

export async function buildPreview() {
  const call = {
    id: "preview-batch",
    name: "run_batch",
    args: {
      invocations: [
        { tool_name: "lookup_product", arguments_json: '{"product":"mug"}' },
        { tool_name: "lookup_shipping", arguments_json: '{"region":"local"}' },
        { tool_name: "lookup_product", arguments_json: '{"product":"unknown"}' },
      ],
    },
  };
  return [
    { role: "user", parts: [{ text: "Look up a mug, local shipping, and an unknown product in the demo shop." }] },
    { role: "model", parts: [{ text: "These lookups are independent." }, { functionCall: call }] },
    { role: "user", parts: [await executeToolCall(call)] },
    { role: "model", parts: [{ text: "Demo data: the mug costs $12 and is in stock; local shipping costs $3 and takes 2 business days. The unknown product lookup failed." }] },
  ];
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== "--preview")) {
    throw new Error("Supported option: --preview.");
  }
  if (flags.includes("--preview")) {
    console.log("Lesson 09: The Batch Tool (offline preview)");
    console.log(JSON.stringify(batchSchema, null, 2));
    console.log("\nHand-written model messages with real local tool results:");
    console.log(JSON.stringify(await buildPreview(), null, 2));
    console.log("\nNo API calls or generated files. All shop data is fictional.");
    return;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }
  const ai = new GoogleGenAI({ apiKey });
  const messages = [];
  const rl = createInterface({ input, output });
  console.log("Lesson 09: The Batch Tool using Gemini (fictional shop data)");
  console.log("Try: Look up the mug and notebook, and local shipping, in one batch.");
  console.log('Type "exit" to quit.\n');
  try {
    while (true) {
      const text = (await rl.question("You: ")).trim();
      if (text.toLowerCase() === "exit") {
        break;
      }
      if (!text) {
        continue;
      }
      messages.push({ role: "user", parts: [{ text }] });
      await runConversation(ai, messages, {
        onMessage: (message) => {
          const text = textFromMessage(message);
          if (text.trim()) {
            console.log(`Bot: ${text}\n`);
          }
          for (const part of message.parts.filter((part) => part.functionCall)) {
            console.log(`[Tool] ${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})`);
          }
        },
      });
    }
  } finally {
    rl.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Lesson 09 failed: ${error.message}`);
    process.exitCode = 1;
  });
}
