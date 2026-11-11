---
name: nse-mcp
description: Query official National Stock Exchange of India (NSE) market data via MCP, including 5-year historical bhavcopy, delivery volume, market breadth, and near-real-time capital market quotes.

compatibility: Requires enabled 'nse' (Bhavcopy) or 'nse-cmmkt' (Market Live) vendor integrations.
metadata:
  requires: "integration:nse|integration:nse-cmmkt"
  category: live-data
  author: Vakyartha
  version: "1.0.0"

allowed-tools: read_skill_file use_skill nse__nse_lookup_symbol nse__search_symbols nse__get_stock_history nse__get_ltp_by_date nse__get_bulk_quote nse__get_52_week_high_low nse__moving_average nse__get_volume_analysis nse__get_corporate_actions nse__get_market_mood nse__get_market_breadth nse__get_top_movers nse__get_top_by_volume nse__get_index_snapshot nse__get_index_history nse__get_index_performance nse__get_index_valuation nse__get_index_movers nse__compare_indices nse__compare_stocks nse__get_stock_vs_index nse-cmmkt__nse_get_market_movers nse-cmmkt__nse_get_gainers nse-cmmkt__nse_get_losers nse-cmmkt__cm_get_stock_quote nse-cmmkt__cm_get_index_quote nse-cmmkt__cm_get_live_indices
---

# National Stock Exchange of India (NSE) Market Data & MCP

## Steps

1. **resolve**: Resolve the requested instrument identity and series when needed; otherwise SKIP.
   - tool: nse__nse_lookup_symbol nse__search_symbols
   - optional: true
   - effect: read
   - rounds: 3
2. **history**: Read the requested historical sessions and comparable endpoints; otherwise SKIP.
   - tool: nse__get_stock_history nse__get_ltp_by_date nse__get_bulk_quote nse__get_52_week_high_low nse__moving_average nse__get_volume_analysis nse__get_corporate_actions
   - optional: true
   - effect: read
   - rounds: 3
3. **breadth**: Read requested market breadth, mood, movers or volume; otherwise SKIP.
   - tool: nse__get_market_mood nse__get_market_breadth nse__get_top_movers nse__get_top_by_volume
   - optional: true
   - effect: read
   - rounds: 3
4. **indices**: Read requested index history, comparison or valuation; otherwise SKIP.
   - tool: nse__get_index_snapshot nse__get_index_history nse__get_index_performance nse__get_index_valuation nse__get_index_movers nse__compare_indices nse__compare_stocks nse__get_stock_vs_index
   - optional: true
   - effect: read
   - rounds: 3
5. **live**: Read requested current quotes or session activity; otherwise SKIP.
   - tool: nse-cmmkt__nse_get_market_movers nse-cmmkt__nse_get_gainers nse-cmmkt__nse_get_losers nse-cmmkt__cm_get_stock_quote nse-cmmkt__cm_get_index_quote nse-cmmkt__cm_get_live_indices
   - optional: true
   - effect: read
   - rounds: 3
6. **interpret**: Explain only the retained market evidence, exact sessions, units and freshness. Check return endpoints and distinguish price return from total return. Do not invent missing data.
   - needs: resolve, history, breadth, indices, live

## Domain guidance


Analytical and operational procedure for querying official National Stock Exchange of India (NSE) market data using vendor Model Context Protocol (MCP) servers and interpreting verified financial analyses.

## More detail

For how the NSE servers fit together and which skills chain with this one, read `references/architecture.md` with read_skill_file.

## Tool Selection & Dispatch Procedure

## Tool selection

Read `references/tool-selection.md` for details.

### 2. Parameter & Symbol Conventions

- **Symbol Formatting**: Use official uppercase NSE equity tickers:
  - Standard equities: `RELIANCE`, `TCS`, `INFY`, `HDFCBANK`, `TATAMOTORS`, `ITC`, `ICICIBANK`, `SBIN`, `BHARTIARTL`.
  - Major indices: `NIFTY 50`, `NIFTY BANK`, `NIFTY IT`.
  - Series: defaults to `"EQ"` (Standard Equity).
- **Date Formatting**: Follow standard ISO format (`YYYY-MM-DD`) or exchange format (`DD-MM-YYYY`) as documented in `references/nse-tools-guide.md`.
- **Trading Calendar Awareness**:
  - NSE trades Monday through Friday, 09:15 to 15:30 IST (UTC+05:30).
  - Verify the exchange calendar and requested session. Empty data does not establish a holiday. Use a preceding session only when that basis matches the request, and disclose the substitution.

---

## Establishing Verified Evidence

1. **Verify Instrument & Session Freshness**:
   - Resolve symbol, series, trading date, and segment (`cm` for Capital Market).
   - Distinguish a completed historical trading session (final Bhavcopy) from an intraday snapshot (delayed 1–3 minutes). Never present an intraday spot price as an official session closing price before exchange settlement.
   - Never fabricate or guess market prices, traded quantities, 52-week extremes, or corporate action dates. If a tool call fails or returns empty, state the missing data explicitly.

2. **Deterministic Return Calculations**:
   - Compute price return strictly as:
     `Price Return (%) = ((Last Close / First Close) - 1) × 100`
   - Compute point change as:
     `Point Change = Last Close - First Close`
   - Keep price return distinct from total return (which includes cash dividends).
   - Never sum prices, price levels, or percentages across multiple instruments into a table total.

---

## Evidence retention

Retain complete verified records with units, source freshness, exact session endpoints and return basis. A spot quote cannot establish a multi-session return or OHLC history. Follow offered tool schemas over examples.

## Regulatory & Usage Disclaimer

All data provided through the official NSE MCP servers is intended exclusively for educational, informational, and research purposes. It does not constitute investment advice, a financial recommendation, or an order execution facility. Always remind the user that historical market performance does not guarantee future results.
