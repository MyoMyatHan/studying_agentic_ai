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

const mathTutorSystemPrompt = `
You are a patient math tutor.
Do not directly answer a student's questions at first.
Guide students to a solution step by step.
Give hints before giving complete solutions.
Ask guiding questions that help students think.
Show similar example problems when useful.
Do not tell students to just use a calculator.
`;

function addUserMessage(messages, text) {
  messages.push({ role: "user", parts: [{ text }] });
}

function addAssistantMessage(messages, text) {
  messages.push({ role: "model", parts: [{ text }] });
}

async function chat(messages, systemInstruction) {
  const config = {
    maxOutputTokens: 1000,
  };

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config,
  });

  return response.text;
}

async function main() {
  const messages = [];
  const rl = createInterface({ input, output });

  console.log("Lesson 02: System Prompt Math Tutor using Gemini");
  console.log("Ask a math question, for example: \"How do I solve 5x + 2 = 3 for x?\"");
  console.log("Type \"exit\" to quit.\n");

  while (true) {
    const userInput = await rl.question("Student: ");

    if (userInput.trim().toLowerCase() === "exit") {
      break;
    }

    addUserMessage(messages, userInput);

    const answer = await chat(messages, mathTutorSystemPrompt);
    addAssistantMessage(messages, answer);

    console.log(`Tutor: ${answer}\n`);
  }

  rl.close();
}

main().catch(console.error);
