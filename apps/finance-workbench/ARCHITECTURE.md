# Personal Finance Workbench architecture

## Files

- `app.json`: manifest; no network or tools; DuckDB storage; no schedule.
- `model.ts`: types, `paise`, `typedPaise`, `decimal`, CSV and JSON `records`, `toCsv`, `normalize`, and `load` (the one ledger read).
- `server.ts`: `handleAction` (field drafts and every action), `renderApp`, and `surfaceFile()` for `surface.json`.
- `views.ts`: `view` with `overviewSurface`, `ledgerSurface`, `budgetsSurface`, `insightsSurface`, `recurringSurface`, `importSurface`, over shared `figures`.
- `surface.json`: the empty app, from `surfaceFile()`.
- `skills/finance-ledger/SKILL.md`: the app skill the assistant uses to read the ledger and add described transactions.

`server.ts` also holds `handleQuery` (the read-only `get_ledger_context` export); `views.ts` holds `assistantWorkflow` for **Add by chat**.

## Flow

```text
draft field (/entry, /limit/amount, /rec, /importText) → state → that view's data only, no SQL
/month, /limit/category → state → load → view
Add / Save changes → validate → INSERT or UPDATE → month = the entry's month → load → view
choose a transaction → open_entry → edit draft → Save changes, or Delete → confirm → DELETE
Set limit / Remove limit → state.budget or state.budgets → load → view
recurring: save_rec → state.recurring; Add to ledger → INSERT rec-<item>-<YYYY-MM> in one transaction → load → view
Import → records(text) → ID clash check → INSERT in one transaction → receipt, month = last imported month → load → view (focus Overview)
assistant: get_ledger_context (read-only, revision) → add_transactions {expectedRevision, transactions[]} → Ask → host checks the revision → handleAction('add_transactions') → validate all → INSERT in one transaction → notice, month → load → view (focus Transactions)
Delete all → ask_clear → clear_ledger (DELETE FROM ledger) → view
view → 6 updates (nodes + whole data) → registry lints, applies and commits state + database atomically
```

## Data

`load(month, calendarMonth)` returns `total`, `months[]`, the month's `rows[]` (newest first), `categories[]` and `previous[]` (spending by category for the month and the one before), `previousIn`, `daily[]`, `monthly[]` (money in and out for the latest 12 months), `payees[]` (the ten descriptions that took the most), `stack[]` (spending by category for the latest six months), `allCategories[]` and `posted[]` (recurring IDs already in the calendar month).

Surface data: Overview `/summary`, `/totals`, `/budgetUsed`, `/budgetMax`, `/budgetTone`, `/budgetNote`, `/due`, `/categories`, `/spendingRows`, `/spendRun`; Transactions `/entry`, `/categoryOptions`, `/transactions`, `/exportCsv`, `/notice`; Budgets `/limit`, `/limitOptions`, `/limits`, `/allSpent`, `/allLimit`, `/unlimited`; Insights `/stats`, `/largest`, `/payees`, `/compare`, `/compareRows`, `/monthly`, `/stacked`, `/months`; Recurring `/rec`, `/due`, `/added`; Import `/importText`, `/receipt`, `/ledgerSize`.

The ranked spending chart uses grouped outflows for its bars and the retained negative transactions for drill-down. Chart selection, search and paging require neither a SQL query nor a worker command. Export CSV is the host's explicit file save of `/exportCsv`.

## Boundaries

Each command runs in its app’s dedicated sandbox instance with a 30 s deadline and a bounded DuckDB snapshot stored in the app record. Limits: 50,000 characters per paste, 200 rows per import, 20 rows per assistant request, 5,000 in the ledger, 50 recurring items, 60 category limits.

## Shared Access and package review

This package declares no outbound integration tools and keeps bounded DuckDB plus local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
