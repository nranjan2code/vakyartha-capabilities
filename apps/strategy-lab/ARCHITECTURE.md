# NSE Strategy Lab architecture

## Files

| File | Responsibility |
| --- | --- |
| `app.json` | Identity, four NSE tools with purposes, DuckDB, startup and two-minute sync triggers, Listen path, two read-only exports and the reader skill |
| `engine.ts` | Pure trading engine: adjustment, indicators, the five rules, the book's `step()`, `backtest()`, metrics, yearly and monthly returns |
| `source.ts` | NSE parsing and validation; the DuckDB archive (`bars`, `actions`) with serialized writes |
| `server.ts` | State and `normalize()`, the bounded `sync()` step, backtest runs, paper accounts, actions, `handleQuery`, `renderApp`, `surfaceFile` |
| `views.ts` | Pure projections of the five surfaces and the spoken brief |
| `surface.json` | `surfaceFile()` of empty state |

## Flow

- **Sync** (startup, cron every two minutes, Sync now): benchmark chunk or two-hourly refresh → backfill four stocks × up to three chained chunks → latest sessions by one bulk read, longer gaps refilled by chunk → weekly corporate actions, three at a time → coverage → paper accounts advance → views. Each read records a receipt; failures keep saved data and set a notice.
- **Backtest**: saved raw sessions → `adjust()` with saved actions → `prepare()` per stock → `backtest()` over the benchmark calendar → result in state (curve, at most 400 trades, open positions, next orders, yearly and monthly returns).
- **Paper**: a book starts at the latest saved session's close and advances through each later session that every one of its stocks has saved, using the same `step()`. A later split or bonus rescales its positions once.
- **Queries**: `get_strategy_results` and `get_paper_accounts` run in read-only isolation; state changes are discarded.

## Boundaries

Brokered tools only, no network listener, no broker or credentials. Each run makes at most fifteen reads, stays inside the 30-second deadline and the query bound of 10,000 rows (about 1,300 per stock per query). State is bounded: 50 stocks, 12 strategies, 6 paper accounts, 400 trades and fills per book, 80 receipts. The database is `bars` (volume kept, `PRIMARY KEY(symbol, date)`, `INSERT OR REPLACE`, so NSE’s latest reading wins) and `actions`, with a declared limit of 256 MiB (`storage.databaseMiB`); Data shows the use against `context.database.maxBytes`. Five years of 50 stocks measured 5.5 MiB on a real DuckDB file, and the largest single-stock read 126 KiB of the 256 KiB query bound. A saved database without volume is replaced, and any stock or benchmark with progress but no saved sessions is read from NSE again. State is bounded: 15 stocks, 12 strategies, 6 paper accounts, 400 trades and fills per book, 80 receipts.

## Extension points

A new rule is a template in `engine.ts` (`prepare()` signals and `step()` labels) plus its parameters and labels. A chart, table or interaction the views cannot express belongs in Projection, not here. Forecast ranges for position sizing would arrive through a declared tool, never a bundled model.

The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
