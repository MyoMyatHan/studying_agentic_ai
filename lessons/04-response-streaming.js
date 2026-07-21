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

function getChunkText(chunk) {
  if (typeof chunk.text === "function") {
    return chunk.text();
  }

  if (typeof chunk.text === "string") {
    return chunk.text;
  }

  const parts = chunk.candidates?.[0]?.content?.parts ?? [];
  return parts.map((part) => part.text ?? "").join("");
}

function getFinishReason(chunk) {
  return chunk.candidates?.[0]?.finishReason ?? null;
}

async function streamChat(messages) {
  const stream = await ai.models.generateContentStream({
    model,
    contents: messages,
    config: {
      maxOutputTokens: 3000,
    },
  });

  let fullResponse = "";
  let finishReason = null;

  for await (const chunk of stream) {
    const text = getChunkText(chunk);
    fullResponse += text;
    process.stdout.write(text);

    finishReason = getFinishReason(chunk) ?? finishReason;
  }

  if (finishReason && finishReason !== "STOP") {
    process.stdout.write(`\n\n[Stream ended early. Finish reason: ${finishReason}]`);
  }

  return fullResponse;
}

async function main() {
  const messages = [];
  const rl = createInterface({ input, output });

  console.log("Lesson 04: Response Streaming using Gemini");
  console.log("Streaming shows text as it is generated instead of waiting for the full answer.");
  console.log("This makes chat apps feel faster and more responsive.");
  console.log("Type \"exit\" to quit.\n");

  while (true) {
    const userInput = await rl.question("You: ");

    if (userInput.trim().toLowerCase() === "exit") {
      break;
    }

    addUserMessage(messages, userInput);

    process.stdout.write("Bot: ");
    const answer = await streamChat(messages);
    addAssistantMessage(messages, answer);
    process.stdout.write("\n\n");
  }

  rl.close();
}

main().catch(console.error);
