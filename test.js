import "dotenv/config";
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

async function chat(messages) {
  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config: {
      maxOutputTokens: 1000,
    },
  });

  return response.text;
}

async function main() {
  const messages = [];

  addUserMessage(messages, "Define mosquito in one sentence.");
  const firstAnswer = await chat(messages);
  console.log("First answer:", firstAnswer);

  addAssistantMessage(messages, firstAnswer);
  addUserMessage(messages, "Write another sentence and mention common mosquito types.");

  const finalAnswer = await chat(messages);
  console.log("\nFinal answer:", finalAnswer);
}

main().catch(console.error);