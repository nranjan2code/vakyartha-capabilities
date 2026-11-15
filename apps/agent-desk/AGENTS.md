# Agent Desk package rules

Read the app-building and skill-authoring guides before you change this package. Keep the manifest, handlers, views, `surface.json`, the four package documents and the worker skill in step. Set the version only through the owner's version command, never in source.

## Ownership and invariants

- `model.ts` defines the state and its validation. `context.state` is the only saved record. `normalize` rejects invalid saved records and never drops them.
- A task's goal, inputs and criteria are set once, by `create_task`. No action changes them. Plans, attempts and lessons change only while the task is open, and a lesson only after acceptance.
- Every governed save names an integer `expectedRevision` that equals the current revision. A stale or missing revision changes nothing.
- Each report copies its assignment's objective and acceptance text, so a later plan change cannot rewrite saved evidence.
- A proposal cannot set personal reviews, acceptance, lessons or host receipts. New reviews start `unchecked`. The execution receipt comes only from the host context, never from model arguments.
- Acceptance needs a pass with a note on every criterion and a reference on every claim.
- Saved text reaches a view only through a data binding. Never place it in node text.
- Stay within the limits in `model.ts`, including the 1.5 MB state cap.

## Must not add

- Model, tool, network or SQL calls in any handler or view.
- Timers, triggers or background loops.
- A permission store, a permission dialog or any grant of tools or spending.
- A second result store for Work. Background results stay in Work.
- Automatic acceptance, automatic lesson activation or automatic retries.

## Field and action to view map

These come from `edit()` and `act()` in `server.ts`. Actions with no listed views rebuild all four.

| Change | Views |
| --- | --- |
| Draft fields (`/draft/title`, `goal`, `inputs`, `criteria`) | tasks |
| Assignment draft (`/assignment/objective`, `acceptance`, `reason`), `add_assignment`, `remove_assignment` | plan |
| `/approach` | plan |
| `/checks/N/verdict` or `note` | evidence; plus plan and compare when the personal pass count changes |
| `/lesson` | evidence |
| `open_attempt` | plan, evidence |
| `create_task`, `open_task`, `plan_work`, `propose_attempt`, `accept_result`, `refresh` | all four |

## Verify

- Run `node --test apps/agent-desk/test/`.
- After any view change, regenerate `surface.json` from `surfaceFile()`. The test compares the two.
- Update the four documents and the skill in the same change as the code.
