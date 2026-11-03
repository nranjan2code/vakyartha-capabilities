---
name: decision-chain
description: Break a multi-part judgement into ordered decision_score calls, where later questions depend on earlier answers, and combine their confidence.

compatibility: Needs the decision_score tool, which is offered while this skill is enabled; it runs on the local decision model.
metadata:
  category: decisions
  author: Vakyartha
  version: "1.0.0"
allowed-tools: use_skill decision_score
---

# Decision Chains

Some judgements are several dependent questions: first the domain, then the kind of operation, and only for a mutation, the risk. Ask them one `decision_score` call at a time instead of one large question. Follow `decision-eval` for how to write each call and read its result.

## How to run a chain

1. Write the steps before the first call: each step's question, its 2-6 choices, and the condition under which it runs (for example, "only if step 1 chose `state_mutation`").
2. Call `decision_score` for the first step.
3. For each later step, check its condition against the earlier answers and skip it when the condition fails. Include the earlier choices in `text` ("Step 1: state_mutation (0.91)") so each judgement sees what came before.
4. Stop early when a step's confidence is below 0.70: ask the user about that step instead of carrying a guess forward.
5. Combine: the overall confidence is the product of the steps that ran. The final outcome is the last step's choice.

## Example: change triage

| Step | Question | Choices | Runs when |
| --- | --- | --- | --- |
| domain | Which area does the change touch? | `code`, `data`, `infrastructure`, `docs` | always |
| operation | What does it do? | `read_only`, `state_mutation`, `network_egress` | always |
| risk | How severe is a mistake? | `reversible`, `data_loss`, `security_exposure` | operation is `state_mutation` or `network_egress` |

Report the chain as a short table: step, choice, confidence, and the combined confidence.

## Limits

- A chain's result informs the answer; it grants no permission. Approvals still apply to every action.
- Keep chains to 2-4 steps. Every step multiplies in its uncertainty.
- An error result means the local decision model is unavailable: decide from the stated criteria and say the scores were not available.
