# Model Desk

The AI model market as a local data pipeline. Model Desk reads the open model catalog at models.dev (every provider's prices, limits and capabilities, and each model's facts, licence and benchmark scores), checks it, matches every provider listing to its underlying model, and keeps the result in this app's DuckDB database with a change log and a complete price history. It makes no model requests and has no chat.

## Views

- **Overview**: providers, listings, models and how many listings are matched to a model, then every change in the latest snapshot, counted by kind and listed with what changed. When the last refresh kept the previous snapshot, an alert says why.
- **Changes**: the latest 300 change events, filtered by kind (repriced, model added, new provider, deprecated, limits changed, details changed, model removed, provider left), searchable and sortable.
- **Pipeline**: the last refresh's result, time, reads and check findings; the latest 30 refreshes; each read with its pages and rows; and the method.

## Data and schedule

A refresh runs once a day at 09:00 and whenever you press Refresh in the app header. It makes about 13 reads of `models.dev` through the Web pages integration (the price document is 6.8 MB, read as tables of at most 240 KB a page) and takes under a minute. The first refresh is the baseline; each later one is compared with the snapshot before it.

A refresh is applied in one transaction or not at all. If a quality check fails (malformed rows, a sudden fall in listings or models, most listings unmatched, duplicates, a nearly empty source), the previous snapshot is kept and the Pipeline view lists the findings. Unusual but plausible values (contexts over 10 million tokens, prices over 1,000 USD per million tokens, unmatched listings) are applied and listed as warnings. A refresh that finds the source unchanged is recorded as such.

## Tools and skills

Model Desk calls `web__fetch_page` only, for `https://models.dev/api.json` and `https://models.dev/models.json`. It exports no tools or skills.

## Access and operation

Access in the app header controls the Web pages tool and the `models.dev` destination. Background operation, run receipts and recovery are the host's shared controls; the app owns no timers.
