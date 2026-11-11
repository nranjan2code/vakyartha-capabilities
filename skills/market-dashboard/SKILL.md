---
name: market-dashboard
description: Create a source-backed market, index or watchlist review for an exact daily, weekly or monthly window, with optional interactive dashboard and comparable returns.

compatibility: Compatible with market data feeds, financial time-series snapshots, and Vakyartha canvas surfaces.
metadata:

  enhances: "integration:nse"
  category: reports
  author: Vakyartha
  version: "1.0.0"
allowed-tools: read_skill_file use_skill app-market-terminal__get_market_summary app-market-terminal__get_market_brief app-market-terminal__get_instrument app-market-terminal__get_portfolio
---

# Financial Market & Index Reviews

## Steps

1. **market**: Read the saved market summary for a market overview; retain every relevant index, sector and watchlist record, its timestamp and basis. SKIP for requests limited to an instrument, portfolio or spoken brief.
   - tool: app-market-terminal__get_market_summary
   - optional: true
   - effect: read
   - done: has /indices
2. **detail**: Read the saved instrument, portfolio or market brief only when requested. Preserve source precision, currency, units and temporal basis. Otherwise SKIP.
   - tool: app-market-terminal__get_instrument app-market-terminal__get_portfolio app-market-terminal__get_market_brief
   - optional: true
   - effect: read
   - rounds: 3
3. **assess**: Interpret only the retained evidence. A current quote cannot establish multi-session return; verify both endpoints and distinguish price return from total return. State missing coverage.
   - needs: market, detail

## Domain guidance


Analytical methodology for authoring evidence-backed market, equity, index and commodity performance reviews with verified endpoints and interactive time-series dashboards.

## The user's own market data

When NSE Market Terminal's tools are offered, start from them for Indian markets: `app-market-terminal__get_market_summary` (indices, breadth, India VIX, movers, tracked quotes), `app-market-terminal__get_instrument` (one symbol's saved analytics, 52-week range, benchmark comparison, corporate actions, news) and `app-market-terminal__get_portfolio` (the user's holdings). For a spoken overview use `app-market-terminal__get_market_brief` and preserve its factual script. `get_market_summary` accepts an optional saved `watchlist` name and returns available names and unpriced symbols. Query tools are read-only; list changes and CSV export use the app’s visible controls. Every value carries its time and basis; keep them, and use the NSE integration tools only for what the app has not saved.

## Supporting evidence

Read `references/market-evidence.md` for session and return-basis checks.

## Establish the Evidence

1. **Verify instrument & window metadata**:
   - Resolve exchange, ticker/symbol identity, trading timezone, quoting currency or index points.
   - Establish the requested evaluation window: identify the exact first and last comparable trading sessions.
   - Distinguish closed trading sessions from delayed or live intraday quotes. A single spot quote cannot establish a multi-day return.
   - Never fabricate market prices, trading volume, trading calendar dates or corporate-action adjustments.
2. **Deterministic return calculations**:
   - Compute price return as `((last close / first close) - 1) × 100` from verified numbers.
   - Clearly separate price return from dividend-inclusive total return.
   - Distinguish point change, currency change, percentage change and percentage-point change.
   - Never sum price levels or percentages across instruments in a table total.

## Evidence retention

Retain complete verified records with units, source freshness, exact session endpoints and return basis. A spot quote cannot establish a multi-session return or OHLC history. Follow offered tool schemas over examples.

## Check Before Delivery

- Match every stated return to its verified endpoints and underlying calculation basis.
- Verify that plotted chart dates align perfectly with the detail table rows and text summary.
- Clarify whether external news or headlines are correlated observations rather than proven causal drivers of a price move.
- State clearly that market reviews constitute historical analysis, not personal financial advice or buy/sell recommendations.
