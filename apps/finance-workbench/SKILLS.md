# Personal Finance Workbench: skills

## Ships with this app

- `finance-ledger` (`skills/finance-ledger/SKILL.md`): turns a chat message such as "spent 250 on lunch" into ledger rows through `add_transactions`, after the person approves them, and answers questions about a month from `get_ledger_context`. It reads before it writes, uses the ledger's own category names and never changes or deletes a saved transaction. It arrives and leaves with the app.

**Add by chat** on Transactions opens the assistant docked in the app with this app's tools and a starting request the person edits and sends.

## Vakyartha skills that apply

- `app-operator`: opening the app and using its controls, receipts and background operation.
- `app-maintainer`: changing the package, its surfaces, its exports and these documents; bumping its version and running the tests.
- `app-debugger`: finding why an action, export, refresh or view does not behave as expected.
- `app-admin`: reviewing Access, the Ask rule on `add_transactions`, and Background operation.
- `presentation`: keep spending bars, limits and their matching outflows on the same selected month and INR basis.

## Requires

Nothing outside Vakyartha. It calls no tools and reaches no network; the assistant calls its two exports.
