# NSE skill architecture and chaining

## Overview & Architecture

The National Stock Exchange of India operates two official hosted MCP endpoints on `mcp.nseindia.in` using Streamable HTTP transport. Neither endpoint requires API keys, credentials, or browser authentication:

1. **`nse` (NSE Bhavcopy — Historical EOD)**:
   - Hosted endpoint: `https://mcp.nseindia.in/bhavcopy/cm/mcp`
   - Tool namespace in Vakyartha: `nse__<tool_name>`
   - Scope: Daily end-of-day equity data covering up to 5 years of trading history, final closing figures, OHLCV records, delivery volumes, 52-week highs/lows, and market breadth (advances/declines).
2. **`nse-cmmkt` (NSE Market Live — Current Session Snapshots)**:
   - Hosted endpoint: `https://mcp.nseindia.in/cmmkt/mcp`
   - Tool namespace in Vakyartha: `nse-cmmkt__<tool_name>`
   - Scope: Near-real-time intraday snapshots (running on a 1–3 minute exchange delay), live stock quotes, day high/low, top gainers and losers, and index performance.

### Skill Chaining
- Load enabled `market-dashboard` for multi-period reviews and comparable returns.
- Read supporting reference files via `read_skill_file`:
  - `references/nse-tools-guide.md`: Detailed tool catalog, schemas, arguments, and return types.
  - `references/nse-query-patterns.md`: Step-by-step query workflows for single equity reviews, market breadth, and index scans.

---
