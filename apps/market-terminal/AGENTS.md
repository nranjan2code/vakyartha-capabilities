# Working on NSE Market Terminal

Read Building a Vakyartha app (Vakyartha's app-building guide, in the Vakyartha product documentation) first; this app follows its method. Then README.md, SKILLS.md and ARCHITECTURE.md here. This is app code, not Projection framework source.

## Invariants

- Presentation uses only public Projection components and props (for example `stat.icon`, hero `stat`, `rangebar`, scrolling `stack`, background-image cards). A missing visual capability is added to Projection for every app, never drawn by this package.
1. Two owners only: DuckDB `prices` for daily stock OHLCV, `context.state` for everything else (see ARCHITECTURE.md). Every run starts with `normalize()`, which accepts untrusted or older state.
2. `view(state, analysis, now)` in `views.ts` is pure and derives all eight surfaces. Records go in surface data and render through repeaters or record-bound charts and tables. A region is emitted only when it has data; empty, offline and partial states say what to do.
3. Source values are validated in `source.ts` (identity, finite positive prices, OHLC consistency, integral volume, real unique dates, rounding-consistent published percentages, bounded lists) before storage. A failed read records a receipt and keeps earlier observations; it never becomes zero or fresh. A row that fails its own check is dropped and counted, not repaired; aggregate reads retain bounded first-failure diagnostics in their receipt. Arithmetic mismatches retain the exchange timestamp and report the source inputs, implied value and permitted rounding range; never weaken the check or substitute a calculated return.
4. Only the manifest's tools are called, through `context.callTool`, and never more than 16 per run: plan every action's reads against that budget. No raw network, credentials, packages or model calls. SQL is parameterized.
5. Money is whole paise; quotes keep their basis (live or close) and time, and views show both.
6. Named watchlists retain independent order and membership, at most ten lists; names are untrusted object keys. Save/switch/delete are local. Quote tools report unavailable saved quotes rather than fetching behind a read-only query.
6a. `/spoken/brief` on the overview surface is a programme from `show.ts` `marketProgramme(state, analysis, now)`: badge from `session()` (Live, Pre-open, Market close, Weekend), headline parts over the bed, sting into the detail, outro with the delay and not-advice note, ticker of every index and watchlist price. Charts use only recorded values: `intraday` (one reading per refresh in market hours, `recordIntraday`, reset each India-time day, 400 points per series) with `base` = previous close, and the database's daily closes for the analysed instrument. Breaking only on evidence (an alert within 15 minutes; Nifty 50 or Nifty Bank at least two percent from the previous close during the session). `voice.listen.live: 3`. Keep `marketBrief` (text) and the programme on the same records; never add app-side playback or predictions.
7. CSV derives from the same `portfolio()` paise values, with price timestamps, missing-price coverage and exclusions. Use the shared `file.save` host action; never grant an app filesystem authority. Header refresh/radio/voice selection remain shared controls.
8. Use the retained session history for the linked price, volume, return and drawdown charts. Keep the first return missing, link by date and mark only corporate actions on saved dates. Use compact intrinsic cards and local paged collections. Keep navigation and actions beside their context, without duplicate header actions or decorative spacers.
9. Fields save drafts; buttons validate and apply them. A scheduled `refreshMarket` uses saved state only.

## Change method

Change `server.ts`, `views.ts`, `source.ts` or `analytics.ts`; run `node scripts/app-surfaces.ts`; leave `version` alone (the owner types the new version at the next release; `node scripts/version.ts --list` shows the app); update these four documents; run `node --test test/reference-apps.test.ts test/market-terminal.test.ts test/app-registry.test.ts`. Check a new tool's parser against a real response before relying on it. With network and the sandbox helper, `node scripts/market-terminal-check.ts --live` checks live NSE values independently and the views in WebKit. A chart or layout gap belongs in Projection, never in `framework/`.

Numeric input edits arrive as numbers: preserve finite numeric drafts through serialization before validation. Never coerce objects or missing prices to numbers. Test the numeric Shares event through the real host, including failed validation and correction. Unpriced portfolios keep holdings and invested cost but display unavailable value/gains and omit empty charts.

Keep Instrument filters collapsed and bounded, risk metrics together, and Index history/valuation in focused subviews. Watch source time is observation time, not refresh time; stale observations cannot be Live and prior-day recordings cannot be today’s chart. Run `scripts/market-layout-check.ts --record <private-record>` against an isolated copy plus Market Watch at 1440/720/375, retaining failed evidence.

## Hosted operation

The shared host supplies Background operation in this app and Operation Center; package views must not duplicate it or own timers. Start & keep running persists the choice and runs the declared startup-refresh handler now and whenever Vakyartha launches. Refresh remains a manual action; automatic timing uses the declared cron interval, a chosen host timer, or Manual only. Stopping background operation leaves manual actions and saved data available. Startup also runs in Manual only mode.

The host owns scheduling, serialized commits, bounded recovery and run receipts. A failed computation with no external calls receives up to three delayed retries; uncertain external effects block replay for exact-run review. Tools require this app’s explicit mode/tool/destination access; integration Off remains a ceiling, and execution needs an awake computer and running Vakyartha. Reviewed package updates stop background operation for renewed review. Playback observes saved programmes and never starts another refresh loop.

## Shared Access and package review

This package declares 19 integration tools. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Ordinary market refresh is separate from optional research and the News Desk query. A local cross-app read has its own app tool grant; it is not an external exchange connection.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.

Keep single-view drafts in draftView. A shared filter such as segment affects multiple views. Check every consumer before narrowing its projection.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.

## Interaction invariants (3.4.7)

`segment` and `period` are requested criteria; `movers.segment` and `indexMovers.period` describe accepted source results. Never label saved records with requested criteria. Keep the pending-selection note in both movers views; changing segment rebuilds all consumers, including the retained programme. `show_movers` needs only the stock-movers tool; `refresh_movers` owns the four-read workspace refresh. Map All securities to the documented `allSec` and reject mismatched response identity before commit. Keep saved selected index values in the name options and show comparison source dates.

`test/market-terminal.test.ts` checks all four segments through the actual contained registry, failure/identity retention and local field dependencies without SQL/source work. `scripts/market-layout-check.ts` includes real WebKit picker events and cross-view selection retention from an isolated saved-data copy. Installed delivery and current live source reads remain separate checks.

## Transient state (3.4.8)

Search results require their accepted `searchQuery`, matching the trimmed draft. Query edits invalidate results/messages locally; `clear_search` dismisses both query and matches. Search updates only Watchlist and the Sources receipt view, never market `checkedAt`, `problem` or history SQL. Do not infer ownership for old results without a query. Holding/alert reset actions affect only their draft and owning view. Preparing a different alert symbol drops its prior threshold; the same symbol keeps work. Preserve invalid drafts for correction and intentional table paging/filter state.

Removing a holding also clears a draft for that symbol; drafts for other holdings remain intact.

## 3.4.9 direct movers selection

Overview and Movers share action buttons for the four stock-mover segments. Clicking a choice calls `show_movers` with its validated segment and reads that segment in the same action; no separate Show movers submission remains. Both chart projections and the programme rebuild from the accepted source result. Failed reads retain accurately labelled earlier observations and the existing failure message. Access rules are unchanged. The earlier 3.4.7/3.4.8 draft-and-submit guidance is superseded for these two movers selectors. Other multi-field forms retain their existing submission behavior.
