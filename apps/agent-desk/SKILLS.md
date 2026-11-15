# Agent Desk: skills

## Ships with this app

These skills are installed, updated and removed with the app. While the app is installed they can be turned off in Skills but not uninstalled.

- `agent-desk-worker` (`skills/agent-desk-worker/SKILL.md`): Plan an Agent Desk task into bounded worker assignments, carry each out as a separate worker, combine what they support against the fixed criteria and save an unreviewed attempt.

## Vakyartha skills that apply

- `app-operator`: opening the app and using its controls, receipts and background operation.
- `app-maintainer`: changing the package, its surfaces and these documents; bumping its version and running the tests.
- `app-debugger`: finding why an action, refresh or view does not behave as expected.
- `app-admin`: reviewing Access, tool and destination rules, and Background operation.
- `presentation`: any chart, table or form built from the app's data.

## Requires

Nothing outside Vakyartha. The skill uses only the app's own exports (`get_task_context`, `plan_work` and `propose_attempt`). It reaches no network.
