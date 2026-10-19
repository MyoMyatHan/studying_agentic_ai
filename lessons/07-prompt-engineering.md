# Lesson 07: Prompt engineering through evaluation

Prompt engineering means revising a prompt and checking whether the revision
actually helps. This lesson adapts your course's meal-plan example to the
repository's Node.js and Gemini setup. It implements a small `PromptEvaluator`
locally; no external evaluator package or notebook is required.

## Current episode: being clear and direct

Lead with an instruction that tells the model what to do. Use a direct action
verb, name the output, and state the main constraints in simple language.

| Version | Opening line |
| --- | --- |
| Baseline | What should this person eat? |
| Clear and direct | Generate a one-day meal plan for an athlete that meets their dietary restrictions. |

The new opening names the action (**Generate**), the output (**meal plan**),
and its scope (**one day**, **an athlete**, **dietary restrictions**).
Both prompts then include exactly the same height, weight, goal, and
restriction lines. The shared `buildMealPlanPrompt()` helper keeps that body
identical, so the comparison isolates the opening-line change.

The earlier version appended a detailed output checklist after the vague
question. This episode replaces that experiment with a clear first line.
The checklist is removed from the compared prompt; adding it now would test
another technique at the same time. The grading rubric still checks calories,
macros, portions/timing, restrictions, and fit, so some omissions may remain.

Your course reports a change from 2.32 to 3.92 in its example. Those are course
results, not measured results from this Gemini lesson. Run the evaluation to
find out whether this change helps on your saved cases.

## The process to remember

```text
Set the goal and rubric
         |
Generate a small dataset and keep it fixed
         |
Write a basic prompt -> Generate answers -> Grade answers
                                               |
                                  Inspect scores and feedback
                                               |
                              Clarify the opening line
                                               |
                                  Re-run the same evaluation
                                               |
                       Keep, revise, or undo the change; repeat
```

An iteration is an experiment. A change may improve, worsen, or leave scores
unchanged. A low baseline score is possible, but no particular score is expected.

## Run the lesson

From the repository root, install dependencies with `npm ci` if needed. Live
runs use the existing local `.env` variable `GEMINI_API_KEY`.

```bash
# Read the two prompts and rubric without API calls or generated files.
npm run lesson:07 -- --preview

# Generate cases on the first run, then compare the two prompts.
npm run lesson:07

# Explicitly replace this lesson's cases and start a new comparison.
npm run lesson:07 -- --generate-dataset
```

Edit `settings` near the top of `07-prompt-engineering.js` to adjust `numCases`
or `maxConcurrentTasks`. Start with 2-3 cases and concurrency 3; use concurrency
1 if you hit rate limits. There is no automatic retry loop. If you change the
case count, explicitly regenerate the dataset or provide a matching saved one.

A first run with three cases makes 13 application-level Gemini requests:
one for dataset generation, then six for each prompt (three answers and three
grades). Later runs reuse the dataset and make 12. Failed calls or SDK-level
retries can change actual usage. Concurrency limits in-flight case workers,
not requests per minute; each worker generates then grades sequentially.

## Walk through the code

1. **Define success before writing a better prompt.** `criteria` describes five
   requirements. Each gets 0, 1, or 2 points, giving a total out of 10. Zero means
   absent or violated, one means partial, and two means fully satisfied.
2. **Generate inputs.** `PromptEvaluator.generateDataset()` asks Gemini for
   synthetic adult athlete inputs: `height` in cm, `weight` in kg, `goal`, and
   `restrictions`. JSON schema guides generation; local checks validate the
   number of cases, numeric ranges, and non-empty strings before saving.
3. **Establish the baseline.** `buildInitialPrompt()` asks only "What should
   this person eat?" and supplies the inputs. It deliberately leaves output
   requirements unspecified. Notice that only the grader sees the rubric.
4. **Evaluate it.** `runEvaluation()` generates one answer per case, then uses
   a separate Gemini request to grade that answer against the fixed rubric.
   It validates grader JSON and computes the total locally. The grade includes
   short feedback you can act on.
5. **Apply a technique.** `buildImprovedPrompt()` replaces only the vague
   opening question with the direct instruction shown above. The athlete
   inputs stay identical, and no checklist or other instructions are appended.
6. **Re-evaluate fairly.** Both versions use the same saved cases, rubric,
   model, temperature (0), and token limit. Compare averages and individual
   cases, then inspect the actual answers and feedback.
7. **Repeat.** Edit one instruction in `buildImprovedPrompt()`, run again, and
   compare the saved reports. Keep the dataset and rubric unchanged during
   the experiment. If you change them, establish a new baseline.

The course's additional evaluation criteria are represented here by the
`criteria` object. Freeze it before comparing versions. The grader is given
the athlete inputs and candidate answer, without the baseline/improved label.

## Files you will get

```text
output/lesson-07/
  dataset.json          # Reused on later runs
  run-<unique suffix>/  # A new directory for every completed comparison
    results.json       # Experiment, inputs, exact prompts, answers, grades, errors
    report.html        # Open in a browser to review both versions case by case
```

These local outputs are ignored by Git. Lesson 06's root `dataset.json` is a
separate AWS dataset and is not used or changed. A malformed saved lesson 07
dataset produces an error instead of being silently replaced.

Reports show the two averages and their difference in points, plus every
case's answer, five component scores, and feedback. If generation or grading
fails for any case, its error is saved, that version has no average, and the
comparison has no score change. The command exits with an error in that case.
Earlier successful reports are preserved.

The JSON report's `experiment` field records the technique, the change, and
both opening lines. The HTML report includes the same metadata under
"Experiment, fixed rubric, and run settings" so you can identify this episode
when reviewing reports later. Reports from the earlier checklist experiment
remain as they were; use the new run's paired comparison for this episode.

## How to interpret the results

- A positive change means the grader preferred the revision on these cases;
  inspect which criteria improved. An unchanged or negative result is useful
  evidence too. Do not assume every longer prompt is better.
- Model grading is approximate. The same model both writes and grades here,
  so self-evaluation bias is possible. Review its judgments manually.
- Temperature 0 reduces one source of variation; it does not guarantee
  reproducibility. The `gemini-flash-latest` alias can also change over time.
- Three cases are a quick development check. For later validation, use more
  diverse cases and an unseen set that you did not use to tune the prompt.
- These fictional meal plans teach prompt evaluation. Rubric scores do not
  verify nutrition calculations, allergy safety, or suitability for a person.

## Small exercises for your next review

1. Preview both prompts and check that only their first lines differ.
2. Run once, then inspect the lowest-scoring case in the HTML report.
3. Change one instruction to address its feedback and run again.
4. Record the change, old/new averages, and whether other cases got worse.
5. Check a fresh dataset only after you finish tuning on the original one.

## Offline checks and references

```bash
node --check lessons/07-prompt-engineering.js
node --test tests/07-prompt-engineering.test.js
```

The tests use fake responses, make no Gemini calls, and produce no real grades.
The preview also produces no grades. This lesson uses Gemini's structured JSON
output for datasets and grades; see the
[official structured-output guide](https://ai.google.dev/gemini-api/docs/structured-output).
The SDK options used here are also declared in the installed `@google/genai`
types. Unlike lessons 05-06, this lesson does not demonstrate response prefilling.

The implementation follows the course notes you supplied. The signed notebook
attachment could not be opened during implementation, so this is an adaptation
of the described process rather than a copy of that notebook.
