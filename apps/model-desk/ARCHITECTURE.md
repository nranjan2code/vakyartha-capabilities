# Model Desk architecture

## Files and owners

| File | Owns |
| --- | --- |
| `server.ts` | Entry points: `refresh` (the daily and header refresh), `refreshWeights` (the hourly weights read), `handleAction`, `renderApp`, `surfaceFile` |
| `source.ts` | Reading the catalog as tables, page by page, and checking every value |
| `identity.ts` | Matching a provider listing to its underlying model |
| `brief.ts` | The week's moves, launches, retirements and lab price index in SQL; the lead story's rules; the brief for the ear |
| `licence.ts` | Licence and access classes |
| `selfhost.ts` | The self-host floor: memory, the fewest of the person's GPUs, rent and break-even |
| `provenance.ts` | Who published each benchmark score, read from the catalog's providers, labs and the scores' own sources |
| `store.ts` | The DuckDB schema, staging, quality checks, change events, price spans, the snapshot swap, and the pipeline reads views use |
| `market.ts` | The market as SQL: the five workloads and a workload's tier-aware price per million tokens, the lab's own offer, outliers, confirmation, full context, the pick and the spread, for the whole list or one model; a model's daily price history from its spans, and the spans themselves for export |
| `views.ts` | The eight surfaces, derived from state (Changes filter, open model, workload, volume, compared models) and what `load` (server.ts) read |

## Flow

1. `read` (server.ts) reads, in order: models (`/*` of the model document), benchmarks (`/*/benchmarks/*`), providers (`/*` of the price document) and listings (`/*/models/*`), each with `readAll`, which follows `next` cursors and fails unless every row arrived in order. Thirteen calls in all at today's size.
2. `identity` matches each listing and `provenance` classifies each benchmark score; the fingerprint of everything read decides whether the source changed.
3. `apply` (store.ts) loads staging tables with chunked `from_json` inserts, runs `check`, and either records a blocked run or, in one transaction, writes change events (a full outer join of the snapshot and the candidate, field by field), closes and opens price spans, replaces the snapshot and records the run.
4. `load` prices everything for the chosen workload. It reads the pipeline `snapshot` (totals, the latest 30 runs, the latest run's findings and reads, the latest 300 events), the model list (`catalog`, in chunks of 400) and, when a model is open, its `detail`, `offers`, facts, daily `history`, `spans` and change events (`modelEvents`); `view` builds every surface from them. each compared model's `detail`, facts and `abilities`, the benchmark `boards` and the open board's entries, the open-weights models with their host facts (`openModels`) and the latest weights reads, and the brief for the week to the latest snapshot's day (`moves`, `launches`, `sunsets`, `priceIndex`, `lede`, `spoken`). Clicked actions (open a model, choose a workload or volume, add or remove a compared model) return only the views they change and take about a quarter of a second on today's catalog.

## Boundaries

- The only tool is `web__fetch_page`, for two `models.dev` addresses. The host bounds each reply to 250 KiB and a command to 16 calls; pages are 240 KB.
- The refresh runs as a trigger (up to 120 s); clicked actions only filter retained data.
- DuckDB runs with one thread, 128 MiB of memory and no external access; the database may grow to 256 MiB.

## Hosted operation

The host owns the daily schedule, Refresh, Background operation, serialized commits and receipts. A refresh that throws commits nothing; a failed read or check is recorded as a run instead, so the desk says why the snapshot was kept.

## The weights read

`refreshWeights` (the hourly `weights` trigger) asks the store which organisations are due (`dueOrganisations`: organisations of repositories the catalog links to, not read successfully in 20 hours, the longest unread first), reads each with `readAll` over `weightsUrl(org)` within 16 calls, and replaces that organisation's facts in one transaction (`saveWeights`); a failed read is recorded (`weightsFailed`) and the others go on. Facts are kept across catalog refreshes and joined to models by repository.
