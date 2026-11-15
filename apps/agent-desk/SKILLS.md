# Agent Desk: skills

## Ships with this app

These skills are installed, updated and removed with the app. While the app is installed they can be turned off in Skills but not uninstalled.

- `agent-desk-planner` (`skills/agent-desk-planner/SKILL.md`): Split an Agent Desk task into bounded assignments for separate workers, only where a fresh context earns its cost, and save the plan for the person to review. Starts no work.
- `agent-desk-worker` (`skills/agent-desk-worker/SKILL.md`): Carry out an Agent Desk task with one separate worker per planned assignment, combine what the workers support against the frozen criteria, and save an unreviewed attempt for personal evidence review.

## Vakyartha skills that apply

- `app-operator`: opening the app and using its controls, receipts and background operation.
- `app-maintainer`: changing the package, its surfaces and these documents; bumping its version and running the tests.
- `app-debugger`: finding why an action, refresh or view does not behave as expected.
- `app-admin`: reviewing Access, tool and destination rules, and Background operation.
- `presentation`: any chart, table or form built from the app's data.

## Requires

Nothing outside Vakyartha. The skills use only the app's own exports (`get_task_context`, `plan_work` and `propose_attempt`). It reaches no network.
