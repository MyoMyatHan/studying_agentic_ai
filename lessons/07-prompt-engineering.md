# Lesson 07: Prompt engineering through evaluation

Prompt engineering means revising a prompt and checking whether the revision
actually helps. This lesson adapts your course's meal-plan example to the
repository's Node.js and Gemini setup. It implements a small `PromptEvaluator`
locally; no external evaluator package or notebook is required.

## Current episode: providing examples

Examples demonstrate the response pattern instead of describing it only in
words. A sample input paired with a useful output can show the desired format,
tone, level of detail, or handling of a difficult case.

| Mode | Baseline | Candidate |
| --- | --- | --- |
| Default one-shot | The XML prompt without examples. | The exact same prompt plus one input/output example. |
| `--multi-shot` | The XML prompt without examples. | The exact same prompt plus two input/output examples. |

Both modes keep the current athlete inputs, task, guidelines, and grader rubric
fixed. Multi-shot is another comparison against no examples; its score change
does not directly measure improvement over one-shot. More examples also mean
more input tokens; they do not guarantee better scores.

### How the examples are structured

`promptExamples` contains two hand-written teaching fixtures. One illustrates
vegetarian, peanut-free choices on a limited budget. The other illustrates
vegan, dairy-free choices without peanut or tree-nut ingredients. Each contains
`inputs`, an `output`, and a short `explanation` of its useful qualities.

`buildExamplesPrompt()` appends the selected fixtures to `buildXmlPrompt()`:

```xml
<examples>
<example>
<sample_input>
...sample athlete height, weight, goal, and restrictions...
</sample_input>
<ideal_output>
...example meal schedule, gram portions, estimated totals, and goal alignment...
</ideal_output>
<why_this_is_good>
...which output qualities this example demonstrates...
</why_this_is_good>
</example>
</examples>
```

The excerpts above describe the layout; use preview to read the complete
examples. Example contents are XML-escaped, and the current athlete stays in
the separate `athlete_information` section. The final instruction asks for a
new answer adapted to the current inputs, rather than a copied sample plan.

The tag name `ideal_output` identifies the target response pattern. These
fixtures are not claimed to be model-scored, perfect, or nutritionally verified.
Their illustrative meal totals add to their daily totals, and the macro/calorie
arithmetic is consistent; that does not verify nutrients for the listed foods.
Report metadata records the example count and their hand-written origin.

### One-shot versus multi-shot

One-shot provides one pair to establish a pattern. Multi-shot provides several
pairs to cover different cases. Choose examples relevant to the actual task:
restriction conflicts for meal planning, sarcasm for sentiment classification,
or missing fields for a JSON extraction task. A sentiment example inside a
meal-planning prompt would not demonstrate the required response format.

### Choosing examples from evaluation reports

1. Run development evaluations and inspect `results.json` or the HTML report.
   Find successful cases with strong scores and useful feedback.
2. Review their answers manually against the rubric. A model-assigned 10/10
   is a candidate for review, not proof of correctness.
3. Copy the selected result's `inputs` and `answer` into a `promptExamples`
   entry's `inputs` and `output`. Write a concise `explanation` stating why
   it is useful. Prefer examples addressing recurring failures.
   If you replace the teaching fixtures with evaluated answers, update the
   provenance wording in `buildExamplesPrompt()` and `selectExperiment()` too.
4. Keep those demonstration inputs outside your evaluation dataset. Use
   separate held-out cases for final validation, including similar corner
   cases with different inputs. Do not tune examples on that final test set.
5. Re-evaluate both prompt versions on the same cases and compare their
   answers, not only the average score.

Before generating evaluated answers, the lesson checks selected examples
against the saved dataset and rejects exact duplicate input profiles (ignoring
case and outer whitespace). It does not detect paraphrases or near-duplicates,
so review the split yourself when replacing examples.

## Previous episode: structure with XML tags

This experiment keeps the specific prompt's opening and six guidelines, then
wraps the four athlete-data lines in a descriptive tag pair. It tests whether
making the data boundary explicit helps on the same cases and rubric.

| Version | What it contains |
| --- | --- |
| Baseline | The clear opening, athlete data, and six output guidelines. |
| XML | The same prompt, with athlete data inside `<athlete_information>` tags. |

Here is the data section in the XML version (the opening stays before it and
the existing guidelines stay after it):

```xml
<athlete_information>
- Height: 180 cm
- Weight: 75 kg
- Goal: Support endurance training
- Dietary restrictions: Vegetarian; no peanuts
</athlete_information>
```

`buildXmlPrompt()` creates this version. Removing the wrapper lines gives the
baseline prompt for ordinary text inputs. Both versions share the same data
formatter and guideline text, so no new quality requirements are introduced.
Characters such as `&`, `<`, and `>` in interpolated values are escaped in the
XML version so literal data cannot introduce extra tag boundaries. Their text
meaning is retained; the plain-text versions remain unchanged.

### What the tags do

Tags group related context and label its role. Use names that explain the
content: `<athlete_information>`, `<sales_records>`, `<my_code>`, or `<docs>`
rather than a vague `<data>`. Use matching opening and closing names, and keep
the task instructions outside data sections.

These are XML-style prompt delimiters. The application sends a text prompt;
it does not parse XML or require the whole prompt to be an XML document.
Tags clarify boundaries but do not guarantee that a model will follow every
instruction. They do not make untrusted content authoritative or safe to execute.

The technique is especially relevant when a prompt contains long context or
multiple kinds of material, such as code plus documentation. This short
meal-plan example makes the structure easy to inspect; its scores may change
little or not at all. Measure the effect rather than assuming an improvement.

## Previous episode: being specific

The previous episode gave the prompt a clear first line. This episode keeps
that first line and the athlete inputs, then adds **output quality guidelines**.
Select this comparison with `--being-specific`:

| Version | What it contains |
| --- | --- |
| Baseline | The clear-and-direct opening plus athlete inputs. |
| Specific | The exact baseline prompt followed by six output guidelines. |

The guidelines request daily calories in kcal, daily protein/fat/carbohydrate
totals in grams, meal/snack timing, restriction-compatible ingredients, every
food's portion size in grams, and budget awareness when mentioned. Nutrition
values are labeled estimates; requesting accurate values does not verify them.
A budget can be mentioned in the existing `goal` or `restrictions` text. The
prompt does not invent one when none is supplied.

These guidelines define **what a useful answer should contain**. The fixed
grader rubric is unchanged, so the comparison tests the added guidance rather
than a new scoring system. That rubric does not separately score gram-only
portions or budget adherence; inspect those details in the answers manually.
Expanding the rubric would require establishing a new baseline for both prompts.

Your course reports 3.92 to 7.86 for its example. These are course results,
not scores measured by this Gemini lesson. Scores may improve, stay the same,
or worsen on your saved cases.

### Output guidelines versus process steps

| Approach | Purpose | Example |
| --- | --- | --- |
| Output quality guidelines | Describe the final answer's content, length, format, or tone. | Include calorie/macronutrient totals, meal times, and food portions in grams. |
| Process steps | Specify an ordered workflow for a more complex task. | Extract constraints, draft a plan, check the plan against restrictions, then return it. |

The specificity experiment adds output guidelines only. Process steps can be tested as
a later change. For example, keep all the guidelines and append:

```text
Before returning the final plan:
1. Identify the supplied dietary restrictions and any budget constraint.
2. Draft meals using compatible ingredients.
3. Check portions, estimated totals, and meal timing against the guidelines.
Return the final meal plan and a brief constraint checklist.
```

This asks for task actions and a concise checkable result. It does not require
a transcript of the model's private reasoning. Combining output guidelines
and process steps can be useful, but add them in separate experiments to see
which change helps.

## Previous episode: being clear and direct

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

Select this earlier experiment with `--clear-and-direct`. It has no appended
guidelines: only the first line changes. Its improved prompt becomes the
baseline for the specificity experiment. The shared rubric still checks
calories, macros, portions/timing, restrictions, and fit in all experiment modes.

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
                              Apply one prompting technique
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
# Preview the XML prompt versus that same prompt with one example.
npm run lesson:07 -- --preview

# Generate cases on the first run, then compare the two prompts.
npm run lesson:07

# Explicitly replace this lesson's cases and start a new comparison.
npm run lesson:07 -- --generate-dataset

# Compare the XML prompt with two examples (preview or live).
npm run lesson:07 -- --multi-shot --preview
npm run lesson:07 -- --multi-shot

# Revisit the XML-tag experiment (preview or live).
npm run lesson:07 -- --xml-tags --preview
npm run lesson:07 -- --xml-tags

# Revisit the output-guidelines experiment (preview or live).
npm run lesson:07 -- --being-specific --preview
npm run lesson:07 -- --being-specific

# Revisit the previous opening-line-only experiment (preview or live).
npm run lesson:07 -- --clear-and-direct --preview
npm run lesson:07 -- --clear-and-direct
```

`--providing-examples` explicitly selects the default one-shot experiment. Choose at most one
experiment flag; each can be combined with `--preview` or `--generate-dataset`.
Preview takes precedence over dataset generation and writes no files.

Edit `settings` near the top of `07-prompt-engineering.js` to adjust `numCases`
or `maxConcurrentTasks`. Start with 2-3 cases and concurrency 3; use concurrency
1 if you hit rate limits. There is no automatic retry loop. If you change the
case count, explicitly regenerate the dataset or provide a matching saved one.

A first run with three cases makes 13 application-level Gemini requests:
one for dataset generation, then six for each prompt (three answers and three
grades). Later runs reuse the dataset and make 12. Examples are stored locally
and add input tokens without adding model calls. Failed calls or SDK-level
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
3. **Establish the baseline.** `selectExperiment()` chooses the prompt pair.
   By default and with `--multi-shot`, `buildXmlPrompt()` supplies the baseline.
   `--xml-tags` uses the specific `buildImprovedPrompt()` as its baseline.
   `--being-specific` starts with `buildClearAndDirectPrompt()`, and
   `--clear-and-direct` starts with the vague `buildInitialPrompt()`.
   The grader sees the same rubric in all experiment modes.
4. **Evaluate it.** `runEvaluation()` generates one answer per case, then uses
   a separate Gemini request to grade that answer against the fixed rubric.
   It validates grader JSON and computes the total locally. The grade includes
   short feedback you can act on.
5. **Apply a technique.** The default candidate, `buildExamplesPrompt()`, appends
   one sample input/output pair and an explanation. Multi-shot appends two.
   The earlier candidates wrap athlete data, add output guidelines, or replace
   the opening question, respectively. Process steps remain a separate experiment.
6. **Re-evaluate fairly.** Both versions use the same saved cases, rubric,
   model, temperature (0), and token limit. Compare averages and individual
   cases, then inspect the actual answers and feedback.
7. **Repeat.** Make one change to the selected candidate, run again, and
   compare the saved reports. Keep the dataset and rubric unchanged during
   the experiment. Shared formatter/guideline edits affect both example versions;
   preserve the baseline when testing a new candidate instruction.

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
labels for both prompt versions. Example experiments also record the example
count and source. Each case retains its exact prompt, including sample content. The HTML
report uses those labels and includes the same metadata under
"Experiment, fixed rubric, and run settings" so you can identify this episode
when reviewing reports later. Older reports remain as they were; use each
new run's paired comparison rather than assuming old scores are comparable.

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

1. Preview the default experiment and check that the XML baseline stays intact
   while one labeled example and its explanatory context are appended.
2. Run once, then inspect the lowest-scoring case in the HTML report.
3. Change one instruction to address its feedback and run again.
4. Record the change, old/new averages, and whether other cases got worse.
5. Check a fresh dataset only after you finish tuning on the original one.
6. Use `--clear-and-direct --preview` to review the earlier opening-line change.
7. Use `--being-specific --preview` to review the addition of output guidelines.
8. Use `--xml-tags --preview` to review context boundaries, and use
   `--multi-shot --preview` to inspect both sample pairs.

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
