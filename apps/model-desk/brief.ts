// The daily brief (the original's editorial layer): what changed this week and the one story it
// leads with, chosen by named rules so every claim can be checked. Facts come from SQL over the
// change events and price spans; choosing the story and writing it, for the eye and for the ear,
// are pure functions of those facts. No model writes any of it.

import type { Database } from './store.ts';
import { rateSql, type Workload } from './market.ts';

const DAY = 86_400_000;
/** The week the brief covers, ending at the latest snapshot's day. */
export const WEEK_DAYS = 7;
/** A lab's own price move this large is news. */
export const MATERIAL_MOVE = 0.15;
/** A reseller's move this large is worth a mention. */
export const STREET_MOVE = 0.4;
/** A model released this recently is a launch. */
export const LAUNCH_DAYS = 3;
/** This many retirements in a week is a wave. */
export const SUNSET_WAVE = 3;
/** Days of history before the price index is published. */
export const INDEX_MIN_DAYS = 14;

export const dayBefore = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * DAY).toISOString().slice(0, 10);

export interface Move { key: string; id: string | null; name: string; provider: string; providerName: string; from: number; to: number; pct: number; day: string; firstParty: boolean }

/**
 * Input price moves since `since`, one per model and provider: a series of nudges reads as one
 * move from its first price to its last. A move into or out of an unpublished ($0) price is a
 * listing change, not a repricing.
 */
export async function moves(db: Database, since: string): Promise<Move[]> {
  const rows = await db.query(`
    WITH changed AS (
      SELECT e.run, e.day, e.provider, e.model, e.canonical, coalesce(e.lab, split_part(e.canonical, '/', 1)) lab, e.name,
        unnest(from_json(e.changes, '[{"field":"VARCHAR","old":"JSON","new":"JSON"}]')) c
      FROM events e WHERE e.type = 'repriced' AND e.day >= ?),
    inputs AS (
      SELECT run, day, provider, model, canonical, lab, name, TRY_CAST(c.old AS DOUBLE) old, TRY_CAST(c.new AS DOUBLE) new
      FROM changed WHERE c.field = 'cost.input'),
    chained AS (
      SELECT coalesce(canonical, provider || '/' || model) key, canonical, provider, any_value(lab) lab, arg_max(name, run) name,
        arg_min(old, run) from_price, arg_max(new, run) to_price, max(day) AS day
      FROM inputs WHERE old > 0 AND new > 0 GROUP BY 1, 2, 3)
    SELECT c.key, c.canonical id, coalesce(m.name, c.name, c.key) name, c.provider, coalesce(p.name, c.provider) provider_name,
      c.from_price, c.to_price, c.day, (c.lab IS NOT NULL AND (c.provider = c.lab OR starts_with(c.provider, c.lab || '-'))) first_party
    FROM chained c LEFT JOIN models m ON m.id = c.canonical LEFT JOIN providers p ON p.id = c.provider
    WHERE c.from_price <> c.to_price ORDER BY c.key, c.provider LIMIT 5000`, [since]);
  return rows.map((r) => {
    const from = Number(r.from_price), to = Number(r.to_price);
    return { key: String(r.key), id: r.id === null ? null : String(r.id), name: String(r.name), provider: String(r.provider), providerName: String(r.provider_name), from, to, pct: (to - from) / from, day: String(r.day), firstParty: Boolean(r.first_party) };
  });
}

export interface Collapsed extends Move { venues: number }
/** One row per model: the median move, and how many providers made it (the original's rule). */
export function collapse(list: Move[]): Collapsed[] {
  const by = new Map<string, Move[]>();
  for (const m of list) by.set(m.key, [...(by.get(m.key) ?? []), m]);
  return [...by.values()].map((group) => {
    const sorted = [...group].sort((a, b) => a.pct - b.pct);
    return { ...sorted[Math.floor(sorted.length / 2)]!, venues: new Set(group.map((m) => m.provider)).size };
  }).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct) || a.name.localeCompare(b.name));
}

export interface Launch { id: string; name: string; lab: string; lab_name: string; release_date: string; context: number | null; providers: number }
export async function launches(db: Database, since: string): Promise<Launch[]> {
  return await db.query(`SELECT m.id, coalesce(m.name, m.id) name, m.lab, coalesce(any_value(p.name), m.lab) lab_name, m.release_date, m.context, count(DISTINCT l.provider)::INTEGER providers
    FROM models m JOIN listings l ON l.canonical = m.id AND coalesce(l.status, '') <> 'deprecated' LEFT JOIN providers p ON p.id = m.lab
    WHERE length(m.release_date) = 10 AND m.release_date >= ? GROUP BY m.id, m.name, m.lab, m.release_date, m.context ORDER BY m.release_date DESC, name LIMIT 50`, [since]) as unknown as Launch[];
}

export async function sunsets(db: Database, since: string): Promise<{ name: string; day: string }[]> {
  return await db.query(`SELECT coalesce(m.name, e.name, e.model) name, e.day FROM events e LEFT JOIN models m ON m.id = e.canonical
    WHERE e.type = 'deprecated' AND e.day >= ? ORDER BY e.day DESC, name LIMIT 200`, [since]) as unknown as { name: string; day: string }[];
}

export interface IndexPoint { day: string; median: number; models: number }
/**
 * The lab price index: for each day, the median across models of their own lab's cheapest price
 * for the request, read from the price spans at that day's last refresh. A lab's own price is
 * its claim on the market, so no reseller's margin moves it.
 */
export async function priceIndex(db: Database, w: Workload, days = 120): Promise<IndexPoint[]> {
  const rows = await db.query(`
    WITH points AS (SELECT day, max(started_at) t FROM runs WHERE status IN ('applied', 'unchanged') GROUP BY day ORDER BY day DESC LIMIT ${Math.max(1, Math.floor(days))}),
    held AS (
      SELECT p.day, h.canonical, min(${rateSql(w, 'h')}) own
      FROM points p JOIN price_history h ON h.canonical IS NOT NULL AND h.valid_from <= p.t AND (h.valid_to IS NULL OR h.valid_to > p.t)
      WHERE h.provider = split_part(h.canonical, '/', 1) OR starts_with(h.provider, split_part(h.canonical, '/', 1) || '-')
      GROUP BY p.day, h.canonical)
    SELECT day, round(median(own), 4) median, count(own)::INTEGER models FROM held WHERE own IS NOT NULL GROUP BY day ORDER BY day`);
  return rows.map((r) => ({ day: String(r.day), median: Number(r.median), models: Number(r.models) }));
}

export type LedeKind = 'cut' | 'launch' | 'hike' | 'sunset' | 'street' | 'quiet';
export interface Lede { kind: LedeKind; headline: string; body: string; rule: string; model: string | null; /** The story written for the ear. */ said: string; /** The story's one figure, shown large, and what it measures. */ figure: string; figureLabel: string }
export interface WeekFacts { day: string; labs: Collapsed[]; street: Collapsed[]; launches: Launch[]; sunsets: { name: string; day: string }[]; changes: number }

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`;
const usd = (v: number) => (v === 0 ? '$0' : v < 1 ? `$${Number(v.toFixed(3))}` : `$${Number(v.toFixed(2))}`);
const tokensShort = (n: number) => (n >= 1_000_000 ? `${Number((n / 1_000_000).toFixed(2))}M` : n >= 1_000 ? `${Math.round(n / 1_000)}K` : String(n));
/** A price for the ear: cents below a dollar, never symbols a voice reads letter by letter. */
export function spokenPrice(v: number): string {
  if (v >= 1) return `${Number(v.toFixed(2))} dollars`;
  if (v >= 0.01) return `${Number((v * 100).toFixed(1))} cents`;
  return 'a fraction of a cent';
}
const spokenTokens = (n: number) => (n >= 1_000_000 ? `${Number((n / 1_000_000).toFixed(2))} million tokens` : n >= 1_000 ? `${Math.round(n / 1_000)} thousand tokens` : `${n} tokens`);
const spokenPct = (v: number) => `${Math.round(Math.abs(v) * 100)} percent`;
export const spokenDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * The day's lead story. The newest qualifying story wins; the order cut, launch, hike, sunset,
 * reseller only breaks ties, so an older dramatic move cannot hide newer news. Each story names
 * the rule that chose it.
 */
export function lede(f: WeekFacts): Lede {
  const cut = f.labs.filter((m) => m.pct <= -MATERIAL_MOVE).sort((a, b) => b.day.localeCompare(a.day))[0];
  const hike = f.labs.filter((m) => m.pct >= MATERIAL_MOVE).sort((a, b) => b.day.localeCompare(a.day))[0];
  const street = f.street.filter((m) => Math.abs(m.pct) >= STREET_MOVE).sort((a, b) => b.day.localeCompare(a.day))[0];
  const launch = f.launches[0];
  const candidates: { kind: LedeKind; day: string; order: number }[] = [];
  if (cut) candidates.push({ kind: 'cut', day: cut.day, order: 0 });
  if (launch) candidates.push({ kind: 'launch', day: launch.release_date, order: 1 });
  if (hike) candidates.push({ kind: 'hike', day: hike.day, order: 2 });
  if (f.sunsets.length >= SUNSET_WAVE) candidates.push({ kind: 'sunset', day: f.sunsets[0]!.day, order: 3 });
  if (street) candidates.push({ kind: 'street', day: street.day, order: 4 });
  const pick = candidates.sort((a, b) => b.day.localeCompare(a.day) || a.order - b.order)[0]?.kind;
  if (pick === 'cut') return { kind: 'cut', headline: `${cut!.name} is ${pct(cut!.pct)} cheaper`, body: `${cut!.providerName} cut its own input price from ${usd(cut!.from)} to ${usd(cut!.to)} per million tokens. Every provider reselling it now prices against a lower floor.`, rule: `The newest cut of ${pct(MATERIAL_MOVE)} or more by a model's own lab, in the last ${WEEK_DAYS} days.`, model: cut!.id, figure: `−${pct(cut!.pct)}`, figureLabel: `${cut!.name}, the lab's own input price`,
    said: `${cut!.name} is ${spokenPct(cut!.pct)} cheaper. ${cut!.providerName} cut its own input price from ${spokenPrice(cut!.from)} to ${spokenPrice(cut!.to)} per million tokens, so every provider reselling it now prices against a lower floor.` };
  if (pick === 'launch') {
    const n = launch!.providers, ctx = launch!.context ? Number(launch!.context) : null;
    return { kind: 'launch', headline: `${launch!.name} is out`, body: `${launch!.lab_name} released it on ${launch!.release_date}${ctx ? ` with a ${tokensShort(ctx)}-token context` : ''}, and ${n} provider${n === 1 ? '' : 's'} already list${n === 1 ? 's' : ''} it.`, rule: `A model released in the last ${LAUNCH_DAYS} days with at least one live listing.`, model: launch!.id, figure: String(n), figureLabel: `provider${n === 1 ? '' : 's'} list ${launch!.name} already`,
      said: `${launch!.name} is out. ${launch!.lab_name} released it on ${spokenDay(launch!.release_date)}${ctx ? `, with a context of ${spokenTokens(ctx)}` : ''}, and ${n === 1 ? 'one provider already lists it' : `${n} providers already list it`}.` };
  }
  if (pick === 'hike') return { kind: 'hike', headline: `${hike!.name} costs ${pct(hike!.pct)} more`, body: `${hike!.providerName} raised its own input price from ${usd(hike!.from)} to ${usd(hike!.to)} per million tokens, a rare direction in this market.`, rule: `The newest rise of ${pct(MATERIAL_MOVE)} or more by a model's own lab, in the last ${WEEK_DAYS} days.`, model: hike!.id, figure: `+${pct(hike!.pct)}`, figureLabel: `${hike!.name}, the lab's own input price`,
    said: `${hike!.name} costs ${spokenPct(hike!.pct)} more. ${hike!.providerName} raised its own input price from ${spokenPrice(hike!.from)} to ${spokenPrice(hike!.to)} per million tokens, a rare direction in this market.` };
  if (pick === 'sunset') {
    const body = `Providers marked ${f.sunsets.length} listings deprecated, including ${f.sunsets[0]!.name}. Check anything you depend on before those endpoints stop answering.`;
    return { kind: 'sunset', headline: `${f.sunsets.length} listings were retired this week`, body, rule: `${SUNSET_WAVE} or more deprecations in the last ${WEEK_DAYS} days.`, model: null, said: `${f.sunsets.length} listings were retired this week. ${body}`, figure: String(f.sunsets.length), figureLabel: 'listings retired this week' };
  }
  if (pick === 'street') {
    const verb = street!.pct < 0 ? 'cut' : 'raised';
    return { kind: 'street', headline: `${street!.providerName} ${verb} its ${street!.name} price by ${pct(street!.pct)}`, body: `The lab has not moved: this is a reseller changing its own price, from ${usd(street!.from)} to ${usd(street!.to)} per million input tokens. Worth knowing if you buy through them.`, rule: `The newest reseller move of ${pct(STREET_MOVE)} or more, in the last ${WEEK_DAYS} days.`, model: street!.id, figure: `${street!.pct < 0 ? '−' : '+'}${pct(street!.pct)}`, figureLabel: `${street!.name} at ${street!.providerName}`,
      said: `${street!.providerName} ${verb} its ${street!.name} price by ${spokenPct(street!.pct)}. The lab has not moved: this is a reseller changing its own price, from ${spokenPrice(street!.from)} to ${spokenPrice(street!.to)} per million input tokens.` };
  }
  return {
    kind: 'quiet', headline: 'No lab moved its prices this week',
    body: f.changes ? `The desk logged ${f.changes} change${f.changes === 1 ? '' : 's'} this week, none of them a lab repricing its own model by ${pct(MATERIAL_MOVE)} or more.` : 'Nothing changed anywhere in the catalog this week.',
    rule: 'Nothing met the rules for a cut, a launch, a rise, a wave of retirements or a reseller move.', model: null, figure: String(f.changes), figureLabel: `change${f.changes === 1 ? '' : 's'} this week, none of them news`,
    said: f.changes ? `No lab moved its own prices this week. The desk logged ${f.changes} change${f.changes === 1 ? '' : 's'}, none of them a lab repricing its own model by ${spokenPct(MATERIAL_MOVE)} or more.` : 'No lab moved its own prices this week, and nothing changed anywhere in the catalog.',
  };
}

/** The brief written for the ear, from the same facts the page shows. */
export function spoken(f: WeekFacts, l: Lede, index: IndexPoint[]): string {
  const parts = [`The model market for the week to ${spokenDay(f.day)}.`, l.said];
  const labs = f.labs.length, street = f.street.length;
  if (labs || street) parts.push(`This week labs changed ${labs ? `${labs} of their own prices` : 'none of their own prices'}, and resellers changed ${street || 'none'}.`);
  const top = f.labs.find((m) => m.id !== l.model);
  if (top) parts.push(`Also, ${top.name} ${top.pct < 0 ? 'fell' : 'rose'} ${spokenPct(top.pct)} at ${top.providerName}.`);
  if (index.length >= INDEX_MIN_DAYS) {
    const a = index[0]!, b = index.at(-1)!, change = a.median > 0 ? (b.median - a.median) / a.median : 0;
    parts.push(`The lab price index ${change < 0 ? 'fell' : change > 0 ? 'rose' : 'held'}${change ? ` ${spokenPct(change)}` : ''} over ${index.length} days, to a median of ${spokenPrice(b.median)} per million tokens.`);
  }
  return parts.join(' ');
}
