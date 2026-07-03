// step3.js
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: "AQ.Ab8RN6KEF3jK2tUWbHZhTvYzNLI-mXiUjTDgvPhznysmLleQNg" });

// 1. The tool "menu" — same as Step 2
const getCurrentTimeDeclaration = {
  name: "get_current_time",
  description: "Returns the current date and time for a given timezone.",
  parameters: {
    type: "object",
    properties: {
      timezone: {
        type: "string",
        description: "IANA timezone name, e.g. 'Asia/Yangon'",
      },
    },
    required: ["timezone"],
  },
};

// 2. The REAL function — this is what actually executes.
//    The model never runs this. Your code does.
function getCurrentTime({ timezone }) {
  return new Date().toLocaleString("en-US", { timeZone: timezone });
}

// A lookup table so we can find the real function by name later
const availableTools = {
  get_current_time: getCurrentTime,
};

async function main() {
  const userPrompt = "What time is it in Yangon right now?";

  // 3. First API call — give the model the prompt + the tool menu
  const firstResponse = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: userPrompt,
    config: {
      tools: [{ functionDeclarations: [getCurrentTimeDeclaration] }],
    },
  });

  const parts = firstResponse.candidates[0].content.parts;
  const functionCallPart = parts.find((p) => p.functionCall);

  if (!functionCallPart) {
    // Model didn't need a tool — just print its answer
    console.log("Model answered directly:", firstResponse.text);
    return;
  }

  // 4. Model asked for a tool — extract name + args
  const { name, args } = functionCallPart.functionCall;
  console.log(`Model requested tool: ${name}(${JSON.stringify(args)})`);

  // 5. Actually execute it for real
  const toolFunction = availableTools[name];
  const toolResult = toolFunction(args);
  console.log(`Tool actually returned: ${toolResult}`);

  // 6. Second API call — send the ORIGINAL prompt, the model's tool
  //    request, AND the real result, so it can respond in words.
  const secondResponse = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
      { role: "model", parts: [functionCallPart] },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              name,
              response: { result: toolResult },
            },
          },
        ],
      },
    ],
    config: {
      tools: [{ functionDeclarations: [getCurrentTimeDeclaration] }],
    },
  });

  console.log("\nFinal answer:", secondResponse.text);
}

main();