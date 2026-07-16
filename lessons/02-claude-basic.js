import "dotenv/config";

// Lesson 02: Claude basic API
// Add your Claude API code here while following the course.
// Keep this file separate from Lesson 01 so each topic is easy to review.

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.log("ANTHROPIC_API_KEY is not set. Add it to your .env file when you start Claude lessons.");
}

console.log("Lesson 02: Claude basic API");
