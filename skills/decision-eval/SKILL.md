---
name: decision-eval
description: Score a discrete choice (classification, criteria check, risk triage, option pick) on the local decision model with the decision_score tool instead of reasoning it out in prose.

compatibility: Needs the decision_score tool, which is offered while this skill is enabled; it runs on the local decision model.
metadata:
  category: decisions
  author: Vakyartha
  version: "1.0.0"
allowed-tools: use_skill decision_score
---

# Discrete Decision Scoring

`decision_score` runs one question on the local decision model in a single pass and returns `choice`, `confidence` and every choice's `probabilities`. It is read-only and local. A score informs the answer; it grants no permission, and approvals still apply to whatever you do next.

## When to use

When the answer is one of 2-6 mutually exclusive options:

1. Risk triage of a proposed command or edit (read-only, mutation, network, dangerous).
2. Surface kind for a dataset (table, bar chart, line chart, stat, form).
3. Acceptance check before saying a task is done (satisfied, missing evidence, constraint violated, error).
4. Severity of a review finding (critical, major, minor, nit).
5. Picking between options against the user's stated constraints.

## Writing the call

- `text`: the material being judged, with the facts the choice depends on. Up to 8000 characters.
- `instructions`: the question, in one sentence.
- `choices`: short keys mapped to observable descriptions.

Rules:

1. Choices are mutually exclusive: every case fits exactly one.
2. Describe what can be observed ("modifies files on disk"), never quality words ("good", "appropriate").
3. Use 2-6 choices; 3-4 gives the best-calibrated probabilities.

Example (risk triage):

```json
{
  "text": "Command: rm -rf build/ && npm run build",
  "instructions": "What kind of effect does this command have?",
  "choices": {
    "read_only": "Only reads or inspects files, configuration or queries",
    "state_mutation": "Creates, changes or deletes files, records or settings",
    "network_egress": "Fetches URLs or sends data over the internet",
    "dangerous_system": "Touches system files, permissions or sandbox boundaries"
  }
}
```

Other choice sets:

- Surface kind: `table` (many records with several attributes), `bar_chart` (quantities per category), `line_chart` (values over time), `stat_metric` (one or two headline numbers), `form_input` (needs user input).
- Acceptance: `criteria_satisfied` (every requirement shown with output that matches), `missing_evidence` (claimed without a receipt or output), `constraint_violation` (breaks a stated rule or budget), `runtime_error` (denied, failed or crashed).

## Reading the result

- Confidence 0.85 or more: follow the choice.
- 0.70 to 0.85: follow it with conservative defaults, and say so if the next step changes anything.
- Below 0.70: do not guess. Ask the user a short question naming the leading options.
- An error result means the local decision model is unavailable: decide from the stated criteria and say the score was not available.

## Related skills

- `decision-chain`: several dependent questions in order.
- `code-review`, `compare-options`, `interactive-ui`, `surface-design` use this skill for their discrete choices.
