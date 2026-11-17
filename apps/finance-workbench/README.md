# Personal Finance Workbench

A private INR ledger for everyday use. Record what you earn and spend as it happens, set monthly limits, keep the amounts that repeat every month, and see where the money goes. Amounts are exact (integer paise); records stay in this app's local database. No bank login, sync, network access or sample data, and actions make no model request.

## Use it

1. Open **Apps → Personal Finance Workbench**. With no records, Overview offers **Add a transaction** and **Import a file**.
2. On **Transactions**, choose Expense or Income, type the amount, date, description and category, and press **Add**. The form keeps the type, date and category so several entries go in quickly. Choose a listed transaction to change or delete it.
3. Or press **Add by chat** (or ask the assistant anywhere in Vakyartha) and write what happened, such as "spent 250 on lunch and 120 on an auto". The assistant reads your categories, shows the exact rows it will add and adds them once you approve.
4. On **Budgets**, set a monthly limit for all spending or for one category.
5. On **Recurring**, add rent, salary and subscriptions once. Each month, **Add to ledger** records them; nothing is added on its own.
6. On **Import**, paste records you already keep elsewhere. **Export CSV** on Transactions writes the selected month in the same format.

## Views

| View | What it shows |
| --- | --- |
| **Overview** | The month in one line; money in, money out, what was saved and spending per day; spending against the monthly limit with what is left per remaining day; recurring items still to add this month; spending by category with a drill-down to its transactions; cumulative spending through the month against the limit. |
| **Transactions** | The entry form, with **Add by chat**, beside the month's transactions, newest first, with search and paging. Choosing one opens it for editing; delete asks first. Export CSV. |
| **Budgets** | The limit form beside a progress bar for each limit, the most used first (amber past 80%, red once passed), and the spending that has no limit. |
| **Insights** | Share of income saved, spending against the previous month and the largest expense; tabs for the largest expenses and where the money went, a category comparison with the previous month, the 12-month trend with spending stacked by category, and a month-by-month table. |
| **Recurring** | The recurring-item form beside the items still to add for the calendar month and those already added. |
| **Import** | The import box, the format with an example, the last import receipt, and **Delete all transactions** (asks first). |

## Rules

Typed amounts are positive, with up to two decimals; digit grouping and the rupee sign are accepted, and the type gives the sign. Imported amounts are signed decimals with up to two places and nine whole digits; floats and exponents are refused. Dates are real `YYYY-MM-DD` days. Imported IDs are unique letters, digits, `_` or `-` and are never overwritten: importing the same file twice adds nothing and names the IDs already present. A batch (1–200 rows) is added whole or not at all; the ledger keeps up to 5,000. A recurring item is added at most once per calendar month, on its day (or the month's last day). Limits apply to every month and are measured against the selected one. Money in less money out is not an account balance; classify transfers and refunds yourself.

## Assistant

The app gives the assistant two tools and a skill, `finance-ledger`, that uses them:

| Tool | What it does |
| --- | --- |
| `get_ledger_context` | Reads one month: today's date, the categories in use, money in and out, limits and what is left, spending by category, the latest 15 transactions and recurring items not yet added. Read-only. |
| `add_transactions` | Adds 1 to 20 described transactions, all or none, after the person approves them (Ask by default). A category that matches an existing one, ignoring case, keeps the existing spelling; the date defaults to today. It never changes or deletes a saved transaction. |

The assistant's edits are ordinary ledger rows: change or delete them on Transactions like any other.

## Data

Transactions live in DuckDB `ledger`; the month, limits, recurring items, drafts and the import receipt live in app state. Both are saved together only when a run succeeds. Earlier saved state and ledgers load unchanged.

## Shared Access and package review

This package declares no outbound integration tools and keeps bounded DuckDB plus local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
