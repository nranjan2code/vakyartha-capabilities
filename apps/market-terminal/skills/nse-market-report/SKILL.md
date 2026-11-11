---
name: nse-market-report
description: Show the Indian market now as one page (indices, the watchlist and top movers) from NSE Market Terminal's saved snapshot. Use for a market report, overview, update or dashboard.
allowed-tools: app-market-terminal__get_market_summary
metadata:
  author: Vakyartha
  part-of: app:market-terminal
---
# NSE market report

One read, then one page. The page is built from the records the read returns, so every figure on it is the saved observation, unchanged.

## Steps

1. **read**: Read the saved market summary. Pass `watchlist` only when the user names a saved list.
   - tool: app-market-terminal__get_market_summary
   - effect: read
2. **show**: Show the market: the indices, the watchlist quotes, the top gainers and the top losers. Lead with what moved most, and give the page a control that reads the market again.
   - kind: show
   - from: read
   - done: surface, values

## What the values mean

- Quotes are delayed. `asOf` and `basis` say when each was observed and whether it is a live delayed quote or the last close; name the quote time once, in the source line.
- `changePct` is the change from the previous close, in percent. Index levels are points; stock prices are rupees.
- Breadth carries its own date and can be older than the quotes. When you mention it, give that date.
- This is a description of saved observations. Do not forecast and do not advise; say so at most once.
