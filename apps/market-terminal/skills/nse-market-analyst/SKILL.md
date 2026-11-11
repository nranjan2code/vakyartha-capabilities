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
2. A request for a market report, overview, update or dashboard belongs to `nse-market-report`, which builds the page from the returned records. Here, answer a specific question in plain text with the values it needs.
3. State each value's time and basis (live delayed quote or last close) as returned. Breadth readings and India VIX percentiles are NSE's descriptive statistics, not forecasts. Never fabricate prices, candles or speculation, and give no investment advice.
4. For a spoken or quick overall picture ("how did the market do", "give me the market brief"), call `app-market-terminal__get_market_brief` and give its `text` as written. Its `programme` is the same brief with charts for Listen and Watch; suggest the app's Watch button when the user wants to see the market live. Never add predictions or advice to it.
5. For the user's own holdings, value or P&L, call `app-market-terminal__get_portfolio`; quote amounts in INR as returned and say they exclude charges, taxes and realised gains.
6. For one stock ("how is TCS doing", "TCS beta", "RELIANCE dividends"), call `app-market-terminal__get_instrument` with its symbol. If it returns a note that nothing is saved, tell the user to open the symbol in the Instrument view.
7. If `checkedAt` is old or values are missing, say so and suggest pressing Refresh in the app. Outside market hours a check made after the last close is current: the app does not read again until values can change.
8. When a quote is rejected for a session-return mismatch, treat it as a source-data validation failure. The Sources ledger shows the exchange timestamp, reported percentage, implied percentage and rounding range; use earlier saved quotes only with their displayed age and basis, and do not calculate a replacement from the rejected response. For aggregate sources, check the receipt's row-drop diagnostic before describing coverage as complete.

## More detail

For the app's other skills, background operation, access review, package updates or what a refresh costs, read `references/app-operation.md` with read_skill_file.
