---
name: market-dashboard
description: Create a source-backed market, index or watchlist review for an exact daily, weekly or monthly window, with optional interactive dashboard and comparable returns.

compatibility: Compatible with market data feeds, financial time-series snapshots, and Vakyartha canvas surfaces.
metadata:
  requires: "skill:interactive-ui skill:surface-design"
  enhances: "integration:nse"
  category: reports
  author: Vakyartha
  version: "1.0.0"
allowed-tools: read_skill_file use_skill vak_render vak_update vak_submit app-market-terminal__get_market_summary app-market-terminal__get_market_brief app-market-terminal__get_instrument app-market-terminal__get_portfolio
---

# Financial Market & Index Reviews

Analytical methodology for authoring evidence-backed market, equity, index and commodity performance reviews with verified endpoints and interactive time-series dashboards.

## The user's own market data

When NSE Market Terminal's tools are offered, start from them for Indian markets: `app-market-terminal__get_market_summary` (indices, breadth, India VIX, movers, tracked quotes), `app-market-terminal__get_instrument` (one symbol's saved analytics, 52-week range, benchmark comparison, corporate actions, news) and `app-market-terminal__get_portfolio` (the user's holdings). For a spoken overview use `app-market-terminal__get_market_brief` and preserve its factual script. `get_market_summary` accepts an optional saved `watchlist` name and returns available names and unpriced symbols. Query tools are read-only; list changes and CSV export use the app’s visible controls. Every value carries its time and basis; keep them, and use the NSE integration tools only for what the app has not saved.

## Overview & Reference Files

- **Purpose**: Use this skill when asked to review stock, index, currency, commodity or portfolio performance over an explicit daily, weekly, monthly or multi-period window.
- **Skill chaining**:
  - Load enabled `dashboard` and `interactive-ui` when creating an interactive canvas.
  - The required `surface-design` skill governs layout, line charts, metric strips and spoken summaries.
- **Reference files**:
  - Read `references/market-dashboard-layout.md` via `read_skill_file` for the canonical layout patterns and evidence checklist.
  - Read `references/market-dashboard-example.json` via `read_skill_file` for a concrete reference surface schema.

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

## Compose the requested result

Use required surface-design and enabled interactive-ui. Retain one complete canonical dated history feeding related views, with units, source freshness and exact evaluation endpoints visible. Submit all records with the view that references them. Bind the latest value to the final dated record or a checked scalar. Set totals:false for price levels and returns. Use supported `xScale: "time"` on ISO-dated record-bound history charts when gaps should reflect actual dates. Choose candlestick only for actual dated OHLC; a close-only history uses line. Keep independent outputs separate and preserve unrelated work.

## Check Before Delivery

- Match every stated return to its verified endpoints and underlying calculation basis.
- Verify that plotted chart dates align perfectly with the detail table rows and text summary.
- Clarify whether external news or headlines are correlated observations rather than proven causal drivers of a price move.
- State clearly that market reviews constitute historical analysis, not personal financial advice or buy/sell recommendations.
