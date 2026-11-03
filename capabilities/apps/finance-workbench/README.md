# Personal Finance Workbench

Your own INR transactions, imported as CSV or JSON, with monthly totals, a spending budget and charts. Amounts are exact (integer paise); records stay in this app's local database. No bank login, sync, network access or sample data, and actions make no model request.

## Use it

1. Open **Apps → Personal Finance Workbench**. With no records, Overview offers **Import transactions**.
2. On **Import**, paste CSV with an `id,date,description,category,amount` header (quoted fields may contain commas) or a JSON array with those fields, and press **Import**. Positive amounts are money in, negative are money out. The app opens Overview on the month the import ends in.
3. On **Overview**, choose a month and type a monthly spending budget; both save as you change them.

## Views

| View | What it shows |
| --- | --- |
| **Overview** | Month, budget and **Import more**; money in, money out, net flow and transaction count; spending against budget (turns amber past 80 % and red past 100 %); spending by category (bars and share pie); net flow by day (coloured by sign); cumulative net flow through the month; money in and out by month (up to 12) once more than one month exists. |
| **Ledger** | Month and the exact searchable, sortable transactions. |
| **Import** | The import box, the format with an example, the last import receipt, and **Delete all transactions** (asks first). |

## Rules

Amounts are decimals with up to two places and nine whole digits; floats and exponents are refused. Dates are real `YYYY-MM-DD` days. IDs are unique letters, digits, `_` or `-` and are never overwritten: importing the same file twice adds nothing and names the IDs already present. A batch (1–200 rows) is added whole or not at all; the ledger keeps up to 2,000. Net flow is not an account balance; classify transfers and refunds yourself.

## Data

Transactions live in DuckDB `ledger`; the month, budget, import draft and receipt live in app state. Both are saved together only when a run succeeds. Version-1 state loads automatically.

## Shared Access and package review

This package declares no outbound integration tools and keeps bounded DuckDB plus local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
