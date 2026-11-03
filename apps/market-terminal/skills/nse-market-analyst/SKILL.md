---
name: nse-market-analyst
description: Read the Indian market from NSE Market Terminal: indices, breadth, India VIX, top movers and tracked stock quotes
allowed-tools: app-market-terminal__get_market_summary app-market-terminal__get_market_brief app-market-terminal__get_portfolio app-market-terminal__get_instrument
metadata:
  requires: "skill:interactive-ui"
  author: Vakyartha
  part-of: app:market-terminal
  loads-with: "interactive-ui"
---
# NSE Market Analyst

This skill reads the delayed NSE observations NSE Market Terminal has saved.

## Procedures & Rules
1. When the user asks how the Indian market, an NSE index, sector, breadth, India VIX, top movers or their watchlist is doing, call `app-market-terminal__get_market_summary`; pass `watchlist` for a saved named list, otherwise use the active list. Report missing saved quotes and do not imply an unattended refresh.
2. Present the returned values on the canvas (`interactive-ui` loads with this skill): a metric strip or table from the returned records with a short summary. Answer in plain text only when the user asks for text or a single quick fact.
3. State each value's time and basis (live delayed quote or last close) as returned. Breadth readings and India VIX percentiles are NSE's descriptive statistics, not forecasts. Never fabricate prices, candles or speculation, and give no investment advice.
4. For a spoken or quick overall picture ("how did the market do", "give me the market brief"), call `app-market-terminal__get_market_brief` and give its `text` as written. Its `programme` is the same brief with charts for Listen and Watch; suggest the app's Watch button when the user wants to see the market live. Never add predictions or advice to it.
5. For the user's own holdings, value or P&L, call `app-market-terminal__get_portfolio`; quote amounts in INR as returned and say they exclude charges, taxes and realised gains.
6. For one stock ("how is TCS doing", "TCS beta", "RELIANCE dividends"), call `app-market-terminal__get_instrument` with its symbol. If it returns a note that nothing is saved, tell the user to open the symbol in the Instrument view.
7. If `checkedAt` is old or values are missing, say so and suggest pressing Refresh in the app.
8. When a quote is rejected for a session-return mismatch, treat it as a source-data validation failure. The Sources ledger shows the exchange timestamp, reported percentage, implied percentage and rounding range; use earlier saved quotes only with their displayed age and basis, and do not calculate a replacement from the rejected response. For aggregate sources, check the receipt's row-drop diagnostic before describing coverage as complete.

## Supporting App Skills
- `app-authoring` and its package template: the method this app follows.
- `app-maintainer`: changes to this package, keeping old state loading through `normalize()`.
- `app-debugger` with `debug-error`: a failed run. Start from the header status chip and the Sources ledger.
- `interactive-ui` and `surface-design`: bindings, record-bound charts and tables.

The user can save/switch/delete lists in Watchlist and export the canonical Portfolio CSV with its explicit Export CSV button. Query tools cannot mutate lists, export files or start speech. The host header owns refresh and radio/voice controls.

Portfolio coverage is explicit: when nothing is priced, report value and gains as unavailable. Numeric share edits are validated on Add; the placeholder supplies no shares. Instrument and Index exploration expose compact controls and focused analysis subviews. Watch labels each part’s saved source basis and timing; a fresh retrieval does not make old observations live.

## Hosted operation

The shared host supplies Background operation in this app and Operation Center; package views must not duplicate it or own timers. Start & keep running persists the choice and runs the declared startup-refresh handler now and whenever Vakyartha launches. Refresh remains a manual action; automatic timing uses the declared cron interval, a chosen host timer, or Manual only. Stopping background operation leaves manual actions and saved data available. Startup also runs in Manual only mode.

The host owns scheduling, serialized commits, bounded recovery and run receipts. A failed computation with no external calls receives up to three delayed retries; uncertain external effects block replay for exact-run review. Tools require this app’s explicit mode/tool/destination access; integration Off remains a ceiling, and execution needs an awake computer and running Vakyartha. Reviewed package updates stop background operation for renewed review. Playback observes saved programmes and never starts another refresh loop.

## Shared Access and package review

This package declares 19 integration tools. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Ordinary market refresh is separate from optional research and the News Desk query. A local cross-app read has its own app tool grant; it is not an external exchange connection.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.

Use the existing field controls for portfolio, watchlist and alert drafts. These edits save the draft and update its view without querying price history.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.

## Applying criteria (3.4.7)

A selected mover segment is a draft until Show movers or Refresh movers succeeds. Read the saved snapshot's segment and timestamp, not the pending picker, when interpreting results. Show movers needs only the stock-movers read; Refresh movers additionally reads traded value/volume and index rankings. A failed or mismatched response retains earlier data with its earlier identity. All securities uses `allSec` at the tool boundary. Instrument, Explore and Compare apply criteria only through their explicit buttons; a saved comparison states its actual dates. Queries remain read-only and cannot apply these drafts.

## Transient controls (3.4.8)

Use Clear search to dismiss symbol matches. Editing the query invalidates old matches; a result heading names the query actually read. Search failures/empty matches are local messages, not market freshness. Clear fields abandons only the holding/alert draft. Opening an alert for a new symbol requires a fresh threshold. These local actions make no source/model calls and never delete saved holdings or alerts.

Removing a holding also clears a draft for that symbol; drafts for other holdings remain intact.

## 3.4.9 direct movers selection

Overview and Movers share action buttons for the four stock-mover segments. Clicking a choice calls `show_movers` with its validated segment and reads that segment in the same action; no separate Show movers submission remains. Both chart projections and the programme rebuild from the accepted source result. Failed reads retain accurately labelled earlier observations and the existing failure message. Access rules are unchanged. The earlier 3.4.7/3.4.8 draft-and-submit guidance is superseded for these two movers selectors. Other multi-field forms retain their existing submission behavior.
