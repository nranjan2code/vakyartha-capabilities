// Every Strategy Lab surface, derived from saved state and the chart stock's
// saved sessions. Pure: the same inputs always give the same views.
import { TEMPLATES, LIMITS, type Params } from './engine.ts';
import type { Chart, Paper, State, Stored, Strategy } from './server.ts';
import { BENCHMARKS, MAX_UNIVERSE, PARAM_LABELS, progress, windowStart } from './server.ts';

interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
interface Update { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] }
export const TITLES: Record<string, string> = { lab: 'Overview', strategies: 'Strategies', results: 'Backtest', paper: 'Paper trading', data: 'Data' };

// --- formatting ------------------------------------------------------------------------

const num = (n: number, digits = 2) => n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const inr = (n: number) => `${n < 0 ? '−' : ''}₹${Math.round(Math.abs(n)).toLocaleString('en-IN')}`;
const price = (n: number) => `₹${num(n)}`;
/** Lakh and crore for headline figures. */
const compact = (n: number) => { const a = Math.abs(n), sign = n < 0 ? '−' : ''; return a >= 1e7 ? `${sign}₹${num(a / 1e7)} Cr` : a >= 1e5 ? `${sign}₹${num(a / 1e5)} L` : inr(n); };
const pct = (n: number | null | undefined, digits = 1) => (n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}%`);
const ratio = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(2));
const tone = (n: number | null | undefined) => (n == null ? 'neutral' : n > 0 ? 'success' : n < 0 ? 'danger' : 'neutral');
const plural = (n: number, word: string) => `${n.toLocaleString('en-IN')} ${word}${n === 1 ? '' : 's'}`;
const day = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : iso;
const ist = (iso: string | undefined) => { const d = new Date(iso ?? ''); return Number.isFinite(d.getTime()) ? `${d.toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} IST` : 'never'; };
const replaceAll = (value: Record<string, unknown>) => [{ op: 'replace' as const, path: '/' as const, value }];
const templateLabel = (t: string) => TEMPLATES.find((x) => x.value === t)?.label ?? t;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Sub-views as tabs: only the chosen panel renders. Empty panels are left out. */
function tabbed(id: string, panels: [string, string[]][], active?: string): Node[] {
  const live = panels.filter(([, children]) => children.length);
  const pid = (title: string) => `${id}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
  return live.length ? [{ id, type: 'tabs', props: active ? { active } : {}, children: live.map(([t]) => pid(t)) }, ...live.map(([t, children]) => ({ id: pid(t), type: 'section', props: { title: t }, children }))] : [];
}
const caption = (id: string, content: string): Node => ({ id, type: 'text', props: { content, variant: 'caption' } });
const bar = (id: string, children: string[]): Node => ({ id, type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'center' }, children });
const btn = (id: string, label: string, action: string, payload?: Record<string, unknown>, style = 'secondary'): Node => ({ id, type: 'button', props: { label, action, ...(payload ? { payload } : {}), style } });
const notice = (s: State): Node[] => [
  ...(s.problem ? [{ id: 'problem', type: 'alert', props: { title: 'Sync notice', body: '{/problem}', tone: 'warning' } }] : []),
  ...(s.note && !s.problem ? [{ id: 'note', type: 'alert', props: { title: 'Done', body: '{/note}', tone: 'info' } }] : []),
];
const noticeData = (s: State) => ({ ...(s.problem ? { problem: s.problem } : {}), ...(s.note && !s.problem ? { note: s.note } : {}) });

// --- shared projections --------------------------------------------------------------

function metricRows(s: State) {
  return s.strategies!.map((st) => {
    const r = s.results![st.id], m = r?.metrics;
    return { id: st.id, name: st.name, type: templateLabel(st.rules.template), cagr: m?.cagrPct != null ? r2(m.cagrPct) : null, total: m ? r2(m.totalPct) : null, drawdown: m ? r2(m.maxDrawdownPct) : null, sharpe: m?.sharpe != null ? r2(m.sharpe) : null, trades: m?.trades ?? null, win: m?.winRatePct != null ? r2(m.winRatePct) : null, excess: m && m.cagrPct != null && m.benchmarkCagrPct != null ? r2(m.cagrPct - m.benchmarkCagrPct) : null };
  });
}
/** Every tested strategy as growth of 100 on a shared date axis. */
function growth(s: State) {
  const tested = s.strategies!.filter((st) => s.results![st.id]?.curve.dates.length);
  if (!tested.length) return [];
  const byDate = new Map<string, Record<string, number | string>>();
  const step = (n: number) => Math.max(1, Math.ceil(n / 400));
  for (const st of tested) {
    const c = s.results![st.id]!.curve, n = c.dates.length, k = step(n), base = c.equity[0]!;
    c.dates.forEach((date, i) => { if (i % k && i !== n - 1) return; const row = byDate.get(date) ?? { date }; row[st.name] = r2(c.equity[i]! / base * 100); byDate.set(date, row); });
  }
  // A strategy without a point on a date carries its last value, so every series has the same length.
  const rows = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const last: Record<string, number> = {};
  for (const row of rows) for (const st of tested) { if (typeof row[st.name] === 'number') last[st.name] = row[st.name] as number; else row[st.name] = last[st.name] ?? 100; }
  return rows;
}
function nextOrders(s: State) {
  return s.paper!.flatMap((p) => p.book.pending.map((o) => ({ account: p.name, symbol: o.symbol, side: o.side === 'buy' ? 'Buy' : 'Sell', reason: o.reason, signal: o.signal })));
}
export function spoken(s: State) {
  const pr = progress(s), parts: string[] = [];
  if (!pr.ready) parts.push(`Strategy Lab is still saving history: ${pr.done} of ${pr.total} stocks are complete.`);
  const tested = s.strategies!.filter((st) => s.results![st.id]);
  if (tested.length) {
    const best = [...tested].sort((a, b) => (s.results![b.id]!.metrics.cagrPct ?? -1e9) - (s.results![a.id]!.metrics.cagrPct ?? -1e9))[0]!, m = s.results![best.id]!.metrics;
    parts.push(`Of ${plural(tested.length, 'tested strategy').replace('strategys', 'strategies')}, ${best.name} did best, with ${m.cagrPct == null ? 'a' : `${m.cagrPct.toFixed(1)} percent a year and a`} worst fall of ${Math.abs(m.maxDrawdownPct).toFixed(1)} percent, from ${day(m.start)} to ${day(m.end)}.`);
  }
  for (const p of s.paper!) {
    const eq = p.equity.at(-1)?.equity ?? p.capital, change = (eq / p.capital - 1) * 100;
    parts.push(`The ${p.name} paper account is ${p.status === 'paused' ? 'paused at' : 'at'} ${Math.round(eq).toLocaleString('en-IN')} rupees, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(1)} percent since ${day(p.startedAt)}, with ${plural(p.book.positions.length, 'open position')}${p.book.pending.length ? ` and ${plural(p.book.pending.length, 'order')} for the next session` : ''}.`);
  }
  parts.push('These are simulations on delayed end-of-day NSE data, not advice or a forecast.');
  return parts.join(' ');
}

// --- Overview ------------------------------------------------------------------------

function lab(s: State, on: string): Update {
  const pr = progress(s), rows = metricRows(s), tested = rows.filter((r) => r.total != null), g = growth(s), orders = nextOrders(s);
  const best = [...tested].sort((a, b) => (b.cagr ?? -1e9) - (a.cagr ?? -1e9))[0];
  const paperEquity = s.paper!.reduce((a, p) => a + (p.equity.at(-1)?.equity ?? p.capital), 0), paperCapital = s.paper!.reduce((a, p) => a + p.capital, 0);
  const latest = s.covered![`INDEX:${s.benchmark}`]?.last;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { density: 'compact', gap: 'md' }, children: ['cap', ...notice(s).map((n) => n.id), 'actions', 'kpis', ...(tested.length ? ['compare'] : ['empty']), ...(orders.length ? ['orders'] : [])] },
    caption('cap', `${pr.ready ? 'History is complete' : `Saving history · ${pr.done} of ${pr.total} stocks`}${latest ? ` · latest session ${day(latest)}` : ''} · benchmark ${s.benchmark} · last sync ${ist(s.syncedAt)}`),
    ...notice(s),
    bar('actions', ['act-run', 'act-new', 'act-sync']),
    btn('act-run', 'Run all backtests', 'run_all', undefined, 'primary'), btn('act-new', 'New strategy', 'new_strategy'), btn('act-sync', 'Sync now', 'sync'),
    { id: 'kpis', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['k-best', 'k-tested', 'k-paper', 'k-data'] },
    { id: 'k-best', type: 'stat', props: { label: best ? `Best a year · ${best.name}` : 'Best a year', value: best ? pct(best.cagr) : '—', tone: tone(best?.cagr) } },
    { id: 'k-tested', type: 'stat', props: { label: 'Strategies tested', value: `${tested.length} of ${rows.length}` } },
    { id: 'k-paper', type: 'stat', props: { label: s.paper!.length ? `Paper equity · ${plural(s.paper!.length, 'account')}` : 'Paper equity', value: s.paper!.length ? compact(paperEquity) : '—', ...(s.paper!.length ? { delta: pct((paperEquity / paperCapital - 1) * 100), trend: paperEquity >= paperCapital ? 'up' : 'down' } : {}) } },
    { id: 'k-data', type: 'stat', props: { label: 'Stocks with full history', value: `${pr.done} of ${pr.total}`, tone: pr.ready ? 'success' : 'info' } },
    ...(tested.length ? tabbed('compare', [
      ['Compared', ['cmp-table', 'cmp-note']],
      ['Growth of 100', g.length ? ['cmp-chart'] : []],
    ]) : [{ id: 'empty', type: 'alert', props: { title: 'No results yet', body: pr.done ? 'Run the backtests to compare the strategies on the saved history.' : 'History is still saving. The first backtests can run once a few stocks are complete; Data shows progress.', tone: 'info' } }]),
    { id: 'cmp-table', type: 'table', props: { sortable: true, columns: [{ key: 'name', label: 'Strategy' }, { key: 'type', label: 'Type' }, { key: 'cagr', label: 'A year %', align: 'end' }, { key: 'excess', label: `vs ${s.benchmark} %`, align: 'end' }, { key: 'drawdown', label: 'Worst fall %', align: 'end' }, { key: 'sharpe', label: 'Sharpe', align: 'end' }, { key: 'trades', label: 'Trades', align: 'end' }, { key: 'win', label: 'Win %', align: 'end' }],
      rows: { records: '{/rows}', fields: ['name', 'type', 'cagr', 'excess', 'drawdown', 'sharpe', 'trades', 'win'] } } },
    caption('cmp-note', 'A year: compound annual growth. Worst fall: the largest drop from a peak. Sharpe uses daily returns with no risk-free rate. Each strategy runs over its own start date to the latest saved session.'),
    ...(g.length ? [{ id: 'cmp-chart', type: 'chart', props: { kind: 'line', xScale: 'time', height: 'lg', maxWidth: 'full', yLabel: 'Growth of 100', labels: '{/growthDates}', series: '{/growth}' } }] : []),
    ...(orders.length ? [
      { id: 'orders', type: 'section', props: { title: `Next-session paper orders · ${orders.length}` }, children: ['orders-table'] },
      { id: 'orders-table', type: 'table', props: { columns: [{ key: 'account', label: 'Account' }, { key: 'side', label: 'Side' }, { key: 'symbol', label: 'Stock' }, { key: 'reason', label: 'Signal' }, { key: 'signal', label: 'Signal close' }], rows: { records: '{/orders}', fields: ['account', 'side', 'symbol', 'reason', 'signal'] } } },
    ] : []),
  ];
  void on;
  const names = s.strategies!.filter((st) => s.results![st.id]?.curve.dates.length).map((st) => st.name);
  return { surface: 'lab', nodes, data: replaceAll({ ...noticeData(s), rows, growthDates: g.map((x) => String(x.date)), growth: names.map((name) => ({ name, values: g.map((x) => Number(x[name])) })), orders, spoken: { brief: spoken(s) } }) };
}

// --- Strategies ----------------------------------------------------------------------

function strategies(s: State): Update {
  const st = s.strategies!.find((x) => x.id === s.ui!.strategy), d = s.draft;
  const t = d?.template ?? st?.rules.template ?? 'ma_cross';
  const confirming = st && s.ui!.confirm === `delete:${st.id}`;
  const running = st ? s.paper!.some((p) => p.strategyId === st.id) : false;
  const field = (key: keyof Params): Node => ({ id: `f-${key}`, type: 'input', props: { kind: 'number', label: PARAM_LABELS[key], bind: `/draft/params/${key}`, min: LIMITS[key][0], max: LIMITS[key][1], step: 1, maxWidth: 'sm' } });
  const used: Record<string, (keyof Params)[]> = { ma_cross: ['fast', 'slow'], breakout: ['entryDays', 'exitDays'], rsi_revert: ['rsiDays', 'rsiBuy', 'rsiSell'], momentum: ['lookback', 'top', 'rebalanceDays'], buy_hold: [] };
  const cards = s.strategies!.map((x) => {
    const r = s.results![x.id];
    return { id: x.id, title: x.name, subtitle: `${templateLabel(x.rules.template)} · ${x.symbols.length ? plural(x.symbols.length, 'stock') : `all ${s.universe!.length} stocks`}`, body: r ? `${pct(r.metrics.cagrPct)} a year · worst fall ${pct(r.metrics.maxDrawdownPct)} · ${plural(r.metrics.trades, 'trade')}` : 'Not tested yet', badge: s.paper!.some((p) => p.strategyId === x.id) ? 'Paper' : x.id === s.ui!.strategy ? 'Open' : '', tone: x.id === s.ui!.strategy ? 'info' : 'neutral' };
  });
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { density: 'compact', gap: 'md' }, children: ['cap', ...notice(s).map((n) => n.id), 'new-bar', 'split'] },
    caption('cap', `${plural(s.strategies!.length, 'strategy').replace('strategys', 'strategies')} · rules run on each session's close and fill at the next open, so no rule sees the future`),
    ...notice(s),
    bar('new-bar', ['new-label', ...TEMPLATES.map((x) => `new-${x.value}`)]),
    caption('new-label', 'New from'),
    ...TEMPLATES.map((x) => btn(`new-${x.value}`, x.label, 'new_strategy', { template: x.value })),
    { id: 'split', type: 'split', props: { ratio: '1:2' }, children: ['list', ...(st && d ? ['editor'] : ['pick'])] },
    { id: 'list', type: 'grid', props: { columns: 1, gap: 'sm' }, children: { each: '/cards', template: 'card' } },
    { id: 'card', type: 'card', props: { title: '{title}', subtitle: '{subtitle}', body: '{body}', badge: '{badge}', tone: '{tone}', layout: 'row', action: 'open_strategy', payload: { id: '{id}' } } },
    ...(st && d ? [
      { id: 'editor', type: 'stack', props: { gap: 'md' }, children: ['ed-head', 'ed-name', 'ed-tabs', 'ed-actions', ...(confirming ? ['ed-confirm'] : [])] },
      caption('ed-head', s.results![st.id] ? `Last run ${ist(s.results![st.id]!.ranAt)} on data to ${day(s.results![st.id]!.dataTo)}` : 'Not tested yet'),
      { id: 'ed-name', type: 'input', props: { label: 'Name', bind: '/draft/name' } },
      ...tabbed('ed-tabs', [
        ['Rules', ['ed-template', 'ed-summary', ...(used[t]!.length ? ['ed-params'] : [])]],
        ['Stocks and capital', ['ed-symbols', 'ed-money']],
        ['Costs and risk', ['ed-risk', 'ed-cost-note']],
      ], s.ui!.strategiesTab || undefined),
      { id: 'ed-template', type: 'select', props: { label: 'Rule', bind: '/draft/template', presentation: 'dropdown', options: TEMPLATES.map((x) => ({ label: x.label, value: x.value })) } },
      caption('ed-summary', TEMPLATES.find((x) => x.value === t)!.summary),
      ...(used[t]!.length ? [{ id: 'ed-params', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: used[t]!.map((k) => `f-${k}`) }, ...used[t]!.map(field)] : []),
      { id: 'ed-symbols', type: 'input', props: { label: `Stocks · blank for all ${s.universe!.length} in Data`, bind: '/draft/symbols', placeholder: 'RELIANCE, TCS, INFY' } },
      { id: 'ed-money', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: ['ed-capital', 'ed-from', 'ed-maxpos'] },
      { id: 'ed-capital', type: 'input', props: { kind: 'number', label: 'Capital (₹)', bind: '/draft/capital', min: 10000, step: 10000, maxWidth: 'sm' } },
      { id: 'ed-from', type: 'date', props: { label: 'Start · blank for all history', bind: '/draft/from', maxWidth: 'sm' } },
      { id: 'ed-maxpos', type: 'input', props: { kind: 'number', label: 'Maximum positions', bind: '/draft/maxPositions', min: 1, max: 50, step: 1, maxWidth: 'sm' } },
      { id: 'ed-risk', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: ['ed-stop', 'ed-target', 'ed-cost', 'ed-slip'] },
      { id: 'ed-stop', type: 'input', props: { kind: 'number', label: 'Stop loss % · 0 for none', bind: '/draft/stopPct', min: 0, max: 50, step: 0.5, maxWidth: 'sm' } },
      { id: 'ed-target', type: 'input', props: { kind: 'number', label: 'Profit target % · 0 for none', bind: '/draft/targetPct', min: 0, max: 500, step: 0.5, maxWidth: 'sm' } },
      { id: 'ed-cost', type: 'input', props: { kind: 'number', label: 'Costs per side (basis points)', bind: '/draft/costBps', min: 0, max: 200, step: 1, maxWidth: 'sm' } },
      { id: 'ed-slip', type: 'input', props: { kind: 'number', label: 'Slippage per side (basis points)', bind: '/draft/slippageBps', min: 0, max: 200, step: 1, maxWidth: 'sm' } },
      caption('ed-cost-note', 'Costs cover securities transaction tax, exchange and regulator charges, stamp duty and brokerage as one rate per side; 12 basis points is 0.12%. Positions are equal slices of equity; a stop or target inside a session fills at its level, or at the open when the price gaps through it.'),
      bar('ed-actions', ['ed-run', 'ed-save', 'ed-paper', 'ed-dup', 'ed-del']),
      btn('ed-run', 'Save and run backtest', 'run_backtest', undefined, 'primary'),
      btn('ed-save', 'Save', 'save_strategy'),
      btn('ed-paper', running ? 'Running on paper' : 'Start paper trading', 'start_paper', { id: st.id }),
      btn('ed-dup', 'Duplicate', 'duplicate_strategy'),
      btn('ed-del', 'Delete', 'delete_strategy', undefined, 'link'),
      ...(confirming ? [
        { id: 'ed-confirm', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'center' }, children: ['ed-confirm-text', 'ed-confirm-yes', 'ed-confirm-no'] },
        caption('ed-confirm-text', `Delete ${st.name}, its results${running ? ' and its paper account' : ''}?`),
        btn('ed-confirm-yes', 'Delete strategy', 'delete_strategy', undefined, 'danger'),
        btn('ed-confirm-no', 'Keep it', 'cancel'),
      ] : []),
    ] : [caption('pick', 'Choose a strategy, or start a new one from a template.')]),
  ];
  return { surface: 'strategies', nodes, data: replaceAll({ ...noticeData(s), cards, ...(d ? { draft: d } : {}) }) };
}

// --- Backtest ------------------------------------------------------------------------

function results(s: State, chart?: Chart): Update {
  const st = s.strategies!.find((x) => x.id === s.ui!.strategy), r: Stored | undefined = st && s.results![st.id];
  const pick: Node = { id: 'pick', type: 'select', props: { label: 'Strategy', bind: '/strategyPick', presentation: 'dropdown', maxWidth: 'sm', options: s.strategies!.map((x) => ({ label: x.name, value: x.id })) } };
  // The picker's own button opens the choice; Run and Edit act on the chosen strategy.
  const head: Node[] = st ? [bar('head', ['pick', 'run', 'edit']), pick, btn('run', r ? 'Run again' : 'Run backtest', 'run_backtest', { id: st.id }, 'primary'), btn('edit', 'Edit rules', 'open_strategy', { id: st.id })]
    : [bar('head', ['new'])];
  if (!st) head.push(btn('new', 'New strategy', 'new_strategy', undefined, 'primary'));
  if (!st || !r) {
    const nodes: Node[] = [{ id: 'root', type: 'stack', props: { density: 'compact', gap: 'md' }, children: ['cap', ...notice(s).map((n) => n.id), 'head', 'none'] }, caption('cap', st ? `${st.name} · not tested yet` : 'No strategy yet.'), ...notice(s), ...head, { id: 'none', type: 'alert', props: { title: 'Not tested yet', body: 'Run the backtest to see equity, drawdowns, returns by year and month, every trade, and each stock on a chart with its entries and exits.', tone: 'info' } }];
    return { surface: 'results', nodes, data: replaceAll({ ...noticeData(s), strategyPick: st?.id ?? '' }) };
  }
  const m = r.metrics, capital = m.capital;
  // Five years of sessions exceed a record view, so long series travel as label and value arrays.
  const c = r.curve, hasBench = c.dates.length > 0 && c.benchmark.every((v) => v != null);
  const curveDates = c.dates;
  const equity = [{ name: 'Strategy', values: c.equity }, ...(hasBench ? [{ name: s.benchmark!, values: c.benchmark as number[] }] : [])];
  const fall = [{ name: 'Fall from peak', values: c.drawdown }];
  const years = r.yearly.map((y) => ({ year: y.year, Strategy: r2(y.strategy), ...(y.benchmark != null ? { [s.benchmark!]: r2(y.benchmark) } : {}) }));
  // Months as records with one field per year: a month outside the test is a gap, not a zero.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const months = r.monthly.length ? MONTHS.map((month, i) => ({ month, ...Object.fromEntries(r.monthly.flatMap((x) => x.values[i] == null ? [] : [[x.year, x.values[i]]])) })) : [];
  const trades = [...r.trades].reverse().map((t) => ({ symbol: t.symbol, entry: t.entryDate, entryPrice: r2(t.entryPrice), exit: t.exitDate, exitPrice: r2(t.exitPrice), qty: t.qty, pnl: Math.round(t.pnl), pnlPct: r2(t.pnlPct), days: t.days, reason: t.reason }));
  const bySymbol = [...new Set(r.trades.map((t) => t.symbol))].map((sym) => { const ts = r.trades.filter((t) => t.symbol === sym); return { symbol: sym, trades: ts.length, win: r2(ts.filter((t) => t.pnl > 0).length / ts.length * 100), pnl: Math.round(ts.reduce((a, t) => a + t.pnl, 0)) }; }).sort((a, b) => b.pnl - a.pnl);
  const open = r.open.map((p) => ({ symbol: p.symbol, qty: p.qty, entry: p.entryDate, entryPrice: r2(p.entryPrice), last: r2(p.last), pnl: Math.round(p.pnl), pnlPct: r2(p.pnlPct) }));
  const pending = r.pending.map((o) => ({ symbol: o.symbol, side: o.side === 'buy' ? 'Buy' : 'Sell', reason: o.reason, signal: o.signal }));
  const pool = st.symbols.length ? st.symbols : s.universe!;
  const own = chart && r.trades.filter((t) => t.symbol === chart.symbol).slice(-150);
  const dates = new Set(chart?.bars.map((b) => b.date));
  const markers = own ? own.flatMap((t) => [
    ...(dates.has(t.entryDate) ? [{ at: t.entryDate, label: `Buy ${t.qty} at ${price(t.entryPrice)}`, direction: 'up' }] : []),
    ...(dates.has(t.exitDate) ? [{ at: t.exitDate, label: `Sell at ${price(t.exitPrice)} · ${pct(t.pnlPct)} · ${t.reason}`, direction: 'down', tone: t.pnl > 0 ? 'success' : 'danger' }] : []),
  ]) : [];
  for (const p of r.open.filter((x) => x.symbol === chart?.symbol && dates.has(x.entryDate))) markers.push({ at: p.entryDate, label: `Buy ${p.qty} at ${price(p.entryPrice)} · open`, direction: 'up' });
  const stat = (id: string, label: string, value: string, t?: string, delta?: string): Node => ({ id, type: 'stat', props: { label, value, ...(t ? { tone: t } : {}), ...(delta ? { delta, trend: delta.startsWith('−') ? 'down' : 'up' } : {}) } });
  const excess = m.cagrPct != null && m.benchmarkCagrPct != null ? m.cagrPct - m.benchmarkCagrPct : null;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { density: 'compact', gap: 'md' }, children: ['cap', ...notice(s).map((n) => n.id), 'head', 'tabs'] },
    caption('cap', `${st.name} · ${templateLabel(st.rules.template)} · ${plural(r.universe, 'stock')}${r.left.length ? ` (left out without complete history: ${r.left.join(', ')})` : ''} · ${day(m.start)} to ${day(m.end)} (${m.years.toFixed(1)} years) · run ${ist(r.ranAt)}`),
    ...notice(s), ...head,
    ...tabbed('tabs', [
      ['Performance', ['p-kpis', 'p-more', 'p-equity', 'p-dd']],
      ['Returns', ['y-chart', ...(months.length ? ['m-chart'] : []), 'y-table']],
      [`Trades · ${r.trades.length}`, r.trades.length ? ['t-table', 't-symbols'] : ['t-none']],
      ['Chart', chart?.bars.length ? ['c-bar', 'c-chart', 'c-note'] : ['c-bar', 'c-none']],
      [`Positions and orders · ${open.length + pending.length}`, [...(open.length ? ['o-open'] : []), ...(pending.length ? ['o-pending'] : []), ...(open.length + pending.length ? [] : ['o-none'])]],
      ['Method', ['n-method']],
    ], s.ui!.resultsTab || undefined),
    { id: 'p-kpis', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['s-final', 's-cagr', 's-dd', 's-sharpe'] },
    stat('s-final', `Final equity from ${compact(capital)}`, compact(m.final), tone(m.totalPct), pct(m.totalPct)),
    stat('s-cagr', 'A year (compound)', pct(m.cagrPct), tone(m.cagrPct), excess != null ? `${pct(excess)} vs ${s.benchmark}` : undefined),
    stat('s-dd', 'Worst fall', pct(m.maxDrawdownPct), 'danger'),
    stat('s-sharpe', 'Sharpe', ratio(m.sharpe)),
    { id: 'p-more', type: 'table', props: { columns: [{ key: 'k', label: 'Measure' }, { key: 'v', label: 'Strategy', align: 'end' }, { key: 'b', label: s.benchmark, align: 'end' }],
      rows: [
        ['Total return', pct(m.totalPct), pct(m.benchmarkTotalPct)], ['A year (compound)', pct(m.cagrPct), pct(m.benchmarkCagrPct)], ['Worst fall', pct(m.maxDrawdownPct), pct(m.benchmarkMaxDrawdownPct)],
        ['Longest time under a peak', `${plural(m.longestDrawdownDays, 'session')}`, '—'], ['Volatility a year', pct(m.volatilityPct), '—'], ['Sortino', ratio(m.sortino), '—'], ['Calmar', ratio(m.calmar), '—'],
        ['Trades', String(m.trades), '—'], ['Winning trades', pct(m.winRatePct), '—'], ['Average win', pct(m.avgWinPct), '—'], ['Average loss', pct(m.avgLossPct), '—'],
        ['Profit factor', ratio(m.profitFactor), '—'], ['Average result a trade', m.expectancy == null ? '—' : inr(m.expectancy), '—'], ['Average holding', m.avgHoldDays == null ? '—' : `${m.avgHoldDays.toFixed(0)} days`, '—'],
        ['Time invested', pct(m.exposurePct).replace('+', ''), '—'], ['Costs and slippage paid', inr(m.costs + 0), '—'], ...(m.skipped ? [['Entries skipped for cash', String(m.skipped), '—']] : []),
      ] } },
    { id: 'p-equity', type: 'chart', props: { kind: 'line', title: 'Equity', xScale: 'time', height: 'lg', maxWidth: 'full', yLabel: '₹', guides: [{ value: capital, label: 'Starting capital' }], labels: '{/curveDates}', series: '{/equity}' } },
    { id: 'p-dd', type: 'chart', props: { kind: 'area', title: 'Fall from peak', xScale: 'time', height: 'sm', maxWidth: 'full', yLabel: '%', labels: '{/curveDates}', series: '{/fall}' } },
    { id: 'y-chart', type: 'chart', props: { kind: 'bar', title: 'Return by calendar year', maxWidth: 'lg', yLabel: '%', series: { records: '{/years}', label: 'year', fields: years.some((y) => s.benchmark! in y) ? ['Strategy', s.benchmark] : ['Strategy'] } } },
    ...(months.length ? [{ id: 'm-chart', type: 'chart', props: { kind: 'heatmap', title: 'Return by month (%)', maxWidth: 'lg', colorBy: 'sign', series: { records: '{/months}', label: 'month', fields: r.monthly.map((x) => x.year) } } }] : []),
    caption('y-table', 'The first and last years cover only the part of the year inside the test.'),
    { id: 't-table', type: 'table', props: { sortable: true, searchable: true, pageSize: 25, columns: [{ key: 'symbol', label: 'Stock' }, { key: 'entry', label: 'Entry' }, { key: 'entryPrice', label: 'Entry ₹', align: 'end' }, { key: 'exit', label: 'Exit' }, { key: 'exitPrice', label: 'Exit ₹', align: 'end' }, { key: 'qty', label: 'Shares', align: 'end' }, { key: 'pnl', label: 'Result ₹', align: 'end' }, { key: 'pnlPct', label: 'Result %', align: 'end' }, { key: 'days', label: 'Days', align: 'end' }, { key: 'reason', label: 'Exit reason' }],
      rows: { records: '{/trades}', fields: ['symbol', 'entry', 'entryPrice', 'exit', 'exitPrice', 'qty', 'pnl', 'pnlPct', 'days', 'reason'] } } },
    { id: 't-symbols', type: 'table', props: { sortable: true, columns: [{ key: 'symbol', label: 'Stock' }, { key: 'trades', label: 'Trades', align: 'end' }, { key: 'win', label: 'Win %', align: 'end' }, { key: 'pnl', label: 'Result ₹', align: 'end' }], rows: { records: '{/bySymbol}', fields: ['symbol', 'trades', 'win', 'pnl'] } } },
    caption('t-none', 'The rule made no completed trade over this period.'),
    { id: 'c-bar', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['c-pick', 'c-open'] },
    { id: 'c-pick', type: 'select', props: { label: 'Stock', bind: '/chartSymbol', presentation: 'dropdown', maxWidth: 'sm', options: pool.map((x) => ({ label: x, value: x })) } },
    btn('c-open', 'Show', 'chart_symbol', { symbol: '/chartSymbol' }),
    ...(chart?.bars.length ? [
      { id: 'c-chart', type: 'chart', props: { kind: 'candlestick', title: `${chart.symbol} · adjusted daily prices with this strategy's trades`, xScale: 'time', height: 'lg', maxWidth: 'full', yLabel: '₹', markers: '{/markers}', labels: '{/barDates}', series: '{/bars}' } },
      caption('c-note', 'Up triangles are entries at the open; down triangles are exits, green for a gain and red for a loss. Pinch, ⌘-scroll or the buttons zoom; drag pans; arrows step through sessions.'),
    ] : [caption('c-none', 'This stock has no saved sessions inside the test period.')]),
    ...(open.length ? [{ id: 'o-open', type: 'table', props: { title: 'Open at the end', columns: [{ key: 'symbol', label: 'Stock' }, { key: 'qty', label: 'Shares', align: 'end' }, { key: 'entry', label: 'Entry' }, { key: 'entryPrice', label: 'Entry ₹', align: 'end' }, { key: 'last', label: 'Last close ₹', align: 'end' }, { key: 'pnl', label: 'Open result ₹', align: 'end' }, { key: 'pnlPct', label: '%', align: 'end' }], rows: { records: '{/open}', fields: ['symbol', 'qty', 'entry', 'entryPrice', 'last', 'pnl', 'pnlPct'] } } }] : []),
    ...(pending.length ? [{ id: 'o-pending', type: 'table', props: { columns: [{ key: 'side', label: 'Next open' }, { key: 'symbol', label: 'Stock' }, { key: 'reason', label: 'Signal' }, { key: 'signal', label: 'Signal close' }], rows: { records: '{/pending}', fields: ['side', 'symbol', 'reason', 'signal'] } } }] : []),
    caption('o-none', 'No position was open at the end and no order is waiting.'),
    { id: 'n-method', type: 'list', props: { items: [
      `History: delayed end-of-day NSE sessions saved locally since ${day(windowStart(m.end))}, the EQ series only.`,
      'Splits and bonuses scale earlier prices by NSE’s published factor. Dividends are not added back, so returns are price returns; demergers are not adjusted.',
      'Signals use each session’s close; orders fill at the next session’s open with the slippage and costs set in the rules. Stops and targets fill inside the session’s range, or at the open after a gap.',
      'Positions are equal slices of equity at the previous close; an entry that cannot buy one share is skipped and counted.',
      'Only today’s listed stocks can be chosen, so companies delisted earlier are missing and results can look better than they would have been.',
      'This is a historical simulation, not a forecast or advice. Past results do not promise future ones.',
    ] } },
  ];
  return { surface: 'results', nodes, data: replaceAll({ ...noticeData(s), strategyPick: st.id, chartSymbol: chart?.symbol ?? s.ui!.chartSymbol ?? '', curveDates, equity, fall, years, months, trades, bySymbol, open, pending, ...(chart?.bars.length ? { barDates: chart.bars.map((b) => b.date), bars: (['open', 'high', 'low', 'close'] as const).map((k) => ({ name: k, values: chart.bars.map((b) => r2(b[k])) })), markers } : {}) }) };
}

// --- Paper trading ---------------------------------------------------------------------

function paper(s: State): Update {
  const p: Paper | undefined = s.paper!.find((x) => x.id === s.ui!.paper);
  const cards = s.paper!.map((x) => { const eq = x.equity.at(-1)?.equity ?? x.capital; return { id: x.id, title: x.name, subtitle: `Since ${day(x.startedAt)} · last session ${day(x.lastDate)}`, body: `${compact(eq)} · ${pct((eq / x.capital - 1) * 100)} · ${plural(x.book.positions.length, 'position')}`, badge: x.status === 'paused' ? 'Paused' : 'Running', tone: x.id === s.ui!.paper ? 'info' : 'neutral' }; });
  const st: Strategy | undefined = p && s.strategies!.find((x) => x.id === p.strategyId);
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { density: 'compact', gap: 'md' }, children: ['cap', ...notice(s).map((n) => n.id), ...(s.paper!.length ? ['split'] : ['empty', 'start-bar'])] },
    caption('cap', 'Paper accounts run a strategy forward from the day they start: each new session’s close decides the next open’s orders. Nothing reaches a broker.'),
    ...notice(s),
  ];
  if (!s.paper!.length) {
    nodes.push({ id: 'empty', type: 'alert', props: { title: 'No paper account yet', body: 'Start one from any strategy to see how it does on sessions it has never seen.', tone: 'info' } }, bar('start-bar', ['start-go']), btn('start-go', 'Choose a strategy', 'view.open', { surface: 'strategies' }, 'primary'));
    return { surface: 'paper', nodes, data: replaceAll(noticeData(s)) };
  }
  const eq = p ? p.equity.at(-1)?.equity ?? p.capital : 0;
  const positions = p ? p.book.positions.map((x) => ({ symbol: x.symbol, qty: x.qty, entry: x.entryDate, entryPrice: r2(x.entryPrice), cost: Math.round(x.qty * x.entryPrice + x.cost) })) : [];
  const pending = p ? p.book.pending.map((o) => ({ side: o.side === 'buy' ? 'Buy' : 'Sell', symbol: o.symbol, reason: o.reason, signal: o.signal })) : [];
  const fills = p ? [...p.book.fills].reverse().map((f) => ({ date: f.date, side: f.side === 'buy' ? 'Buy' : 'Sell', symbol: f.symbol, qty: f.qty, price: r2(f.price), costs: r2(f.costs), reason: f.reason })) : [];
  const curveDates = p ? p.equity.map((x) => x.date) : [], curve = p ? [{ name: 'Equity', values: p.equity.map((x) => Math.round(x.equity)) }] : [];
  const confirm = p && s.ui!.confirm === `stop:${p.id}`;
  nodes.push(
    { id: 'split', type: 'split', props: { ratio: '1:2' }, children: ['list', ...(p ? ['detail'] : [])] },
    { id: 'list', type: 'grid', props: { columns: 1, gap: 'sm' }, children: { each: '/cards', template: 'card' } },
    { id: 'card', type: 'card', props: { title: '{title}', subtitle: '{subtitle}', body: '{body}', badge: '{badge}', tone: '{tone}', layout: 'row', action: 'open_paper', payload: { id: '{id}' } } },
  );
  if (p) nodes.push(
    { id: 'detail', type: 'stack', props: { gap: 'md' }, children: ['d-kpis', 'd-actions', ...(confirm ? ['d-confirm'] : []), 'd-tabs'] },
    { id: 'd-kpis', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm' }, children: ['d-eq', 'd-cash', 'd-trades'] },
    { id: 'd-eq', type: 'stat', props: { label: `Equity from ${compact(p.capital)}`, value: compact(eq), delta: pct((eq / p.capital - 1) * 100), trend: eq >= p.capital ? 'up' : 'down' } },
    { id: 'd-cash', type: 'stat', props: { label: 'Cash', value: compact(p.book.cash) } },
    { id: 'd-trades', type: 'stat', props: { label: 'Closed trades', value: String(p.book.trades.length) } },
    bar('d-actions', [p.status === 'running' ? 'd-pause' : 'd-resume', 'd-rules', 'd-stop']),
    ...(p.status === 'running' ? [btn('d-pause', 'Pause', 'pause_paper', { id: p.id })] : [btn('d-resume', 'Resume', 'resume_paper', { id: p.id }, 'primary')]),
    ...(st ? [btn('d-rules', 'Strategy rules', 'open_strategy', { id: st.id })] : [btn('d-rules', 'Strategy rules', 'view.open', { surface: 'strategies' })]),
    btn('d-stop', 'Stop and delete', 'stop_paper', { id: p.id }, 'link'),
    ...(confirm ? [
      { id: 'd-confirm', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'center' }, children: ['d-confirm-text', 'd-confirm-yes', 'd-confirm-no'] },
      caption('d-confirm-text', `Delete the ${p.name} paper account and its ${plural(fills.length, 'fill')}?`),
      btn('d-confirm-yes', 'Delete account', 'stop_paper', { id: p.id }, 'danger'), btn('d-confirm-no', 'Keep it', 'cancel'),
    ] : []),
    ...tabbed('d-tabs', [
      [`Positions · ${positions.length}`, positions.length ? ['d-pos'] : ['d-pos-none']],
      [`Next orders · ${pending.length}`, pending.length ? ['d-pend'] : ['d-pend-none']],
      [`Fills · ${fills.length}`, fills.length ? ['d-fills'] : ['d-fills-none']],
      ['Equity', curveDates.length > 1 ? ['d-curve'] : ['d-curve-none']],
    ], s.ui!.paperTab || undefined),
    { id: 'd-pos', type: 'table', props: { columns: [{ key: 'symbol', label: 'Stock' }, { key: 'qty', label: 'Shares', align: 'end' }, { key: 'entry', label: 'Entry' }, { key: 'entryPrice', label: 'Entry ₹', align: 'end' }, { key: 'cost', label: 'Cost ₹', align: 'end' }], rows: { records: '{/positions}', fields: ['symbol', 'qty', 'entry', 'entryPrice', 'cost'] } } },
    caption('d-pos-none', 'No open positions.'),
    { id: 'd-pend', type: 'table', props: { columns: [{ key: 'side', label: 'Next open' }, { key: 'symbol', label: 'Stock' }, { key: 'reason', label: 'Signal' }, { key: 'signal', label: 'Signal close' }], rows: { records: '{/pending}', fields: ['side', 'symbol', 'reason', 'signal'] } } },
    caption('d-pend-none', 'No order waits for the next session.'),
    { id: 'd-fills', type: 'table', props: { sortable: true, searchable: true, pageSize: 25, columns: [{ key: 'date', label: 'Session' }, { key: 'side', label: 'Side' }, { key: 'symbol', label: 'Stock' }, { key: 'qty', label: 'Shares', align: 'end' }, { key: 'price', label: 'Price ₹', align: 'end' }, { key: 'costs', label: 'Costs ₹', align: 'end' }, { key: 'reason', label: 'Reason' }], rows: { records: '{/fills}', fields: ['date', 'side', 'symbol', 'qty', 'price', 'costs', 'reason'] } } },
    caption('d-fills-none', 'No fills yet: the first orders fill at the next session’s open.'),
    ...(curveDates.length > 1 ? [{ id: 'd-curve', type: 'chart', props: { kind: 'line', xScale: 'time', height: 'md', maxWidth: 'full', yLabel: '₹', guides: [{ value: p.capital, label: 'Starting capital' }], labels: '{/curveDates}', series: '{/curve}' } }] : [caption('d-curve-none', 'The equity line starts after two sessions.')]),
  );
  return { surface: 'paper', nodes: nodes.filter((n, i, all) => all.findIndex((x) => x.id === n.id) === i), data: replaceAll({ ...noticeData(s), cards, positions, pending, fills, curveDates, curve }) };
}

// --- Data ----------------------------------------------------------------------------

function data(s: State, on: string): Update {
  const pr = progress(s), bench = s.covered![`INDEX:${s.benchmark}`];
  const stocks = s.universe!.map((sym) => {
    const c = s.covered![sym], e = s.sync![sym]!;
    const status = e.error ? 'Check symbol' : e.done ? (e.actionsError ? 'Actions pending' : 'Complete') : c ? 'Saving' : 'Waiting';
    return { symbol: sym, title: sym, subtitle: c ? `${day(c.first)} – ${day(c.last)} · ${plural(c.sessions, 'session')}` : 'No sessions saved yet', body: e.error ?? (e.actionsAt ? `Corporate actions checked ${ist(e.actionsAt)}` : 'Corporate actions not checked yet'), badge: status, tone: e.error ? 'danger' : e.done ? 'success' : 'info', confirm: s.ui!.confirm === `remove:${sym}` ? 'Remove with history' : 'Remove' };
  });
  const acts = Object.entries(s.actionList!).flatMap(([sym, list]) => list.map((a) => ({ symbol: sym, date: a.exDate, kind: a.kind, purpose: a.purpose, factor: a.factor }))).sort((a, b) => b.date.localeCompare(a.date));
  const receipts = s.receipts!.map((r) => ({ subject: r.subject, tool: r.tool.replace(/^nse__/, ''), fetched: ist(r.fetchedAt), source: r.sourceAt, rows: r.rows, status: r.status }));
  const pctDone = pr.total ? Math.round(pr.done / pr.total * 100) : 0;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { density: 'compact', gap: 'md' }, children: ['cap', ...notice(s).map((n) => n.id), 'prog', 'controls', 'tabs'] },
    caption('cap', `Daily NSE history saved on this computer: up to five years per stock (from ${day(windowStart(on))}), then each new session. ${s.universe!.length} of ${MAX_UNIVERSE} stocks · benchmark ${bench ? `${day(bench.first)} – ${day(bench.last)}` : 'not saved yet'} · storage ${((s.storage ?? 0) / 1048576).toFixed(1)} of 2 MiB.`),
    ...notice(s),
    { id: 'prog', type: 'progress', props: { label: pr.ready ? 'History complete' : `History saving in the background · ${pr.done} of ${pr.total} stocks`, value: pctDone, show: 'value' } },
    { id: 'controls', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true, align: 'end' }, children: ['add', 'add-go', 'bench', 'sync'] },
    { id: 'add', type: 'input', props: { label: 'Add stocks', bind: '/addDraft', placeholder: 'TATAMOTORS, MARUTI' } },
    btn('add-go', 'Add', 'add_symbols', undefined, 'primary'),
    { id: 'bench', type: 'select', props: { label: 'Benchmark and calendar', bind: '/benchmark', presentation: 'dropdown', maxWidth: 'sm', options: BENCHMARKS } },
    btn('sync', 'Sync now', 'sync'),
    ...tabbed('tabs', [
      [`Stocks · ${stocks.length}`, stocks.length ? ['st-grid', 'st-note'] : ['st-none']],
      [`Corporate actions · ${acts.length}`, acts.length ? ['ca-table'] : ['ca-none']],
      [`Sources · ${receipts.length}`, receipts.length ? ['rc-table'] : ['rc-none']],
    ], s.ui!.dataTab || undefined),
    { id: 'st-grid', type: 'grid', props: { columns: 3, minItemWidth: 'sm', gap: 'sm', searchable: stocks.length > 12, pageSize: 24 }, children: { each: '/stocks', template: 'st-card' } },
    { id: 'st-card', type: 'card', props: { title: '{title}', subtitle: '{subtitle}', body: '{body}', badge: '{badge}', tone: '{tone}' }, children: ['st-actions'] },
    { id: 'st-actions', type: 'stack', props: { direction: 'horizontal', gap: 'sm' }, children: ['st-retry', 'st-remove'] },
    { id: 'st-retry', type: 'button', props: { label: 'Sync again', action: 'retry_symbol', payload: { symbol: '{symbol}' }, style: 'link' } },
    { id: 'st-remove', type: 'button', props: { label: '{confirm}', action: 'remove_symbol', payload: { symbol: '{symbol}' }, style: 'link' } },
    caption('st-note', 'The scheduled sync runs every two minutes while Background operation is on; Sync now runs one step. Each step reads at most fifteen chunks, so the first full history of ten stocks takes about twenty minutes. Five years of 15 stocks use about 1.5 MiB of the app’s 2 MiB storage.'),
    caption('st-none', 'No stocks yet. Add NSE symbols above.'),
    { id: 'ca-table', type: 'table', props: { sortable: true, searchable: true, pageSize: 20, columns: [{ key: 'symbol', label: 'Stock' }, { key: 'date', label: 'Ex-date' }, { key: 'kind', label: 'Type' }, { key: 'purpose', label: 'Purpose' }, { key: 'factor', label: 'Price factor', align: 'end' }], rows: { records: '{/actions}', fields: ['symbol', 'date', 'kind', 'purpose', 'factor'] } } },
    caption('ca-none', 'No corporate actions saved yet; they are checked weekly once a stock’s history is complete.'),
    { id: 'rc-table', type: 'table', props: { searchable: true, pageSize: 20, columns: [{ key: 'subject', label: 'Subject' }, { key: 'tool', label: 'Read' }, { key: 'fetched', label: 'Fetched' }, { key: 'source', label: 'Source period' }, { key: 'rows', label: 'Rows', align: 'end' }, { key: 'status', label: 'Status' }], rows: { records: '{/receipts}', fields: ['subject', 'tool', 'fetched', 'source', 'rows', 'status'] } } },
    caption('rc-none', 'No reads yet. Press Sync now, or turn on Background operation.'),
  ];
  return { surface: 'data', nodes, data: replaceAll({ ...noticeData(s), addDraft: s.addDraft ?? '', benchmark: s.benchmark, stocks, actions: acts, receipts }) };
}

export function view(s: State, on: string, chart?: Chart): Update[] {
  return [lab(s, on), strategies(s), results(s, chart), paper(s), data(s, on)];
}
