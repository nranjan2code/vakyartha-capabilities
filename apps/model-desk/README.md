# Model Desk

The AI model market as a local data pipeline. Model Desk reads the open model catalog at models.dev (every provider's prices, limits and capabilities, and each model's facts, licence and benchmark scores), checks it, matches every provider listing to its underlying model, and keeps the result in this app's DuckDB database with a change log and a complete price history. It makes no model requests and has no chat.

## Views

- **Overview**: providers, listings, models and how many listings are matched to a model; where shopping around pays (models priced by at least six providers whose prices span at least 1.5 times); then every change in the latest snapshot, counted by kind and listed with what changed. When the last refresh kept the previous snapshot, an alert says why.
- **Models**: every model with a live listing, searchable, with its provider count and its best full-context price. Choosing one opens it beside the list: one sentence on what to buy and how it compares with the lab's own price, the best full-context offer, the lab's own price and the context, then tabs: **Offers** (every provider's offer with a note on how it was judged), **History** (the cheapest confirmed price and the lab's own price at each day's last refresh, as a chart from the second day, and **Export price history**, a CSV of every price span with its dates), **Changes** (this model's change events) and **Benchmarks** (scores with their sources).
- **Changes**: the latest 300 change events, filtered by kind (repriced, model added, new provider, deprecated, limits changed, details changed, model removed, provider left), searchable and sortable.
- **Pipeline**: the last refresh's result, time, reads and check findings; the latest 30 refreshes; each read with its pages and rows; and the method.

## Prices

Prices are US dollars per million tokens. To compare offers, each is priced for one chat request (1,500 tokens in, a fifth of them from cache and a twentieth written to it, 500 out), with an unpublished cache rate charged at the full input rate. The lab's own offer is a listing whose provider is the lab or one of its services named after it. A price more than 20 times from the model's middle price is set aside as a likely error once five or more providers price it; a price no other provider comes within 1.5 times of is unconfirmed; an offer with less than nine tenths of the model's full context is a smaller-context offer. The best full-context offer prefers a confirmed, generally available one. The spread is the dearest kept price over the cheapest confirmed one.

## Data and schedule

A refresh runs once a day at 09:00 and whenever you press Refresh in the app header. It makes about 13 reads of `models.dev` through the Web pages integration (the price document is 6.8 MB, read as tables of at most 240 KB a page) and takes under a minute. The first refresh is the baseline; each later one is compared with the snapshot before it.

Price spans are the permanent record: a span opens when a listing's prices change and closes when they change again or the listing leaves, and none is ever pruned. A day's history point is what the spans held at that day's last refresh, judged by the same rules as today's prices where prices alone can say (outliers, confirmation, the lab's own offer); context and status are not kept in a span, so past offers are not judged on them.

A refresh is applied in one transaction or not at all. If a quality check fails (malformed rows, a sudden fall in listings or models, most listings unmatched, duplicates, a nearly empty source), the previous snapshot is kept and the Pipeline view lists the findings. Unusual but plausible values (contexts over 10 million tokens, prices over 1,000 USD per million tokens, unmatched listings) are applied and listed as warnings. A refresh that finds the source unchanged is recorded as such.

## Tools and skills

Model Desk calls `web__fetch_page` only, for `https://models.dev/api.json` and `https://models.dev/models.json`. It exports no tools or skills.

## Access and operation

Access in the app header controls the Web pages tool and the `models.dev` destination. Background operation, run receipts and recovery are the host's shared controls; the app owns no timers.
