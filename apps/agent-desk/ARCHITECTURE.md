# Agent Desk architecture

## Files

- `app.json`: package identity, a declared `airgap` network with no domains, no MCP tools, no DuckDB, no triggers, the Listen action on the Plan view, the three exports and the worker skill.
- `model.ts`: the domain owner. It holds the state shape, limits, validation, the readiness rules (`checked`, `ready`), the prepared request text and the Work brief.
- `server.ts`: the handlers. `handleAction` applies one edit or action and returns the views it affects. `handleQuery` answers `get_task_context`. `renderApp` rebuilds every view. `surfaceFile` supplies the empty views for `surface.json`.
- `views.ts`: the four views (Tasks, Plan, Evidence, Compare) and the spoken summary and Markdown export. Every view is derived from the same state.
- `skills/agent-desk-worker/SKILL.md`: the checked procedure the assistant follows. `references/host-evidence.md` explains the host receipts.

## Data flow

```text
create task -> frozen contract
plan with the assistant, or add assignments -> plan (plan_work replaces it)
run with the assistant -> get_task_context
  -> one worker per assignment (each sees only its assignment)
  -> combine what the workers support
  -> propose_attempt (expectedRevision, one report per assignment, one claim per criterion)
  -> unreviewed attempt, with the host's execution receipt attached
person verdicts and notes -> accept_result when every criterion is ready -> accepted task
```

Each step changes state through `handleAction` or `handleQuery`, and every view is rebuilt from that state.

## Skill

`agent-desk-worker` has one entry step that chooses plan, run or read. In plan mode it lists assignments and saves them with `plan_work`. In run mode it reads the context, does one worker step per planned assignment, combines the results, reads the context again and saves with `propose_attempt`. With no plan, one worker does the task. The skill declares only the app's three exports.

## Views

| Area changed | Views affected |
| --- | --- |
| Task draft | Tasks |
| Plan or assignments | Plan |
| Approach | Plan |
| Personal review | Evidence, and Plan and Compare when passes change |
| Lesson | Evidence |
| Selected attempt | Plan, Evidence |
| Task created, opened, planned, attempted or accepted | All four |

## Host boundaries

- `assistant.compose` opens the shared assistant panel with the prepared Plan or Run request, and the step controls (Plan it differently, Try a different approach, Combine supported findings). Send and the approvals belong to the host.
- `work.prepare` is inert. It fills the Work form from the task, and the person submits it there.
- `file.save` delivers the Markdown export.
- The host attaches its execution receipt to `propose_attempt` from the turn's context. Model arguments can never supply one.
- The header Listen action reads the spoken summary from the Plan view.
