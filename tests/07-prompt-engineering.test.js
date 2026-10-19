import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  PromptEvaluator,
  criteria,
  buildInitialPrompt,
  buildImprovedPrompt,
  validateDataset,
  validateGrade,
  buildHtmlReport,
} from "../lessons/07-prompt-engineering.js";

const dataset = [
  { height: 180, weight: 75, goal: "Endurance", restrictions: "Vegetarian" },
  { height: 165, weight: 60, goal: "Strength", restrictions: "Dairy-free" },
  { height: 170, weight: 70, goal: "Maintain weight", restrictions: "No peanuts" },
];
const grade = {
  scores: Object.fromEntries(Object.keys(criteria).map((key) => [key, 1])),
  feedback: "Test feedback only; this is not a real model grade.",
};

test("dataset generation validates case count and required inputs", async () => {
  const evaluator = new PromptEvaluator({
    chat: async (prompt, options) => {
      assert.match(prompt, /exactly 3/);
      assert.equal(options.schema.minItems, 3);
      return JSON.stringify(dataset);
    },
  });
  assert.deepEqual(await evaluator.generateDataset(3), dataset);
  assert.throws(() => validateDataset(dataset, 2), /exactly 2/);
  assert.throws(() => validateDataset([{ ...dataset[0], weight: "75" }], 1), /weight/);
  assert.throws(() => validateDataset([{ ...dataset[0], restrictions: "" }], 1), /restrictions/);
  const invalid = new PromptEvaluator({ chat: async () => "not JSON" });
  await assert.rejects(invalid.generateDataset(3), SyntaxError);
});

test("comparison uses the same inputs and never exceeds configured concurrency", async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const evaluator = new PromptEvaluator({
    maxConcurrentTasks: 2,
    chat: async (prompt, options) => {
      active++;
      peak = Math.max(peak, active);
      calls++;
      await new Promise((done) => setImmediate(done));
      active--;
      if (options?.schema) {
        assert.match(prompt, /fixed rubric/);
        assert.ok(options.systemInstruction.includes("not verified nutrition accuracy"));
        return JSON.stringify(grade);
      }
      return `Fake answer to ${prompt}`;
    },
  });
  const baseline = await evaluator.runEvaluation(dataset, buildInitialPrompt);
  const improved = await evaluator.runEvaluation(dataset, buildImprovedPrompt);
  assert.equal(calls, 12);
  assert.equal(peak, 2);
  assert.equal(baseline.average, 5);
  assert.equal(improved.average, 5);
  assert.deepEqual(baseline.results.map((item) => item.inputs), dataset);
  assert.deepEqual(improved.results.map((item) => item.inputs), dataset);
  assert.deepEqual(baseline.results.map((item) => item.case), [1, 2, 3]);
  assert.ok(improved.results.every((item, index) => item.prompt.startsWith(baseline.results[index].prompt)));
});

test("invalid grades are rejected and cannot inflate a score", () => {
  assert.equal(validateGrade(grade).score, 5);
  for (const value of [-1, 3, "2", 1.5]) {
    assert.throws(() => validateGrade({ ...grade, scores: { ...grade.scores, calories: value } }), /calories/);
  }
  assert.throws(() => validateGrade({ scores: {}, feedback: "missing" }), /calories/);
  assert.throws(() => validateGrade({ ...grade, scores: { ...grade.scores, bonus: 2 } }), /unexpected/);
});

test("failed cases preserve available answers and prevent a misleading average", async () => {
  const evaluator = new PromptEvaluator({
    maxConcurrentTasks: 1,
    chat: async (prompt, options) => {
      if (!options?.schema) {
        if (prompt.includes("165 cm")) throw new Error("Simulated quota error");
        return "Available answer";
      }
      if (prompt.includes('"height":180')) return "malformed grader JSON";
      return JSON.stringify(grade);
    },
  });
  const result = await evaluator.runEvaluation(dataset, buildInitialPrompt);
  assert.equal(result.average, null);
  assert.equal(result.completed, 1);
  assert.equal(result.results[0].answer, "Available answer");
  assert.equal(result.results[0].status, "error");
  assert.equal(result.results[1].answer, null);
  assert.match(result.results[1].error, /quota/);
  assert.equal(result.results[2].status, "ok");
  assert.throws(() => new PromptEvaluator({ chat: async () => "", maxConcurrentTasks: 0 }), /positive integer/);
});

test("HTML report escapes model content and labels incomplete comparisons", () => {
  const attack = '<script>alert("x")</script>';
  const evaluation = {
    average: null,
    results: [{ case: 1, inputs: { goal: attack }, prompt: attack, answer: attack, status: "error", error: attack }],
  };
  const html = buildHtmlReport({
    createdAt: "test", model: "fake", criteria, settings: {},
    baseline: evaluation, improved: evaluation, delta: null,
  });
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.match(html, /unavailable \(incomplete evaluation\)/);
  assert.match(html, /Failed/);
});

test("CLI preview needs no key, and CLI errors return failing exit codes", () => {
  const env = { ...process.env, GEMINI_API_KEY: "" };
  const run = (...flags) => spawnSync(process.execPath, ["lessons/07-prompt-engineering.js", ...flags], {
    encoding: "utf8", env,
  });
  const preview = run("--preview");
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /BASELINE PROMPT/);
  assert.match(preview.stdout, /IMPROVED PROMPT/);
  assert.match(preview.stdout, /no scores were generated/);
  const missingKey = run();
  assert.equal(missingKey.status, 1);
  assert.match(missingKey.stderr, /GEMINI_API_KEY is not set/);
  const unknown = run("--unknown");
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Unknown option/);
});
