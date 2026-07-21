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

function parseTemperature(value) {
  const temperature = Number.parseFloat(value);

  if (Number.isNaN(temperature) || temperature < 0 || temperature > 1) {
    return null;
  }

  return temperature;
}

async function chat(messages, temperature = 1.0) {
  const response = await ai.models.generateContent({
    model,
    contents: messages,
    config: {
      maxOutputTokens: 1000,
      temperature,
    },
  });

  return response.text;
}

async function main() {
  const messages = [];
  const rl = createInterface({ input, output });

  console.log("Lesson 03: Temperature using Gemini");
  console.log("Temperature controls how predictable or creative the response feels.");
  console.log("Use low values like 0.0 for consistent answers and high values like 1.0 for creative answers.");
  console.log("Type a prompt, then choose a temperature from 0.0 to 1.0.");
  console.log("Try asking for movie ideas at 0.0, then ask again at 1.0.");
  console.log("Type \"exit\" to quit.\n");

  while (true) {
    const userInput = await rl.question("You: ");

    if (userInput.trim().toLowerCase() === "exit") {
      break;
    }

    const temperatureInput = await rl.question("Temperature (0.0 - 1.0, default 1.0): ");
    const temperature = temperatureInput.trim() === "" ? 1.0 : parseTemperature(temperatureInput);

    if (temperature === null) {
      console.log("Please enter a number from 0.0 to 1.0.\n");
      continue;
    }

    addUserMessage(messages, userInput);

    const answer = await chat(messages, temperature);
    addAssistantMessage(messages, answer);

    console.log(`Temperature: ${temperature}`);
    console.log(`Bot: ${answer}\n`);
  }

  rl.close();
}

main().catch(console.error);
