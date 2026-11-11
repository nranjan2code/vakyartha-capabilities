### 1. Identify the Query Scope

- **Historical Performance or Multi-Day Windows**:
  - Questions covering past dates, weekly/monthly returns, moving averages, 52-week ranges, market breadth, corporate actions, or index history require the **`nse`** (Bhavcopy) integration.
  - Primary tools:
    - *Equities*: `nse__get_stock_history`, `nse__get_ltp_by_date`, `nse__get_bulk_quote`, `nse__get_52_week_high_low`, `nse__moving_average`, `nse__get_volume_analysis`, `nse__get_corporate_actions`.
    - *Market & Breadth*: `nse__get_market_mood`, `nse__get_market_breadth`, `nse__get_top_movers`, `nse__get_top_by_volume`.
    - *Indices & Comparisons*: `nse__get_index_snapshot`, `nse__get_index_history`, `nse__get_index_performance`, `nse__get_index_valuation`, `nse__get_index_movers`, `nse__compare_indices`, `nse__compare_stocks`, `nse__get_stock_vs_index`.
    - *Symbol Resolution*: `nse__nse_lookup_symbol`, `nse__search_symbols`.
- **Intraday Quotes & Current Session Activity**:
  - Questions covering current stock price, today's trading action, live gainers/losers, or immediate index levels require the **`nse-cmmkt`** (Market Live) integration.
  - Primary tools:
    - *Market Movers*: `nse-cmmkt__nse_get_market_movers` (primary tool for gainers/losers today), `nse-cmmkt__nse_get_gainers`, `nse-cmmkt__nse_get_losers`.
    - *Spot Quotes*: `nse-cmmkt__cm_get_stock_quote` (single equity), `nse-cmmkt__cm_get_index_quote` (single index), `nse-cmmkt__cm_get_live_indices` (grouped index levels).
    - *Segment Watches*: `nse-cmmkt__cm_get_equity_stocks`, `nse-cmmkt__cm_get_sme_stocks`, `nse-cmmkt__cm_get_bond_stocks`, `nse-cmmkt__cm_get_call_auction_stocks`.
    - *Feed Health*: `nse-cmmkt__cm_get_data_status`, `nse-cmmkt__cm_get_allstocks_status`.
- **Comprehensive Reviews (History + Spot Quote)**:
  - When both integrations are enabled, query `nse` for historical baseline figures and `nse-cmmkt` for the current trading day's snapshot.
