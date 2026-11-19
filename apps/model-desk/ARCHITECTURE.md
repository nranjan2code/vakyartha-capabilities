# Model Desk architecture

## Files and owners

| File | Owns |
| --- | --- |
| `server.ts` | Entry points: `refresh` (the daily and header refresh), `handleAction`, `renderApp`, `surfaceFile` |
| `source.ts` | Reading the catalog as tables, page by page, and checking every value |
| `identity.ts` | Matching a provider listing to its underlying model |
| `store.ts` | The DuckDB schema, staging, quality checks, change events, price spans, the snapshot swap, and the bounded reads views use |
| `views.ts` | The three surfaces, derived from state and one `snapshot` read |

## Flow

1. `read` (server.ts) reads, in order: models (`/*` of the model document), benchmarks (`/*/benchmarks/*`), providers (`/*` of the price document) and listings (`/*/models/*`), each with `readAll`, which follows `next` cursors and fails unless every row arrived in order. Thirteen calls in all at today's size.
2. `identity` matches each listing; the fingerprint of everything read decides whether the source changed.
3. `apply` (store.ts) loads staging tables with chunked `from_json` inserts, runs `check`, and either records a blocked run or, in one transaction, writes change events (a full outer join of the snapshot and the candidate, field by field), closes and opens price spans, replaces the snapshot and records the run.
4. `snapshot` reads totals, the latest 30 runs, the latest run's findings and reads, and the latest 300 events; `view` builds every surface from it.

## Boundaries

- The only tool is `web__fetch_page`, for two `models.dev` addresses. The host bounds each reply to 250 KiB and a command to 16 calls; pages are 240 KB.
- The refresh runs as a trigger (up to 120 s); clicked actions only filter retained data.
- DuckDB runs with one thread, 128 MiB of memory and no external access; the database may grow to 256 MiB.

## Hosted operation

The host owns the daily schedule, Refresh, Background operation, serialized commits and receipts. A refresh that throws commits nothing; a failed read or check is recorded as a run instead, so the desk says why the snapshot was kept.
