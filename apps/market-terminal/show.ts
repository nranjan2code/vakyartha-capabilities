// The market show: the same records as the views, as a programme the host
// plays as radio and as a live broadcast (Watch). While the market is open it
// is a live session (badge "Live", refreshed by the host while it plays);
// otherwise a pre-open look or a market wrap. Every number is a value already
// read from NSE and kept in state; the analysis is the database's own
// statistics. Nothing is predicted and nothing is advice. Pure.
import type { Index, Quote, State } from './server.ts';
import { company, exchangeTime, indexName, level, listOf, move, nameOf, portfolio, session, spokenPct, type Analysis } from './views.ts';

interface Chart { kind: 'line' | 'bars'; title?: string; unit?: string; points?: number[]; labels?: [string, string]; base?: number; bars?: { label: string; value: number }[] }
interface Figure { label: string; value: string; change?: number }
export interface Segment {
  text: string; delivery: 'opening' | 'headline' | 'story' | 'aside' | 'closing'; cue?: 'intro' | 'sting' | 'outro'; bed?: true; breaking?: true;
  break?: 'short' | 'story' | 'section'; kicker: string; heading: string; source?: string; chart?: Chart; figures?: Figure[];
}
export interface TickerItem { text: string; kicker?: string; change?: number }
export interface Programme { title: string; badge: string; segments: Segment[]; ticker: TickerItem[] }

/** Index and watchlist series recorded through the session; a chart needs at least three readings. */
const MIN_POINTS = 3;
/** Breaking, on evidence only: an alert that fired in the last 15 minutes, or a headline index two percent or more from its previous close during the session. */
const ALERT_WINDOW = 15 * 60_000, BIG_MOVE = 2;

const istTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
const shortName = (label: string) => indexName(label);
const points = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
/** The session an exchange time belongs to, "30-Oct-2026 15:40" as a Date at noon IST; undefined when unreadable. */
const sessionDate = (t: string | undefined) => {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(t ?? '');
  const d = m ? new Date(`${m[1]} ${m[2]} ${m[3]} 12:00 GMT+0530`) : undefined;
  return d && Number.isFinite(d.getTime()) ? d : undefined;
};
const moved = (n: number) => (n > 0 ? `with a rise of ${spokenPct(n)}` : n < 0 ? `with a fall of ${spokenPct(n)}` : 'unchanged');
const figure = (r: Index): Figure => ({ label: shortName(r.label), value: points(r.last), change: r.changePct });
const rupees = (paise: number) => `₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
/** Money as a presenter rounds it: crore and lakh to two places, smaller sums to the rupee; the figure tile keeps the exact value. */
const spokenRupees = (paise: number) => {
  const r = Math.abs(paise) / 100, two = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return r >= 1e7 ? `${two(r / 1e7)} crore rupees` : r >= 1e5 ? `${two(r / 1e5)} lakh rupees` : `${Math.round(r).toLocaleString('en-IN')} rupees`;
};
/** A company's on-screen line: its name, then the ticker the views use. */
const titled = (symbol: string) => (company(symbol) === symbol ? symbol : `${company(symbol)} · ${symbol}`);

/** A line chart of a series recorded today, measured from the previous close like the figures beside it; undefined when there are too few readings yet. */
function today(s: State, key: string, title: string, now: number): Chart | undefined {
  const series = s.intraday?.series[key] ?? [];
  const day = new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
  const index = s.indices!.find((r) => r.label === key), quote = s.quotes![key];
  const date = sessionDate(index?.exchangeAt);
  const sourceDay = date ? date.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : /^(\d{4}-\d{2}-\d{2})/.exec(quote?.asOf ?? '')?.[1];
  const current = index?.last ?? quote?.last;
  if ((sourceDay && sourceDay !== day) || s.intraday?.day !== day || series.length < MIN_POINTS || series.at(-1)!.v !== current) return undefined;
  const previous = s.indices!.find((r) => r.label === key)?.previous ?? s.quotes![key]?.previous;
  return { kind: 'line', title: `${title} · ${s.intraday!.day}`, points: series.map((p) => p.v), labels: [istTime(series[0]!.t), istTime(series.at(-1)!.t)], ...(previous ? { base: previous } : {}) };
}
const bars = (title: string, rows: { label: string; value: number }[]): Chart => ({ kind: 'bars', title, unit: '%', bars: rows });

export function marketProgramme(s: State, analysis: Analysis, now: number): Programme {
  const sess = session(now), hours = sess.tone === 'success', pre = sess.label.startsWith('Pre-open');
  const stamp = s.indices!.find((r) => r.label === 'NIFTY 50')?.exchangeAt ?? s.indices![0]?.exchangeAt;
  const sourceAt = Date.parse(`${stamp ?? ''} GMT+0530`);
  const open = hours && Number.isFinite(sourceAt) && now >= sourceAt && now - sourceAt <= 15 * 60_000;
  const badge = open ? 'Live' : hours ? 'Saved data' : pre ? 'Pre-open' : sess.label.includes('weekend') ? 'Weekend' : 'Market close';
  const byLabel = new Map(s.indices!.map((r) => [r.label, r]));
  const hour = Number(new Date(now).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  const time = new Date(now).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
  const day = new Date(now).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' });
  const out: Segment[] = [];
  const nifty = byLabel.get('NIFTY 50'), bank = byLabel.get('NIFTY BANK'), vix = byLabel.get('INDIA VIX');
  if (!s.indices!.length && !Object.keys(s.quotes!).length && !s.movers && !s.mood && !s.holdings!.length && !s.alerts!.length) return { title: 'Market Terminal', badge, segments: [], ticker: [] };

  const lead = ['NIFTY 50', 'NIFTY BANK', 'NIFTY MIDCAP 100', 'INDIA VIX'].flatMap((l) => byLabel.get(l) ?? []).map(figure);
  // Outside the session the figures are an earlier day's close: the opener names that day, not just the clock.
  const dataDay = sessionDate(nifty?.exchangeAt), ymd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const earlier = !open && dataDay && ymd(dataDay) !== ymd(new Date(now)) ? dataDay.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' }) : undefined;
  const weekday = earlier?.split(' ')[0];
  out.push({
    text: `${hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}. ${open ? 'This is Market Terminal, live from the NSE session' : earlier ? `This is Market Terminal with ${weekday}'s close` : pre ? 'This is Market Terminal before the opening bell' : 'This is Market Terminal with the market wrap'} at ${time}.${open ? ' Prices are delayed by one to three minutes.' : ''}`,
    delivery: 'opening', cue: 'intro', kicker: open ? 'Live session' : hours ? 'Saved observations' : sess.label.split(' · ')[0]!, heading: earlier ? `${earlier} · close` : `${day} · ${time}`, ...(lead.length ? { figures: lead } : {}),
  });

  // Breaking leads, on evidence: alerts that just fired, then a big move in a headline index during the session.
  const fresh = s.alerts!.filter((a) => a.triggeredAt && now >= Date.parse(a.triggeredAt) && now - Date.parse(a.triggeredAt) <= ALERT_WINDOW).slice(0, 2);
  for (const a of fresh) {
    const what = a.kind === 'move' ? `moved ${spokenPct(a.triggeredValue ?? 0)} on the day` : `${a.kind === 'above' ? 'rose to' : 'fell to'} ${a.triggeredValue?.toLocaleString('en-IN')} rupees, crossing your level of ${a.value.toLocaleString('en-IN')}`;
    out.push({ text: `Breaking. Your alert on ${company(a.symbol)} has triggered: it ${what}, at ${istTime(a.triggeredAt!)}.`, delivery: 'story', breaking: true, break: 'section', kicker: 'Alert', heading: `Alert · ${a.symbol}`, ...(today(s, a.symbol, a.symbol, now) ? { chart: today(s, a.symbol, a.symbol, now)! } : {}) });
  }
  for (const r of open ? [nifty, bank].filter((x): x is Index => !!x && Math.abs(x.changePct) >= BIG_MOVE) : []) {
    if (out.filter((x) => x.breaking).length >= 2) break;
    out.push({ text: `Breaking. ${nameOf(r.label)} is ${r.changePct > 0 ? 'up' : 'down'} ${spokenPct(r.changePct)} on the day, at ${level(r.last)}, as of ${exchangeTime(r.exchangeAt)}.`, delivery: 'story', breaking: true, break: 'section', kicker: 'Big move', heading: `Big move · ${shortName(r.label)}`, figures: [figure(r)], ...(today(s, r.label, shortName(r.label), now) ? { chart: today(s, r.label, shortName(r.label), now)! } : {}) });
  }

  // The headlines, over the bed: the two main indices, the broader market, volatility.
  const headlines: Segment[] = [];
  for (const r of [nifty, bank].filter((x): x is Index => !!x)) {
    headlines.push({ text: `${nameOf(r.label).replace(/^the /, 'The ')} ${move(r.changePct)} to ${level(r.last)}.`, delivery: 'headline', bed: true, break: 'short', kicker: 'The headlines', heading: shortName(r.label), source: `NSE · ${r.exchangeAt} IST · delayed`,
      figures: [figure(r), ...(r.high != null ? [{ label: 'Day high', value: points(r.high) }] : []), ...(r.low != null ? [{ label: 'Day low', value: points(r.low) }] : [])],
      ...(today(s, r.label, shortName(r.label), now) ? { chart: today(s, r.label, shortName(r.label), now)! } : {}) });
  }
  const broad = ['NIFTY NEXT 50', 'NIFTY MIDCAP 100', 'NIFTY SMLCAP 100'].flatMap((l) => byLabel.get(l) ?? []);
  if (broad.length) headlines.push({ text: `In the broader market, ${listOf(broad.map((r) => `${nameOf(r.label)} ${move(r.changePct)}`))}.`, delivery: 'headline', bed: true, break: 'short', kicker: 'The headlines', heading: 'Broader market', chart: bars('Broader market', broad.map((r) => ({ label: shortName(r.label), value: r.changePct }))) });
  const m = s.mood;
  if (vix || m) {
    const lvl = vix?.last ?? m!.vix.level, chg = vix?.changePct ?? m!.vix.change;
    headlines.push({ text: `India VIX is at ${lvl.toFixed(1)}, ${chg >= 0 ? 'up' : 'down'} ${spokenPct(chg)}${m ? `, higher than on ${Math.round(m.vix.percentile)} percent of sessions over the past year` : ''}.`, delivery: 'headline', bed: true, break: 'short', kicker: 'The headlines', heading: 'Volatility', source: `NSE · ${vix?.exchangeAt ?? m?.date} · delayed`,
      figures: [{ label: 'India VIX', value: lvl.toFixed(2), change: chg }, ...(m ? [{ label: '1-year percentile', value: `${Math.round(m.vix.percentile)}` }] : [])], ...(today(s, 'INDIA VIX', 'India VIX', now) ? { chart: today(s, 'INDIA VIX', 'India VIX', now)! } : {}) });
  }
  if (headlines.length) headlines[0]!.text = `The headlines. ${headlines[0]!.text}`;
  out.push(...headlines);

  // The detail, after the sting: breadth, sectors, movers, the watchlist, one instrument's analysis, the portfolio, alerts.
  const detail: Segment[] = [];
  if (m) detail.push({ text: `${m.stocks.reading === 'mixed' ? 'Breadth was mixed' : `Breadth showed a ${m.stocks.reading}`}: ${m.stocks.up.toLocaleString('en-IN')} stocks advanced and ${m.stocks.down.toLocaleString('en-IN')} declined in the last session.`, delivery: 'story', break: 'story', kicker: 'Breadth', heading: 'Advances and declines', source: `NSE breadth · ${m.date} · end of day`,
    figures: [{ label: 'Advances', value: m.stocks.up.toLocaleString('en-IN') }, { label: 'Declines', value: m.stocks.down.toLocaleString('en-IN') }, ...(m.stocks.down ? [{ label: 'Ratio', value: (m.stocks.up / m.stocks.down).toFixed(2) }] : [])] });
  const sectors = s.indices!.filter((r) => r.group === 'sectoral').sort((a, b) => b.changePct - a.changePct);
  if (sectors.length > 1) {
    const shown = sectors.length > 12 ? [...sectors.slice(0, 6), ...sectors.slice(-6)] : sectors;
    detail.push({ text: `Among sectors, ${nameOf(sectors[0]!.label)} led ${moved(sectors[0]!.changePct)}, and ${nameOf(sectors.at(-1)!.label)} lagged ${moved(sectors.at(-1)!.changePct)}. ${sectors.filter((r) => r.changePct > 0).length} of ${sectors.length} sector indices are higher.`, delivery: 'story', break: 'story', kicker: 'Sectors', heading: 'Sector moves', source: `NSE · ${sectors[0]!.exchangeAt} IST · ${shown.length} of ${sectors.length} sectors`, figures: [{ label: 'Rising sectors', value: `${sectors.filter((r) => r.changePct > 0).length} / ${sectors.length}` }, { label: 'Falling sectors', value: String(sectors.filter((r) => r.changePct < 0).length) }], chart: bars('Sector indices', shown.map((r) => ({ label: shortName(r.label), value: r.changePct }))) });
  }
  const mv = s.movers;
  if (mv?.gainers.length) detail.push({ text: `Among the top gainers, ${listOf(mv.gainers.slice(0, 3).map((r) => `${company(r.symbol)} ${move(r.changePct)}`))}.`, delivery: 'story', break: 'story', kicker: 'Movers', heading: 'Top gainers', source: `NSE · ${mv.segment} · ${mv.at} · delayed`, chart: bars('Top gainers', mv.gainers.slice(0, 8).map((r) => ({ label: r.symbol, value: r.changePct }))) });
  if (mv?.losers.length) detail.push({ text: `On the other side, ${listOf(mv.losers.slice(0, 3).map((r) => `${company(r.symbol)} ${move(r.changePct)}`))}.`, delivery: 'story', break: 'story', kicker: 'Movers', heading: 'Top losers', source: `NSE · ${mv.segment} · ${mv.at} · delayed`, chart: bars('Top losers', mv.losers.slice(0, 8).map((r) => ({ label: r.symbol, value: r.changePct }))) });
  const watch = s.watchlist!.flatMap((w) => s.quotes![w] ?? []);
  if (watch.length) {
    const big = [...watch].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
    detail.push({ text: `On your watchlist, the biggest moves were ${listOf(big.slice(0, 3).map((q) => `${company(q.symbol)}, which ${move(q.changePct)} to ${q.last.toLocaleString('en-IN')} rupees`))}.`, delivery: 'story', break: 'section', kicker: 'Watchlist', heading: 'Your watchlist', source: `Saved NSE quotes · ${watch.length} / ${s.watchlist!.length} symbols priced · individual quote times vary`, chart: bars('Watchlist', watch.slice(0, 12).map((q) => ({ label: q.symbol, value: q.changePct }))) });
    for (const q of big.slice(0, 2).filter((x) => today(s, x.symbol, x.symbol, now))) detail.push(quotePart(s, q, now));
  }
  const rows = analysis.rows;
  if (s.symbol && rows.length >= 20) {
    const last = rows.at(-1)!, recent = rows.slice(-120);
    const vs = (avg: number | null, n: number) => avg == null ? '' : `It is trading ${last.close >= avg ? 'above' : 'below'} its ${n}-session average of ${avg.toLocaleString('en-IN')} rupees.`;
    detail.push({
      text: [`Looking at ${company(s.symbol)} over the last ${analysis.sessions} sessions in the database:`, analysis.priceReturn == null ? '' : `the price ${move(analysis.priceReturn)}.`, analysis.volatility == null ? '' : `Annualised volatility is about ${spokenPct(analysis.volatility)}.`, analysis.maxDrawdown == null ? '' : `The deepest fall from a high was ${spokenPct(analysis.maxDrawdown)}.`, vs(last.sma20, 20), vs(last.sma50, 50)].filter(Boolean).join(' '),
      delivery: 'story', break: 'section', kicker: 'Analysis', heading: `${titled(s.symbol)} · ${analysis.sessions} sessions`, source: `NSE daily closes · ${recent[0]!.date} to ${last.date} · unadjusted`,
      chart: { kind: 'line', title: `${s.symbol} · daily close`, points: recent.map((r) => r.close), labels: [recent[0]!.date, last.date] },
      figures: [
        ...(analysis.priceReturn == null ? [] : [{ label: 'Return', value: `${analysis.priceReturn.toFixed(2)}%`, change: analysis.priceReturn }]),
        ...(analysis.volatility == null ? [] : [{ label: 'Volatility', value: `${analysis.volatility.toFixed(1)}%` }]),
        ...(analysis.maxDrawdown == null ? [] : [{ label: 'Max drawdown', value: `${analysis.maxDrawdown.toFixed(1)}%` }]),
        ...(last.sma20 == null ? [] : [{ label: '20-session avg', value: last.sma20.toLocaleString('en-IN') }]),
        ...(last.sma50 == null ? [] : [{ label: '50-session avg', value: last.sma50.toLocaleString('en-IN') }]),
      ],
    });
  }
  const p = portfolio(s);
  if (p.rows.length && p.missing < p.rows.length) detail.push({
    text: `${p.rows.filter((r) => r.q).length < p.rows.length ? `Only ${p.rows.filter((r) => r.q).length} of ${p.rows.length} holdings are priced. Their value is` : 'Your portfolio is worth'} ${spokenRupees(p.value)}, ${p.day >= 0 ? 'up' : 'down'} ${spokenRupees(p.day)} on the day, with an unrealised ${p.pnl >= 0 ? 'gain' : 'loss'} of ${spokenRupees(p.pnl)}.`,
    delivery: 'story', break: 'section', kicker: 'Portfolio', heading: 'Your portfolio', source: `${p.rows.length - p.missing} / ${p.rows.length} holdings priced · saved NSE quotes · charges and taxes excluded`,
    figures: [{ label: 'Priced holdings', value: `${p.rows.length - p.missing} / ${p.rows.length}` }, { label: 'Value', value: rupees(p.value) }, { label: 'Day', value: `${p.day < 0 ? '−' : '+'}${rupees(p.day)}`, ...(p.value - p.day ? { change: (p.day / (p.value - p.day)) * 100 } : {}) }, { label: 'Unrealised', value: `${p.pnl < 0 ? '−' : '+'}${rupees(p.pnl)}`, ...(p.pricedCost ? { change: (p.pnl / p.pricedCost) * 100 } : {}) }],
  });
  if (p.rows.length && p.missing === p.rows.length) detail.push({ text: `Your portfolio has ${p.rows.length} holdings, but none has a saved price. Refresh the market to value them.`, delivery: 'aside', break: 'section', kicker: 'Portfolio', heading: 'Portfolio needs prices', source: 'Local holdings · no saved NSE prices', figures: [{ label: 'Holdings', value: String(p.rows.length) }, { label: 'Priced', value: '0' }] });
  const fired = s.alerts!.filter((a) => a.triggeredAt && !fresh.includes(a));
  if (fired.length) detail.push({ text: `${fired.length === 1 ? 'One earlier alert has' : `${fired.length} earlier alerts have`} triggered: ${listOf(fired.slice(0, 3).map((a) => `${company(a.symbol)} ${a.kind === 'move' ? `moved ${spokenPct(a.triggeredValue ?? 0)}` : `${a.kind === 'above' ? 'reached' : 'fell to'} ${a.triggeredValue?.toLocaleString('en-IN')} rupees`}`))}.`, delivery: 'aside', break: 'story', kicker: 'Alerts', heading: 'Alerts' });
  if (detail.length) detail[0] = { ...detail[0]!, cue: 'sting' };
  out.push(...detail);

  out.push({ text: `${earlier ? `That's ${weekday}'s close` : `That's the market at ${time}`}. NSE data is delayed, and this is information, not investment advice.`, delivery: 'closing', cue: 'outro', break: 'section', kicker: 'Market Terminal', heading: 'NSE data is delayed · information, not investment advice' });

  // Every index and watchlist price along the bottom, broad first, then the watchlist, then sectors.
  const ticker: TickerItem[] = [
    ...s.indices!.filter((r) => r.group !== 'sectoral').map((r) => ({ text: `${shortName(r.label)} ${level(r.last)}`, kicker: 'Index', change: r.changePct })),
    ...watch.map((q) => ({ text: `${q.symbol} ₹${q.last.toLocaleString('en-IN')}`, kicker: 'Watchlist', change: q.changePct })),
    ...sectors.map((r) => ({ text: `${shortName(r.label)} ${level(r.last)}`, kicker: 'Sector', change: r.changePct })),
  ].slice(0, 80);
  return { title: 'Market Terminal', badge: earlier && !pre && !hours ? 'Last close' : badge, segments: out.map((part) => ({ source: `Saved NSE observations${nifty ? ` · ${nifty.exchangeAt} IST` : ''} · delayed`, ...part })), ticker };
}

function quotePart(s: State, q: Quote, now: number): Segment {
  return { text: `${company(q.symbol)} ${move(q.changePct)} to ${q.last.toLocaleString('en-IN')} rupees, against a previous close of ${q.previous.toLocaleString('en-IN')}.`, delivery: 'aside', break: 'story', kicker: 'Watchlist', heading: titled(q.symbol), source: `NSE · ${q.basis === 'close' ? 'Close' : 'Last trade'} · ${q.asOf} · delayed`,
    chart: today(s, q.symbol, q.symbol, now)!, figures: [{ label: q.symbol, value: `₹${q.last.toLocaleString('en-IN')}`, change: q.changePct }, { label: 'Day high', value: `₹${q.high.toLocaleString('en-IN')}` }, { label: 'Day low', value: `₹${q.low.toLocaleString('en-IN')}` }] };
}
