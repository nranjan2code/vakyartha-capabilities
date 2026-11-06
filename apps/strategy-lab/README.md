# NSE Strategy Lab

Design rule-based strategies for NSE stocks, test them on up to five years of daily history saved on this computer, and run the ones you like forward on paper. Every price comes from a validated NSE read with a receipt; splits and bonuses are adjusted with NSE's own price factor; results are compared with a benchmark index; nothing reaches a broker. Historical simulation, not advice or a forecast.

## Connect

1. Open the header **Access** shield and finish **NSE** setup in that panel. The app reads four NSE tools: `get_stock_history` (three-month chunks of daily sessions), `get_index_history` (the benchmark, which is also the trading calendar), `get_bulk_quote` (the latest session of up to 50 stocks in one read) and `get_corporate_actions` (splits, bonuses and their price factor). Review foreground and background access separately; integration Ask can stay Ask.
2. Turn on **Background operation** so history saves while you work, or press **Sync now** in Data to run one step at a time.

## Views

| View | What it shows |
| --- | --- |
| **Overview** | History progress and the latest session; Run all backtests, New strategy and Sync now; the best strategy's compound return, how many are tested, paper equity and data coverage; every strategy compared (a year, against the benchmark, worst fall, Sharpe, trades, win rate) and their growth of 100 on one chart; orders the paper accounts will place at the next open. Listen reads a short spoken brief. |
| **Strategies** | Strategy cards beside the open strategy's editor. New from a template (Moving-average crossover, Channel breakout, RSI mean reversion, Momentum rotation, Buy and hold). Tabs: Rules (rule and its windows), Stocks and capital (stocks or the whole universe, capital, start date, maximum positions), Costs and risk (stop loss, profit target, costs and slippage per side). Save and run backtest, Save, Start paper trading, Duplicate, Delete (asks first). |
| **Backtest** | The chosen strategy's run. Performance: final equity, a year, worst fall, Sharpe, a full measure table against the benchmark, the equity line with the benchmark and starting capital, and the fall from peak. Returns: calendar-year bars and a month-by-year heatmap shaded by sign. Trades: every completed trade (search, sort, pages) and results by stock. Chart: any stock's adjusted daily candles with this strategy's entries and exits marked, zoomable over five years. Positions and orders: what was open at the end and the orders for the next session. Method: every assumption. |
| **Paper trading** | Paper accounts beside the open one: equity, cash, closed trades; Pause, Resume, Strategy rules, Stop and delete (asks first); tabs for positions, next orders, fills and the equity line. |
| **Data** | History progress; add stocks (up to 50), choose the benchmark, Sync now; stock cards with saved range, sessions and status (Sync again, Remove with history after a confirmation); corporate actions with their factors; the source receipts of the last 80 reads. |

## How results are computed

- Signals use a session's close; orders fill at the next session's open, with slippage and costs per side (default 5 and 12 basis points). Stops and targets fill inside the session's range, or at the open when the price gaps through them.
- Positions are equal slices of the previous close's equity: the maximum positions for most rules, the leaders for momentum, every stock for buy and hold. An entry that cannot buy one share is skipped and counted.
- Prices before a split or bonus are multiplied by NSE's published factor. Dividends are not added back (price returns); demergers carry factor 1 and are not adjusted.
- Measures: compound annual growth, total return, worst fall from a peak and the longest time under one, annualised volatility, Sharpe and Sortino from daily returns with no risk-free rate, Calmar, trade count, win rate, average win and loss, profit factor, average result, average holding, time invested and costs paid. The benchmark is the selected NSE index, scaled to the starting capital.
- Only stocks listed today can be chosen, so companies delisted earlier are missing and results can look better than they would have been. The Method tab says so beside every run.

## Data and schedule

- History: NSE serves five years of end-of-day EQ sessions. The first sync saves them in three-month chunks, four stocks at a time; ten stocks take about twenty minutes of two-minute steps. Afterwards each new session arrives in one bulk read; a gap of more than one session refills from today back to the last saved session. Corporate actions are checked weekly per stock.
- Sessions live in the app's DuckDB (about 1,300 rows a stock); strategies, results, paper accounts, progress and receipts live in app state. Removing a stock deletes its saved history after a confirmation.
- The schedule runs every two minutes while Background operation is on and Vakyartha is awake; each step makes at most fifteen reads in about twenty seconds. A failed read keeps every saved session, shows a notice and is retried on the next step.

## Limits

No intraday data, short selling, leverage, derivatives, dividends added back, taxes or broker connection. Paper accounts trade only on saved end-of-day sessions. Up to 50 stocks, 12 strategies and 6 paper accounts.
