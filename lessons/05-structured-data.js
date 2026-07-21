import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
}

const ai = new GoogleGenAI({ apiKey });
const model = "gemini-flash-latest";

function addUserMessage(messages, text) {
  messages.push({ role: "user", parts: [{ text }] });
}

function addAssistantMessage(messages, text) {
  messages.push({ role: "model", parts: [{ text }] });
}

async function chat(messages, stopSequences = []) {
  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config: {
      maxOutputTokens: 1000,
      stopSequences,
    },
  });

  return response.text;
}

function cleanJsonText(text) {
  return text.trim();
}

async function generateEventBridgeRule(description) {
  const messages = [];

  addUserMessage(
    messages,
    `Generate a short AWS EventBridge rule as raw JSON for this request: ${description}`
  );

  // Prefill the assistant response so Gemini continues inside a JSON code block.
  addAssistantMessage(messages, "```json\n");

  // Stop when Gemini tries to close the code block.
  const text = await chat(messages, ["```"]);
  return cleanJsonText(text);
}

async function main() {
  const rl = createInterface({ input, output });

  console.log("Lesson 05: Structured Data using Gemini");
  console.log("This lesson uses assistant message prefilling and stop sequences.");
  console.log("The goal is clean JSON without markdown fences or extra explanation.");
  console.log("Type \"exit\" to quit.\n");

  while (true) {
    const userInput = await rl.question("Describe the EventBridge rule: ");

    if (userInput.trim().toLowerCase() === "exit") {
      break;
    }

    const jsonText = await generateEventBridgeRule(userInput);

    try {
      const parsedJson = JSON.parse(jsonText);
      console.log("\nRaw JSON:");
      console.log(JSON.stringify(parsedJson, null, 2));
      console.log();
    } catch {
      console.log("\nGemini returned text that was not valid JSON:");
      console.log(`${jsonText}\n`);
    }
  }

  rl.close();
}

main().catch(console.error);
