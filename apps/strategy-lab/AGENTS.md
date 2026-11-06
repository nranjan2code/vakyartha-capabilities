# Working on NSE Strategy Lab

Read Building a Vakyartha app (Vakyartha's app-building guide, in the Vakyartha product documentation) first; this app follows its method. Then README.md, SKILLS.md and ARCHITECTURE.md here. This is app code, not Projection framework source.

## Invariants

1. Two owners. DuckDB `bars` (raw NSE sessions per symbol, and the benchmark under `INDEX:<name>`) and `actions` (corporate actions with NSE's factor) own source facts. `context.state` owns strategies, results, paper books, sync cursors, coverage and receipts. Every run starts with `normalize()`, which accepts untrusted or older state.
2. `engine.ts` is pure and the only place trading logic lives. A signal at index i uses bars 0..i; orders fill at the next session's open. Backtests and paper accounts share the same `step()`; never fork it.
3. Prices are adjusted at read time (`adjust()`), never rewritten in storage. Raw sessions stay exactly as NSE published them.
4. `source.ts` validates identity, real unique dates, OHLC consistency, integral volume and bounded lists before anything is saved. Writes go through one serial queue per database session.
5. Only the manifest's four tools are called, through `context.callTool`, at most fifteen per run with a soft deadline of eighteen seconds. NSE's own "not found" answers end a backfill; they are not failures.
6. `views.ts` is pure: `view(state, today, chart)` derives all five surfaces. Series longer than 500 records travel as label and value arrays; tables and small charts use record views. A region is emitted only when it has data.
7. Wording: results are historical simulations on delayed end-of-day data; never call them forecasts, recommendations or advice, and keep the Method list beside every run.
8. No broker, order routing, credentials, raw network or model calls. Paper accounts are simulations.

## Change method

Change the engine with a test in `tests/strategy-lab.test.ts` first (signals, fills, stops, adjustment, metrics). Regenerate `surface.json` from `surfaceFile()` and keep the snapshot test passing. Run the catalog checks and the app's real-sandbox journey in Vakyartha, then verify wide and narrow WebKit views. Update README, SKILLS and ARCHITECTURE with any behaviour change.
