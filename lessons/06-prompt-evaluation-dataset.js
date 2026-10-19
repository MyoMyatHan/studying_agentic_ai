import "dotenv/config";
import { writeFile } from "node:fs/promises";
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
      temperature: 1.0,
      stopSequences,
    },
  });

  return response.text;
}

async function generateDataset() {
  const prompt = `
Generate an evaluation dataset for prompt evaluation.
The dataset will be used to evaluate prompts that generate Python, JSON, or Regex specifically for AWS-related tasks.

Generate an array of JSON objects. Each object must have one "task" property describing a task that requires Python, JSON, or Regex to complete.

Example output:
[
  {
    "task": "Description of task"
  }
]

Rules:
- Focus on tasks that can be solved by writing a single Python function, a single JSON object, or a single regex.
- Focus on AWS-related tasks.
- Keep each task short and specific.
- Return exactly 3 objects.
`;

  const messages = [];
  addUserMessage(messages, prompt);

  // Prefill the assistant response so Gemini continues with raw JSON.
  addAssistantMessage(messages, "```json\n");

  // Stop when Gemini tries to close the markdown code block.
  const text = await chat(messages, ["```"]);
  return JSON.parse(text.trim());
}

async function main() {
  console.log("Lesson 06: Prompt Evaluation Dataset");
  console.log("Generating AWS coding tasks for prompt evaluation...\n");

  const dataset = await generateDataset();

  console.log("Generated dataset:");
  console.log(JSON.stringify(dataset, null, 2));

  await writeFile("dataset.json", JSON.stringify(dataset, null, 2));
  console.log("\nSaved dataset to dataset.json");
}

main().catch(console.error);
