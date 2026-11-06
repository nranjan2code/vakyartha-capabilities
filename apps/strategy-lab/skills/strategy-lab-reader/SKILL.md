---
name: strategy-lab-reader
description: Read and explain the user's NSE Strategy Lab backtests and paper trading accounts
allowed-tools: app-strategy-lab__get_strategy_results app-strategy-lab__get_paper_accounts
metadata:
  requires: "skill:interactive-ui"
  author: Vakyartha
  part-of: app:strategy-lab
  loads-with: "interactive-ui"
---
# Strategy Lab Reader

This skill reads what NSE Strategy Lab has saved: backtest results and paper accounts.

## Procedures & Rules
1. When the user asks how a strategy did, which strategy is best, or how a backtest compares with the index, call `app-strategy-lab__get_strategy_results`; pass `strategy` for one name. A strategy with `metrics: null` has not been run: tell the user to press Run in the app.
2. When the user asks about paper trading, positions or tomorrow's orders, call `app-strategy-lab__get_paper_accounts`.
3. Present returned values on the canvas (`interactive-ui` loads with this skill): a comparison table or metric strip from the returned records with a short summary. Answer in text only when asked or for one quick fact.
4. Always state the period (`start` to `end`), the data date (`dataTo`), and that results are historical simulations on delayed end-of-day NSE data, adjusted for splits and bonuses, as price returns with the configured costs. Mention that only currently listed stocks are tested, so results can look better than they would have been.
5. Never call a result a forecast, recommendation or advice, never suggest buying or selling a stock, and never invent figures that were not returned. Percentages are already in percent.
6. To change a strategy or run it again, tell the user which view and button to use; the reader cannot change the app.
