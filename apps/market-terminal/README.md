# NSE Market Terminal

A daily workspace for the Indian equity market from delayed NSE data: benchmark indices, breadth and India VIX, live gainers and losers, a 30-symbol watchlist, a portfolio with exact P&L, price alerts, instrument research with a benchmark comparison, an index explorer and comparisons. Every value comes from a successful read of the NSE integrations and shows its source time; nothing is invented, and actions make no model request. Informational use, not advice.

## Connect

1. Open the header **Access** shield and finish **NSE** and **NSE Market Live** setup inside that panel. Review this app’s exact tools, destinations and separate foreground/background access. Integration Ask can stay Ask; global Off remains a ceiling.
2. Optional: enable News Desk's `get_latest_articles` so Instrument shows related stories.
3. Open **Apps → NSE Market Terminal** and press **Refresh**.

Until a read succeeds each view says what to do instead of showing empty numbers. A refresh in which some reads fail shows a notice with the first failure and keeps every earlier observation with its own source time. The Sources ledger also reports bounded diagnostics when an aggregate read drops invalid rows. If NSE's published return disagrees with the prices beyond their rounding range, the ledger records the exchange time and both the reported and price-implied returns. The quote is rejected; refresh never silently recalculates or presents it as validated.

## Views

| View | What it shows |
| --- | --- |
| **Overview** | Session state and last update; NIFTY 50, BANK, NEXT 50, MIDCAP 100, SMLCAP 100 and India VIX in one scrolling ticker row; top gainers and losers with their index picker and **Show movers** in the Movers tab; the watchlist table; breadth (advancing share, advance/decline ratio, indices rising); India VIX with its one-year percentile gauge; the portfolio's value and day change; sector rotation. Alerts triggered by the refresh appear at the top. |
| **Watchlist** | Add symbols, search the symbol master (**+ Watch**, **Open**), quote cards with **Open**, **Alert**, reorder and **Remove**; session-change chart and a sortable, searchable table with each quote's basis. |
| **Portfolio** | Add or update holdings (symbol, shares, average cost); invested, current value, unrealised P&L and day change; allocation and P&L charts; holding cards (**Open**, **Edit**, **Remove**) and an exact table with weights and price basis. |
| **Instrument** | Symbol, history (1, 3, 6 months or 1 year), benchmark and **Analyse**; the last price as the headline figure with the day's low-to-high bar marking it, then previous close, open and volume; daily candles beside return, volatility, drawdown and sessions; 52-week range as a low-to-high bar marking the latest close; return, beta, correlation and outperformance against the benchmark; volume profile; close with 20- and 50-session averages, volume, daily returns and drawdown; corporate actions for two years; related News Desk stories; exact OHLCV. **+ Watchlist** and **Set alert** act on the symbol. |
| **Indices** | Explore any NSE index: returns from one day to two years, 52-week range, a year of daily candles, published P/E and P/B, and valuation percentiles over two years. Compare 2–10 indices on return, volatility, drawdown and valuation. A live monitor of every index, filterable by group. |
| **Movers** | Live gainers and losers for NIFTY 50, NIFTY BANK, NIFTY NEXT 50 or all securities (cards with **Open** and **+ Watch**), the most traded stocks by value and by shares, and the best and worst indices over 1D–1Y. |
| **Alerts** | Price at or above, at or below, or a session move of at least a percentage; triggered alerts (**Re-arm**, **Open**, **Delete**) and armed ones; **Check now**. |
| **Sources** | Read counts, the latest 60 reads with tool, subject, source time, retrieval time, rows and status, and the methods. |

Overview, Watchlist, Portfolio, Instrument, Indices, Movers and Sources use sub-tabs (for example Instrument: Price, Indicators, Benchmark and range, Events and news, Daily data) so each view stays about one screen. A quote read from the exchange is labelled **Last trade** with its exchange time; a stored daily close is labelled **Close**. Charts, the show and speech expand NSE's abbreviated index names (Nifty MidSmall Financial Services, not NIFTY MS FIN SERV); tables keep the official label. Outside the session the show names the day its figures come from.

## Listen

**Watch** (left of the radio) turns the brief into a live market show. While the market is open it is a live session (a LIVE badge, refreshed every three minutes while it plays); otherwise a pre-open look or the market wrap. The theme opens it; the headlines (Nifty 50, Nifty Bank, the broader market, India VIX) play over a faint music bed with figure tiles and today's line chart for each index; a sting leads into breadth, sector bars, top gainers and losers, your watchlist (bars, then line charts for its biggest movers), the study of the instrument you last analysed (daily closes with return, volatility, drawdown and averages), your portfolio and alerts; the outro closes with the delay and not-advice note. Every index and watchlist price crawls along the bottom with its change. Today's charts build up through the session: each refresh during market hours records one reading of the headline indices and live watchlist quotes, and charts appear once there are three. A chart's change is measured from the previous close, like the tiles beside it. An alert that fired in the last 15 minutes, or the Nifty 50 or Nifty Bank two percent or more from its previous close during the session, is breaking: it leads a new show and is cut into a running one. Nothing is predicted and nothing is advice; every number is one already read from NSE.

The radio button at the top right of the app header plays a spoken market brief through your Voice settings: the session, the Nifty 50 and Nifty Bank with the exchange time, the broader market, breadth, India VIX and its percentile, the top gainers and losers, the leading and lagging sectors, your watchlist's biggest moves, your portfolio's value and day change, and triggered alerts, ending with the delay and not-advice note. It is built from the same saved records as the views. Listening carries on while you use other screens or chats; a small *now playing* control at the bottom right stops it, and the header button shows it again when you come back.

Fields save as you type; buttons validate and apply them, so a half-typed symbol never fails a run. Layouts use compact density and adaptive grids and splits: up to six columns when wide, one on a phone.

## Calculations

- Price return: last close / first close − 1, unadjusted. Daily return: close / previous close − 1.
- Annualised volatility: sample standard deviation of daily returns × √252; shown from three sessions.
- Drawdown: close / running maximum close − 1. Moving averages start at their twentieth and fiftieth sessions, never zero-filled.
- Portfolio: whole paise. Value = shares × last; day change = shares × (last − that quote's previous close); P&L = value − shares × average cost. Charges, taxes and realised gains are not included.
- Benchmark comparison, beta, correlation, breadth readings, India VIX percentiles and index valuation percentiles are NSE's published calculations, shown with their dates and stated methods; descriptive, not forecasts.

## Refresh, budget and schedule

A run may make 16 governed reads. **Refresh** reads every live index group, the movers, end-of-day breadth and India VIX, live quotes for the first 12 tracked symbols (watchlist order, then holdings and alerts) and the latest close for the rest in one read, then checks alerts. **Analyse** makes up to 10 reads (quote, history in 3-month chunks, 52-week, benchmark, corporate actions, volume, news). **Refresh movers** makes 4, **Explore** 3–4, **Compare** 1. A five-minute refresh, matching how often NSE updates its live snapshot, is declared but off until you choose **Start & keep running** under **Background**; it runs only while the app and computer are awake. The session label uses weekday market hours; exchange holidays are not known to it.

## Data

Daily stock OHLCV lives in the app's DuckDB table `prices`; quotes, indices, breadth, movers, research, holdings, alerts, settings and receipts live in app state. Both are saved together only when a run succeeds. State from versions 1 and 2 loads automatically.

## Cross-app MCP integration and skills

- **Tool** `app-market-terminal__get_market_summary`: read-only indices, breadth and India VIX, top movers and tracked quotes with their basis and time.
- **Tool** `app-market-terminal__get_market_brief`: the spoken market brief, and the same brief as a `programme` (parts with charts and figures, and a price ticker) another app can publish at its own `voice.listen` path to play or watch.
- **Tool** `app-market-terminal__get_portfolio`: holdings valued from the latest quotes, in INR.
- **Tool** `app-market-terminal__get_instrument`: one symbol's saved quote, DuckDB analytics, 52-week range, benchmark comparison, corporate actions, volume profile and news.
- **Feed** `market_feed`: the stored quotes, for apps with an `app-feed` trigger.
- **Skill** `nse-market-analyst`: published to the skill catalog for the assistant.
- Reads `app-news-desk__get_latest_articles` for an instrument's news; a missing News Desk is a ledger entry, not a market failure.
- In-process only; no network listener. Governed by the policies in Settings → Integrations.

## Named watchlists, dates and exports

Watchlist supports up to ten named lists with up to thirty symbols each. **Save as** copies the current list; the chips switch lists without reading NSE. Delete appears only when another list remains. Refresh uses the active list, holdings and alerts. `get_market_summary` accepts an optional saved watchlist name and returns available names and missing quotes.

Price, volume, return, drawdown and index-history charts use Projection’s `xScale: "time"`: missing sessions and weekends retain their real date gaps. They use the same canonical history as the detail table.

**Export CSV** sits beside the Portfolio holding controls. It exports the displayed holdings, exact two-decimal INR amounts, price basis/time and partial-price coverage. It excludes charges and taxes. The shared host saves through Rust to Downloads, never overwrites a file or symlink, and reports the actual collision-safe filename. Browser development requests a download without claiming a confirmed save. The header radio’s arrow chooses this app’s voice; Default uses Settings → Voice.

## Portfolio input and compact analysis (3.4)

Shares accepts the numeric input value as well as text. Enter a whole share count; the hint is not a supplied quantity. Add saves the holding even if its governed quote read fails, then shows the failure and keeps the holding unpriced. Invested includes all holdings; value and gains include only priced holdings, with explicit coverage. No priced holdings means unavailable totals, never a zero valuation. Validation errors appear below the app navigation and remain until the next action.

Instrument uses bounded symbol/history/benchmark controls, a separate watch/alert action row, dated quote context, a compact risk strip and a medium-height price chart. Index Explore keeps summary metrics above Horizon changes, History and Valuation subviews; a single history chart uses the available track.

Watch shows saved source timing, sector counts, priced-portfolio coverage and a disclosed chart reference close/fitted scale. A session chart requires at least three matching readings from the current India-time day and an endpoint equal to the displayed quote. Live requires an index source timestamp within fifteen minutes during market hours; otherwise it says Saved data. This clock-based freshness check does not know exchange holidays.

## Hosted operation

The shared host supplies Background operation in this app and Operation Center; package views must not duplicate it or own timers. Start & keep running persists the choice and runs the declared startup-refresh handler now and whenever Vakyartha launches. Refresh remains a manual action; automatic timing uses the declared cron interval, a chosen host timer, or Manual only. Stopping background operation leaves manual actions and saved data available. Startup also runs in Manual only mode.

The host owns scheduling, serialized commits, bounded recovery and run receipts. A failed computation with no external calls receives up to three delayed retries; uncertain external effects block replay for exact-run review. Tools require this app’s explicit mode/tool/destination access; integration Off remains a ceiling, and execution needs an awake computer and running Vakyartha. Reviewed package updates stop background operation for renewed review. Playback observes saved programmes and never starts another refresh loop.

## Shared Access and package review

This package declares 19 integration tools. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Ordinary market refresh is separate from optional research and the News Desk query. A local cross-app read has its own app tool grant; it is not an external exchange connection.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.

Editing a portfolio, alert or watchlist draft refreshes just that view. Saved market observations remain available while editing.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.

## 3.4.7 interaction review

Stock-mover picks are saved drafts. Press **Show movers** on Overview or **Refresh movers** in Movers to read the selected segment. Both views state which saved segment and source time they show and mark a different selection pending. Chart headings always follow the returned snapshot, including after a denied or failed read. Overview's Show movers makes one stock-movers read; Refresh movers still makes four reads for stocks, traded value, traded volume and index rankings. All securities requests `allSec`; a response for another segment is rejected and logged.

Instrument's **Analyse**, index **Explore** and **Compare** explicitly apply their selections. Saved comparisons show their actual date range. Index choices retain saved selections even when the latest name list omits them. The Live monitor group filters retained rows locally. Picking fields does not fetch external data. Partial Overview data uses the available width when breadth/portfolio context is absent.

## 3.4.8 search and form cleanup

**Clear search** dismisses symbol matches and search text. Editing the query invalidates old matches; result headings name the successfully searched query. Matches stay available while adding multiple symbols, until edited or cleared. Empty results and search errors stay next to Search, and do not change market freshness. Search snapshots without a known query are discarded when loading rather than guessed from current text.

Portfolio and Alerts expose **Clear fields** for abandoning a draft without deleting saved holdings/alerts. Opening Alert for another symbol clears the previous symbol's threshold; returning to the same symbol preserves its draft. Validation failures keep typed fields available for correction. Local table filters/pages remain intentionally retained.

Removing a holding also clears a draft for that symbol; drafts for other holdings remain intact.

## 3.4.9 direct movers selection

Overview and Movers share action buttons for the four stock-mover segments. Clicking a choice calls `show_movers` with its validated segment and reads that segment in the same action; no separate Show movers submission remains. Both chart projections and the programme rebuild from the accepted source result. Failed reads retain accurately labelled earlier observations and the existing failure message. Access rules are unchanged. The earlier 3.4.7/3.4.8 draft-and-submit guidance is superseded for these two movers selectors. Other multi-field forms retain their existing submission behavior.
