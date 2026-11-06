# Skills for NSE Strategy Lab

Skill names and descriptions are selected first; their supporting text loads with `read_skill_file`. Skills grant no execution or tool authority: app actions run ordinary code with no model request.

- `app-authoring`: package and reviewed draft construction when this app changes.
- `app-maintainer`: updates that keep saved strategies, results and paper books.
- `app-debugger` with `debug-error`: diagnosis from the Data view's receipts and sync notices.
- `app-operator` and `app-admin`: Background operation, schedule and recovery.
- `interactive-ui` and `surface-design`: presenting the app's results on the canvas from returned records.

## Ships with this app

- `strategy-lab-reader` (`skills/strategy-lab-reader/SKILL.md`): reads `get_strategy_results` and `get_paper_accounts` and explains them with their periods, assumptions and limits. Requires `interactive-ui`.

When a capability is added or removed, update this list, `exports.skills` in `app.json` and the skill's `allowed-tools`.
