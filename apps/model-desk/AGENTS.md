# Working on Model Desk

Read Building a Vakyartha app (Vakyartha's app-building guide), then README.md, SKILLS.md and ARCHITECTURE.md here. Follow the root repository rules.

## Invariants

1. DuckDB owns all catalog data: `providers`, `listings`, `models`, `benchmarks` (the current snapshot), `events`, `price_history`, `runs`, `receipts` and `findings`. `context.state` holds only the Changes filter. Never copy catalog rows into state.
2. A refresh is read, match, check, apply. Reads go through `web__fetch_page` with `rows`, within 16 calls; a short, reordered or failed read is a failed run, never a partial snapshot. Every value is checked for its type before it is stored (`source.ts`).
3. Apply is one transaction: diff, price spans and the snapshot swap together. A failed check records the run and its findings and keeps the snapshot. Do not loosen a check to get a refresh applied; a check that is wrong is fixed with its reason.
4. Identity: the catalog's `canonical_model_id` when it names a known model, else exact equality of reduced spellings; an ambiguous spelling matches nothing. Seller words come from the catalog's provider and lab ids. No list of company names, and no per-model exceptions.
5. Load rows with one `from_json` statement per chunk, never one insert per row. Views read summaries and bounded recent rows (`snapshot` in `store.ts`), within DuckDB's 10,000-row, 256 KiB query limit.
6. Context price tiers are one normalized list per listing and per price span (`tiers` in `source.ts`: the catalog's tier list wins over its older 200K card). The workload's context picks the tier; a rate the tier leaves out falls back to the base card. An offer the catalog marks as another kind than a language model is listed, never kept, confirmed or picked; a model whose context cannot hold the request has no price for it in Costs and Compare.
7. Market judgements (`market.ts`) are SQL over the snapshot, one rule set for the list and the opened model: the lab's own offer is read from the catalog's ids (provider equals the lab, or starts with the lab and a hyphen), never from a list of companies; outliers, confirmation, full context and the pick follow the README's rules. The model list is read in chunks of 400, because each query result is bounded to 256 KiB.
8. The price history is never pruned. Events are kept with their run.
9. No model requests, no chat, no exported assistant tools or skills.
10. Only Projection's basic catalog components. Regenerate `surface.json` from `surfaceFile()` after any view change.

## Change and acceptance

Run `node --test apps/model-desk/test/*.test.ts` here. In Vakyartha, the ahead check runs `test/ahead/model-desk.ahead.ts` against this repository's main: two refreshes through the real row reader over fixture catalogs (every kind of change, price spans, a blocked candidate, a failed read, an unchanged source) on an in-memory DuckDB with the app's settings, with every update linted. Update all four package documents with any behaviour change.
