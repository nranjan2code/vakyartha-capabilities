# NSE query patterns

Worked query sequences for common requests over the official NSE servers. Argument names follow `references/nse-tools-guide.md`; the offered tool schema wins over any example here. Every figure reported comes from a result. Vakyartha lays out any table or chart from the retained records.

---

## Pattern 1: One stock's performance and trend

**Request example**: "Review Reliance Industries (RELIANCE) over the last month and check its current price."

### Read
1. `nse__get_stock_history` with `symbol: "RELIANCE"`, `months: 1`, `endDate: "today"`: the close of each session in the window.
2. `nse__get_52_week_high_low` with `symbol: "RELIANCE"`.
3. `nse__moving_average` with `symbol: "RELIANCE"`, `days: 50`.
4. When `nse-cmmkt` is enabled, `nse-cmmkt__cm_get_stock_quote` with `symbol: "RELIANCE"` for the current session.

### Check
- Take the first and last close of the window from the returned history, each with its session date.
- Window price return = ((last close / first close) − 1) × 100, from those two returned closes only.
- Compare the last close with the returned 50-day average and the 52-week high and low.
- A current-session quote is not a close: report it beside the window return, never inside it.
- A split or bonus inside the window distorts unadjusted prices: check `nse__get_corporate_actions` before stating a return across it.

### Report
- Lead with the window return, naming both closes and their dates.
- Give the 50-day average and the 52-week range as returned, with their dates.

---

## Pattern 2: Market breadth and what moved

**Request example**: "What was the market breadth on the NSE yesterday and which stocks drove the session?"

### Read
1. `nse__get_market_breadth` with `date` set to that trading date (`YYYY-MM-DD`).
2. `nse__get_top_movers` with the same `date`, `n: 5` and `direction: "gain"`, then `direction: "loss"`. For the current session instead, `nse-cmmkt__nse_get_market_movers` with `indexName: "NIFTY 50"`, `limit: 5`.

### Check
- Advances, declines, unchanged and the advance/decline ratio as returned.
- Reading the ratio: above 1.5 is a broad advance, 0.8 to 1.2 is mixed, below 0.7 is broad selling. These describe the session; they forecast nothing.
- Keep a past session's movers and the current session's movers apart: they come from different servers and times.

### Report
- Lead with the breadth ratio and the counts, then the leading gainers and losers.
- Say that breadth covers the listed equities of the Capital Market segment.

---

## Pattern 3: Peer comparison

**Request example**: "Compare TCS, Infosys and Wipro over the last quarter."

### Read
1. `nse__compare_stocks` with `symbols: ["TCS", "INFY", "WIPRO"]`, `months: 3`.
2. `nse__get_52_week_high_low` for each symbol, for its distance from its range.

### Check
- Each stock's start price, end price and return over the same window, as returned.
- Prices of different stocks are never summed or averaged into a total.

### Report
- Name the strongest and weakest performer by returned price return.
- Give a reason for a move only when a returned corporate action or a source read in this conversation states it; otherwise say the data shows the move, not its cause.
