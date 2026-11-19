// Every Model Desk surface, derived from saved state and one bounded read of the database
// (store.ts `snapshot`). Pure: the same inputs always give the same views.

import type { Snapshot } from './store.ts';
import { EMPTY, RECENT } from './store.ts';
import { SOURCE } from './source.ts';
import { PROVENANCE_LABEL, PROVENANCE_NOTE, type Provenance } from './provenance.ts';
import { billable, CORROBORATION, MIN_RANKED, OUTLIER_FACTOR, spread, workload, WORKLOADS, type Abilities, type Board, type Entry, type Facts, type ModelDetail, type ModelRow, type Offer, type Point, type Score, type Span, type Workload } from './market.ts';

export interface State { type?: string; model?: string; workload?: string; volume?: number; compare?: string[]; board?: { slug: string; measure: string } }
/** Requests a month, the unit a bill is approved in (the original's choices). */
export const VOLUMES = [10_000, 100_000, 1_000_000, 10_000_000];
/** At most this many models side by side. */
export const MAX_COMPARED = 4;
/** A model in Compare: its judgement, facts, capabilities and scores. */
export interface Compared { detail: ModelDetail; facts: Facts | null; abilities: Abilities; scores: Score[] }
/** One model opened on the Models view. */
export interface Opened { detail: ModelDetail; offers: Offer[]; facts: Facts | null; scores: Score[]; history: Point[]; spans: Span[]; events: Record<string, unknown>[] }
/** Everything the views read: the pipeline snapshot, the model list and the opened model. */
export interface Loaded { snap: Snapshot; models: ModelRow[]; open: Opened | null; compared: Compared[]; boards: Board[]; board: Entry[] }
export const NOTHING: Loaded = { snap: EMPTY, models: [], open: null, compared: [], boards: [], board: [] };
interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
export interface Update { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] }

export const TITLES: Record<string, string> = { overview: 'Overview', models: 'Models', costs: 'Costs', compare: 'Compare', benchmarks: 'Benchmarks', changes: 'Changes', pipeline: 'Pipeline' };

export const TYPES: Record<string, string> = {
  repriced: 'Repriced', model_added: 'Model added', provider_added: 'New provider', deprecated: 'Deprecated',
  context_changed: 'Limits changed', capability_changed: 'Details changed', model_removed: 'Model removed', provider_removed: 'Provider left',
};
const FIELDS: Record<string, string> = {
  'cost.input': 'input price', 'cost.output': 'output price', 'cost.cache_read': 'cache read price', 'cost.cache_write': 'cache write price', 'cost.reasoning': 'reasoning price',
  'cost.tiers': 'context price tiers',
  'limit.context': 'context', 'limit.input': 'input limit', 'limit.output': 'output limit', 'modalities.input': 'inputs', 'modalities.output': 'outputs',
  release_date: 'release date', last_updated: 'last updated', open_weights: 'open weights', tool_call: 'tool calls', structured_output: 'structured output',
};
const STATUS: Record<string, string> = { applied: 'Applied', unchanged: 'No change', blocked: 'Blocked by a check', failed: 'Read failed' };

export function normalize(input: unknown): State {
  const s = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const type = typeof s.type === 'string' && (s.type === 'all' || Object.hasOwn(TYPES, s.type)) ? s.type : 'all';
  const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 200;
  const model = id(s.model) ? s.model as string : undefined;
  const chosen = workload(s.workload).id;
  const volume = VOLUMES.includes(Number(s.volume)) ? Number(s.volume) : 100_000;
  const compare = Array.isArray(s.compare) ? [...new Set(s.compare.filter(id) as string[])].slice(0, MAX_COMPARED) : [];
  const b = s.board as { slug?: unknown; measure?: unknown } | undefined;
  const board = b && typeof b === 'object' && id(b.slug) && typeof b.measure === 'string' && b.measure.length <= 120 ? { slug: b.slug as string, measure: b.measure } : undefined;
  return { type, ...(model ? { model } : {}), workload: chosen, volume, compare, ...(board ? { board } : {}) };
}

const int = (v: unknown) => Number(v ?? 0);
const whole = (n: number) => n.toLocaleString('en-US');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A source time in UTC, the catalog's own clock, written out so it reads the same everywhere. */
export function when(iso: unknown): string {
  const d = new Date(String(iso ?? ''));
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}
const seconds = (a: unknown, b: unknown) => {
  const ms = new Date(String(b)).getTime() - new Date(String(a)).getTime();
  return Number.isFinite(ms) && ms >= 0 ? `${(ms / 1000).toFixed(1)} s` : '—';
};
const value = (v: unknown) => (v === null || v === undefined || v === '' ? 'none' : typeof v === 'number' ? String(Number(v.toPrecision(6))) : String(v));

/** "input price 0.15 to 0.3; context 128000 to 200000", the first three changes of an event. */
export function summary(changes: unknown): string {
  let list: { field?: unknown; old?: unknown; new?: unknown }[] = [];
  try { list = typeof changes === 'string' ? JSON.parse(changes) : Array.isArray(changes) ? changes : []; } catch { list = []; }
  if (!Array.isArray(list) || !list.length) return '';
  const shown = list.slice(0, 3).map((c) => `${FIELDS[String(c.field)] ?? String(c.field).replace(/_/g, ' ')} ${value(c.old)} to ${value(c.new)}`);
  return shown.join('; ') + (list.length > 3 ? `; and ${list.length - 3} more` : '');
}

function eventRows(rows: Record<string, unknown>[]) {
  return rows.map((e) => ({
    id: String(e.id), day: String(e.day ?? ''), type: TYPES[String(e.type)] ?? String(e.type), provider: String(e.provider_name ?? e.provider ?? ''),
    model: String(e.name ?? e.model ?? ''), canonical: String(e.canonical ?? '—'), change: summary(e.changes) || '—',
  }));
}

const replace = (value: Record<string, unknown>) => [{ op: 'replace' as const, path: '/' as const, value }];
const EVENT_COLUMNS = [{ key: 'type', label: 'Change' }, { key: 'provider', label: 'Provider' }, { key: 'model', label: 'Model' }, { key: 'change', label: 'What changed' }];

/** Models where shopping around pays: widely priced, with a real gap (the original's rule). */
export function widest(models: ModelRow[], minProviders = 6, limit = 6): ModelRow[] {
  return models.filter((m) => m.comparable && m.priced >= minProviders && (spread(m) ?? 0) >= 1.5)
    .sort((a, b) => spread(b)! - spread(a)! || a.name.localeCompare(b.name)).slice(0, limit);
}

function overview(snap: Snapshot, models: ModelRow[], w: Workload): Update {
  const wide = widest(models);
  const t = snap.totals, latest = snap.latest, applied = snap.applied;
  const kept = latest && latest.status !== 'applied' && latest.status !== 'unchanged';
  const appliedEvents = applied ? snap.recent.filter((e) => int(e.run) === int(applied.id)) : [];
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: [...(applied ? [] : ['ov-empty']), ...(kept ? ['ov-kept'] : []), 'ov-stats', ...(wide.length ? ['ov-spreads'] : []), ...(applied ? ['ov-latest'] : [])] },
  ];
  if (!applied) nodes.push({ id: 'ov-empty', type: 'alert', props: { tone: 'info', title: 'No snapshot yet', body: 'Use Refresh in the app header to read the open model catalog. A refresh makes about 13 reads and takes under a minute.' } });
  if (kept) nodes.push({ id: 'ov-kept', type: 'alert', props: { tone: latest!.status === 'failed' ? 'danger' : 'warning', title: `The last refresh, ${when(latest!.started_at)}, kept the previous snapshot`, body: '{/kept}' } });
  nodes.push(
    { id: 'ov-stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['ov-providers', 'ov-listings', 'ov-models', 'ov-matched'] },
    { id: 'ov-providers', type: 'stat', props: { label: 'Providers', value: '{/stats/providers}' } },
    { id: 'ov-listings', type: 'stat', props: { label: 'Listings', value: '{/stats/listings}', caption: '{/stats/priced}' } },
    { id: 'ov-models', type: 'stat', props: { label: 'Models', value: '{/stats/models}', caption: '{/stats/labs}' } },
    { id: 'ov-matched', type: 'stat', props: { label: 'Listings matched to a model', value: '{/stats/matched}' } },
  );
  if (wide.length) nodes.push(
    { id: 'ov-spreads', type: 'section', props: { title: 'Where shopping around pays', description: `The same model across providers, priced for ${article(w)}. Prices are US dollars per million tokens.` }, children: ['ov-spread-table'] },
    { id: 'ov-spread-table', type: 'table', props: { rows: '{/spreads}', columns: [{ key: 'name', label: 'Model' }, { key: 'priced', label: 'Priced by', align: 'end' }, { key: 'from', label: 'From', align: 'end' }, { key: 'to', label: 'Up to', align: 'end' }, { key: 'spread', label: 'Spread', align: 'end' }] } },
  );
  if (applied) {
    nodes.push({ id: 'ov-latest', type: 'section', props: { title: 'Latest snapshot', description: '{/latestNote}' }, children: appliedEvents.length ? ['ov-types', 'ov-events'] : ['ov-quiet'] });
    if (appliedEvents.length) nodes.push(
      { id: 'ov-types', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: snap.byType.map((b) => `ov-type-${String(b.type)}`) },
      ...snap.byType.map((b) => ({ id: `ov-type-${String(b.type)}`, type: 'stat', props: { label: TYPES[String(b.type)] ?? String(b.type), value: whole(int(b.n)) } })),
      { id: 'ov-events', type: 'table', props: { rows: '{/events}', columns: EVENT_COLUMNS, searchable: true, pageSize: 15 } },
    );
    else nodes.push({ id: 'ov-quiet', type: 'text', props: { content: '{/quiet}', variant: 'caption' } });
  }
  const matched = t.listings ? `${Math.round((t.attributed / t.listings) * 100)}%` : '—';
  const firstFail = snap.findings.find((f) => f.level === 'fail');
  const data: Record<string, unknown> = {
    stats: {
      providers: t.providers ? whole(t.providers) : '—', listings: t.listings ? whole(t.listings) : '—', priced: t.listings ? `${whole(t.priced)} with prices` : 'none yet',
      models: t.models ? whole(t.models) : '—', labs: t.models ? `from ${whole(t.labs)} labs` : 'none yet', matched,
    },
    ...(wide.length ? { spreads: wide.map((m) => ({ name: m.name, priced: `${m.priced} providers`, from: money(m.credible_rate ?? m.low_rate), to: money(m.high_rate), spread: times(spread(m)) })) } : {}),
    ...(kept ? { kept: `${String(latest!.note ?? '')}${firstFail ? `. ${String(firstFail.message)}.` : '.'} See Pipeline for every check.` } : {}),
    ...(applied ? {
      latestNote: `Applied ${when(applied.started_at)}. ${String(applied.note ?? '')}.`,
      ...(appliedEvents.length ? { events: eventRows(appliedEvents) } : { quiet: int(applied.events) ? 'The changes are listed under Changes.' : 'This snapshot is the baseline; later refreshes list what changes against it.' }),
    } : {}),
  };
  return { surface: 'overview', nodes, data: replace(data) };
}

function changes(s: State, snap: Snapshot): Update {
  const types = ['all', ...Object.keys(TYPES).filter((k) => snap.recent.some((e) => e.type === k))];
  const chosen = types.includes(s.type!) ? s.type! : 'all';
  const rows = eventRows(chosen === 'all' ? snap.recent : snap.recent.filter((e) => e.type === chosen));
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: [...(snap.recent.length ? ['ch-filter'] : []), rows.length ? 'ch-table' : 'ch-none'] },
  ];
  if (snap.recent.length) nodes.push(
    { id: 'ch-filter', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: types.map((k) => `ch-show-${k}`) },
    ...types.map((k) => ({ id: `ch-show-${k}`, type: 'button', props: { label: k === 'all' ? 'All' : TYPES[k], action: 'show_changes', payload: { type: k }, style: k === chosen ? 'primary' : 'secondary' } })),
  );
  nodes.push(rows.length
    ? { id: 'ch-table', type: 'table', props: { rows: '{/events}', columns: [{ key: 'day', label: 'Day' }, ...EVENT_COLUMNS, { key: 'canonical', label: 'Underlying model' }], searchable: true, sortable: true, pageSize: 25 } }
    : { id: 'ch-none', type: 'text', props: { content: 'No changes yet. Changes appear from the second refresh, measured against the first snapshot.', variant: 'caption' } });
  return { surface: 'changes', nodes, data: replace(rows.length ? { events: rows, shown: `${rows.length} of the latest ${RECENT}` } : {}) };
}

function pipeline(snap: Snapshot): Update {
  const latest = snap.latest;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['pl-stats', 'pl-tabs'] },
    { id: 'pl-stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['pl-status', 'pl-took', 'pl-reads', 'pl-checks'] },
    { id: 'pl-status', type: 'stat', props: { label: 'Last refresh', value: '{/stats/status}', caption: '{/stats/when}', tone: '{/stats/tone}' } },
    { id: 'pl-took', type: 'stat', props: { label: 'Took', value: '{/stats/took}' } },
    { id: 'pl-reads', type: 'stat', props: { label: 'Source reads', value: '{/stats/reads}' } },
    { id: 'pl-checks', type: 'stat', props: { label: 'Check findings', value: '{/stats/findings}', tone: '{/stats/findingTone}' } },
    { id: 'pl-tabs', type: 'tabs', children: ['pl-runs', 'pl-findings', 'pl-receipts', 'pl-method'] },
    { id: 'pl-runs', type: 'section', props: { title: 'Refreshes' }, children: [snap.runs.length ? 'pl-run-table' : 'pl-no-runs'] },
    snap.runs.length
      ? { id: 'pl-run-table', type: 'table', props: { rows: '{/runs}', columns: [{ key: 'when', label: 'Started' }, { key: 'status', label: 'Result' }, { key: 'listings', label: 'Listings', align: 'end' }, { key: 'events', label: 'Changes', align: 'end' }, { key: 'note', label: 'Note' }], pageSize: 10 } }
      : { id: 'pl-no-runs', type: 'text', props: { content: 'No refresh yet.', variant: 'caption' } },
    { id: 'pl-findings', type: 'section', props: { title: 'Checks', description: 'Findings of the last refresh. A failed check keeps the previous snapshot; a warning is applied and listed here.' }, children: [snap.findings.length ? 'pl-finding-table' : 'pl-no-findings'] },
    snap.findings.length
      ? { id: 'pl-finding-table', type: 'table', props: { rows: '{/findings}', columns: [{ key: 'level', label: 'Level' }, { key: 'check', label: 'Check' }, { key: 'message', label: 'Finding' }] } }
      : { id: 'pl-no-findings', type: 'text', props: { content: latest ? 'Every check passed.' : 'No refresh yet.', variant: 'caption' } },
    { id: 'pl-receipts', type: 'section', props: { title: 'Reads', description: 'Each read of the last refresh, through the Web pages integration.' }, children: [snap.receipts.length ? 'pl-receipt-table' : 'pl-no-receipts'] },
    snap.receipts.length
      ? { id: 'pl-receipt-table', type: 'table', props: { rows: '{/receipts}', columns: [{ key: 'what', label: 'Table' }, { key: 'url', label: 'Address' }, { key: 'pages', label: 'Pages', align: 'end' }, { key: 'rows', label: 'Rows', align: 'end' }, { key: 'took', label: 'Took', align: 'end' }, { key: 'status', label: 'Result' }] } }
      : { id: 'pl-no-receipts', type: 'text', props: { content: 'No reads yet. If a read is blocked, review Access in the app header.', variant: 'caption' } },
    { id: 'pl-method', type: 'section', props: { title: 'Method' }, children: ['pl-accordion'] },
    { id: 'pl-accordion', type: 'accordion', props: { items: [
      { title: 'Source', body: `Prices, limits and capabilities of every provider's listing come from the open model catalog at ${SOURCE}, which its contributors keep up to date. Model facts, licences and benchmark scores with their sources come from the same catalog's model list. Each document is read as a table, a page at a time, and every value is checked for its type before it is stored.` },
      { title: 'One model, one entry', body: 'A listing is matched to its underlying model by the catalog\'s own canonical id when it gives one. Otherwise its name and id are reduced to letters and digits and must equal a model\'s exactly; a spelling two models share matches neither, and nothing is matched by similarity.' },
      { title: 'Checks', body: 'A refresh fails its checks, and keeps the previous snapshot, when more than 1 in 100 rows are malformed, when listings or models fall by more than half, when fewer than half the listings match a model, when a listing appears twice, or when the source is nearly empty. Contexts over 10 million tokens, prices over 1,000 USD per million tokens and unmatched listings are applied and listed as warnings.' },
      { title: 'Changes and price history', body: 'Each applied refresh is compared with the snapshot before it, field by field, and every difference becomes a change event. Prices are kept as spans: a span opens when a listing\'s prices change and closes when they change again or the listing leaves, so the history is complete and never pruned.' },
      { title: 'Storage', body: 'Everything lives in this app\'s DuckDB database on this computer. A refresh is applied in one transaction or not at all. The app makes no model requests.' },
    ] } },
  ];
  const failures = snap.findings.filter((f) => f.level === 'fail').length;
  const tone = !latest ? 'neutral' : latest.status === 'failed' ? 'danger' : latest.status === 'blocked' ? 'warning' : 'success';
  const data: Record<string, unknown> = {
    stats: {
      status: latest ? STATUS[String(latest.status)] ?? String(latest.status) : 'None yet', when: latest ? when(latest.started_at) : 'Use Refresh in the header', tone,
      took: latest ? seconds(latest.started_at, latest.finished_at) : '—', reads: String(snap.receipts.reduce((n, r) => n + int(r.pages), 0)),
      findings: String(snap.findings.length), findingTone: failures ? 'danger' : snap.findings.length ? 'warning' : 'neutral',
    },
    ...(snap.runs.length ? { runs: snap.runs.map((r) => ({ when: when(r.started_at), status: STATUS[String(r.status)] ?? String(r.status), listings: r.listings === null ? '—' : whole(int(r.listings)), events: whole(int(r.events)), note: String(r.note ?? '') })) } : {}),
    ...(snap.findings.length ? { findings: snap.findings.map((f) => ({ level: f.level === 'fail' ? 'Failed' : 'Warning', check: String(f.check_id), message: String(f.message) })) } : {}),
    ...(snap.receipts.length ? { receipts: snap.receipts.map((r) => ({ what: String(r.what), url: String(r.url), pages: whole(int(r.pages)), rows: `${whole(int(r.rows))} of ${whole(int(r.total))}`, took: `${(int(r.ms) / 1000).toFixed(1)} s`, status: String(r.status) })) } : {}),
  };
  return { surface: 'pipeline', nodes, data: replace(data) };
}

export function view(state: unknown, loaded: Loaded = NOTHING): Update[] {
  const s = normalize(state), w = workload(s.workload);
  return [overview(loaded.snap, loaded.models, w), modelsView(loaded, s), costs(loaded, s), compare(loaded, s), benchmarksView(loaded, s), changes(s, loaded.snap), pipeline(loaded.snap)];
}

/** A price per million tokens the way the original wrote it: cents for small, two places for large. */
export function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '$0';
  if (v < 0.01) return `$${v.toPrecision(2)}`;
  return `$${v < 1 ? Number(v.toFixed(3)) : Number(v.toFixed(2))}`;
}
const times = (r: number | null) => (r === null ? '—' : `${r >= 10 ? Math.round(r) : r.toFixed(1)}x`);
/** 128,000 tokens as "128K", 1,048,576 as "1.05M". */
export function tokens(n: unknown): string {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1_000_000) return `${Number((v / 1_000_000).toFixed(2))}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(v);
}

/** The sentence a buyer needs (the original's summary): what to buy, against the lab, and the catch. */
export function sentence(d: ModelDetail): string {
  if (!d.comparable) return d.kind ? `${d.name} is ${/^[aeiou]/i.test(d.kind) ? 'an' : 'a'} ${d.kind} model, so its prices are listed but not compared with language models.` : `Providers bill ${d.name} in other units than text tokens (images, audio or video), so its prices are listed but not compared.`;
  const parts = [d.priced === d.providers ? `${d.providers} providers list ${d.name}.` : `${d.priced} of ${d.providers} providers publish a price for ${d.name}.`];
  if (!d.priced) return `${d.providers} providers list ${d.name}; none publishes a price.`;
  const pickName = d.pick_provider ?? d.low_provider;
  if (pickName && d.pick_rate !== null) {
    const price = `${money(d.pick_input)} in and ${money(d.pick_output)} out per million tokens`;
    const saving = d.own_rate && d.own_provider !== pickName ? Math.round((1 - d.pick_rate / d.own_rate) * 100) : 0;
    parts.push(saving > 0 ? `The cheapest full-context offer is ${pickName} at ${price}, ${saving}% below ${d.own_provider}'s own price.` : `The cheapest full-context offer is ${pickName} at ${price}.`);
  } else parts.push('No offer carries the full context.');
  const passedOver = d.low_provider && d.low_rate !== null && d.pick_rate !== null && d.low_rate < d.pick_rate;
  if (passedOver && d.low_fits === false) parts.push(`${d.low_provider} lists lower but caps context at ${tokens(d.low_context)}.`);
  else if (passedOver && d.low_status) parts.push(`${d.low_provider} lists lower on a ${d.low_status} offer.`);
  else if (passedOver) parts.push(`${d.low_provider} lists lower, but no other provider comes within ${CORROBORATION}x of that price.`);
  else if ((spread(d) ?? 0) >= 1.5) parts.push(`Prices span ${times(spread(d))} for the same model.`);
  if (d.outliers) parts.push(`${d.outliers} price${d.outliers === 1 ? '' : 's'} more than ${OUTLIER_FACTOR}x from the middle ${d.outliers === 1 ? 'is' : 'are'} set aside as likely errors.`);
  return parts.join(' ');
}

function note(o: Offer): string {
  const n: string[] = [];
  if (o.first_party) n.push("Lab's own");
  if (o.rate === null) n.push('No published price');
  else if (!o.comparable) n.push('Not a language-model offer; not compared');
  else if (!o.kept) n.push('Set aside: far from the middle price');
  else if (!o.confirmed) n.push(`Unconfirmed: no other provider within ${CORROBORATION}x`);
  if (!o.fits) n.push('Smaller context');
  if (o.status) n.push(o.status === 'alpha' ? 'Alpha' : 'Beta');
  return n.join('; ') || '—';
}

function modelsView(l: Loaded, s: State): Update {
  const w = workload(s.workload);
  const open = l.open, d = open?.detail;
  const withOwn = l.models.filter((m) => m.own_rate !== null).length;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: [l.models.length ? 'md-work' : 'md-none'] },
  ];
  if (!l.models.length) {
    nodes.push({ id: 'md-none', type: 'text', props: { content: 'No models yet. Use Refresh in the app header to read the catalog.', variant: 'caption' } });
    return { surface: 'models', nodes, data: replace({}) };
  }
  nodes.push(
    { id: 'md-work', type: 'split', props: { ratio: '1:2', gap: 'lg' }, children: ['md-browse', d ? 'md-open' : 'md-pick'] },
    { id: 'md-browse', type: 'stack', props: { gap: 'sm' }, children: ['md-count', 'md-list'] },
    { id: 'md-count', type: 'text', props: { content: '{/count}', variant: 'caption' } },
    { id: 'md-list', type: 'grid', props: { columns: 1, gap: 'sm', searchable: true, pageSize: 15 }, children: { each: '/models', template: 'md-card' } },
    { id: 'md-card', type: 'card', props: { title: '{name}', subtitle: '{line}', badge: '{badge}', layout: 'row', titleLines: 2, action: 'open_model', payload: { id: '{id}' }, actionLabel: 'Open' } },
  );
  if (!d) nodes.push({ id: 'md-pick', type: 'text', props: { content: 'Choose a model to see every provider\'s offer, the lab\'s own price and its benchmark scores.', variant: 'caption' } });
  else {
    const charted = open!.history.length >= 2;
    const comparing = s.compare!.includes(d.id), full = s.compare!.length >= MAX_COMPARED;
    nodes.push(
      { id: 'md-open', type: 'section', props: { title: d.name, description: '{/open/about}' }, children: ['md-stats', 'md-sentence', 'md-compare', 'md-tabs'] },
      { id: 'md-stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: ['md-providers', 'md-pick-stat', 'md-own', 'md-context'] },
      { id: 'md-providers', type: 'stat', props: { label: 'Providers', value: '{/open/providers}', caption: '{/open/priced}' } },
      { id: 'md-pick-stat', type: 'stat', props: { label: 'Best full-context offer', value: '{/open/pick}', caption: '{/open/pickBy}' } },
      { id: 'md-own', type: 'stat', props: { label: "The lab's own price", value: '{/open/own}', caption: '{/open/ownBy}' } },
      { id: 'md-context', type: 'stat', props: { label: 'Context', value: '{/open/context}', caption: '{/open/output}' } },
      { id: 'md-sentence', type: 'text', props: { content: '{/open/sentence}' } },
      comparing
        ? { id: 'md-compare', type: 'button', props: { label: 'Remove from Compare', action: 'compare_remove', payload: { id: d.id }, style: 'secondary' } }
        : full
          ? { id: 'md-compare', type: 'text', props: { content: `Compare holds ${MAX_COMPARED} models; remove one there to add this one.`, variant: 'caption' } }
          : { id: 'md-compare', type: 'button', props: { label: 'Add to Compare', action: 'compare_add', payload: { id: d.id }, style: 'secondary' } },
      ...tabbed('md-tabs', [
        ['Offers', ['md-offers']],
        ['History', ['md-history-note', ...(charted ? ['md-history'] : []), ...(open!.spans.length ? ['md-export'] : [])]],
        [`Changes (${open!.events.length})`, open!.events.length ? ['md-changes'] : []],
        [`Benchmarks (${open!.scores.length})`, open!.scores.length ? ['md-scores'] : []],
      ]),
      { id: 'md-offers', type: 'table', props: { rows: '{/open/offers}', columns: [{ key: 'provider', label: 'Provider' }, { key: 'input', label: 'Input', align: 'end' }, { key: 'output', label: 'Output', align: 'end' }, { key: 'cache', label: 'Cache read', align: 'end' }, { key: 'context', label: 'Context', align: 'end' }, { key: 'chat', label: 'Chat price', align: 'end' }, { key: 'note', label: 'Note' }], searchable: true, sortable: true, pageSize: 15 } },
      { id: 'md-history-note', type: 'text', props: { content: '{/open/historyNote}', variant: 'caption' } },
      ...(charted ? [{ id: 'md-history', type: 'chart', props: { kind: 'line', xScale: 'time', yScale: 'auto', missing: 'gap', labels: '{/open/days}', series: '{/open/series}', yLabel: 'US dollars per million tokens', height: 'md' } }] : []),
      ...(open!.spans.length ? [{ id: 'md-export', type: 'button', props: { label: 'Export price history', action: 'file.save', payload: { name: '{/open/file}', text: '/open/csv' }, style: 'link' } }] : []),
      ...(open!.events.length ? [{ id: 'md-changes', type: 'table', props: { rows: '{/open/events}', columns: [{ key: 'day', label: 'Day' }, { key: 'type', label: 'Change' }, { key: 'provider', label: 'Provider' }, { key: 'change', label: 'What changed' }], searchable: true, pageSize: 15 } }] : []),
    );
    if (open!.scores.length) nodes.push({ id: 'md-scores', type: 'table', props: { rows: '{/open/scores}', columns: [{ key: 'name', label: 'Benchmark' }, { key: 'score', label: 'Score', align: 'end' }, { key: 'metric', label: 'Measure' }, { key: 'kind', label: 'Published by' }, { key: 'date', label: 'Date' }, { key: 'source', label: 'Source' }] } });
  }
  const data: Record<string, unknown> = {
    count: `${l.models.length.toLocaleString('en-US')} models; ${withOwn.toLocaleString('en-US')} sold by their own lab. Prices are US dollars per million tokens, for ${article(w)}: ${shape(w)}. Choose the request under Costs.`,
    models: l.models.map((m) => ({
      id: m.id, name: m.name,
      line: `${m.lab} · ${m.providers} provider${m.providers === 1 ? '' : 's'} · ${m.pick_rate !== null ? `from ${money(m.pick_rate)}` : m.priced ? `from ${money(m.low_rate)}` : 'no published price'}`,
      badge: m.comparable && (spread(m) ?? 0) >= 1.5 ? `${times(spread(m))} spread` : '',
    })),
  };
  if (d) {
    const f = open!.facts;
    const about = [d.lab, f?.family, f?.release_date ? `released ${f.release_date}` : null, f?.knowledge ? `knowledge to ${f.knowledge}` : null,
      f?.open_weights ? `open weights${f.license ? ` (${f.license})` : ''}` : f?.license ? `licence ${f.license}` : null].filter(Boolean).join(' · ');
    data.open = {
      about, providers: String(d.providers), priced: `${d.priced} with prices`,
      pick: money(d.pick_rate), pickBy: d.pick_provider ?? 'No full-context offer',
      own: money(d.own_rate), ownBy: d.own_provider ?? 'Not sold by the lab',
      context: tokens(d.full_context ?? f?.context), output: f?.output_limit ? `${tokens(f.output_limit)} output` : 'Output limit not published',
      sentence: sentence(d),
      offers: open!.offers.map((o) => ({ provider: o.provider_name, input: money(o.input), output: money(o.output), cache: money(o.cache_read), context: tokens(o.context), chat: money(o.rate), note: note(o) })),
      historyNote: historyNote(open!.history, w),
      ...(open!.history.length >= 2 ? { days: open!.history.map((p) => p.day), series: [{ name: 'Cheapest confirmed', values: open!.history.map((p) => p.best) }, { name: "The lab's own", values: open!.history.map((p) => p.own) }] } : {}),
      ...(open!.spans.length ? { file: `model-desk-${d.id.replace(/[^A-Za-z0-9]+/g, '-')}-prices`, csv: spansCsv(open!.spans) } : {}),
      ...(open!.events.length ? { events: eventRows(open!.events) } : {}),
      ...(open!.scores.length ? { scores: open!.scores.map((x) => ({ name: x.name, score: String(x.score), metric: x.metric ?? '—', kind: kindOf(x.provenance, x.publisher), date: x.date ?? '—', source: x.source ?? '—' })) } : {}),
    };
  }
  return { surface: 'models', nodes, data: replace(data) };
}

function tabbed(id: string, panels: [string, string[]][]): Node[] {
  const live = panels.filter(([, children]) => children.length);
  const pid = (title: string) => `${id}-${title.toLowerCase().replace(/\s*\(\d+\)$/, '').replace(/[^a-z0-9]+/g, '-')}`;
  return [{ id, type: 'tabs', children: live.map(([t]) => pid(t)) }, ...live.map(([t, children]) => ({ id: pid(t), type: 'section', props: { title: t }, children }))];
}

/** What the history shows and from when, in words. */
export function historyNote(points: { day: string; best: number | null; own: number | null }[], w: Workload = WORKLOADS[0]!): string {
  if (!points.length) return 'No price history yet: it starts with the first refresh.';
  const first = points[0]!, last = points.at(-1)!;
  const span = points.length === 1 ? `one day, ${first.day}` : `${points.length} days, ${first.day} to ${last.day}`;
  const move = points.length >= 2 && first.best !== null && last.best !== null && first.best > 0
    ? ` The cheapest confirmed price went from ${money(first.best)} to ${money(last.best)}${last.best === first.best ? ', unchanged' : `, ${last.best < first.best ? 'down' : 'up'} ${Math.round(Math.abs(last.best / first.best - 1) * 100)}%`}.` : '';
  const chart = points.length < 2 ? ' A chart appears from the second day.' : '';
  return `Prices for ${article(w)} at each day's last refresh, over ${span}.${move}${chart} The export holds every price span with its dates.`;
}

const CSV_HEAD = ['provider', 'model', 'from', 'to', 'input', 'output', 'cache_read', 'cache_write', 'reasoning', 'context_tiers'];
/** A cell a spreadsheet reads as text: quoted when needed, and never as a formula. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let t = String(v);
  if (/^[=+\-@\t\r]/.test(t) && typeof v !== 'number') t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
/** Every price span as CSV, prices in US dollars per million tokens, times in UTC. */
export function spansCsv(rows: Span[]): string {
  return [CSV_HEAD.join(','), ...rows.map((r) => [r.provider, r.model, r.valid_from, r.valid_to, r.input, r.output, r.cache_read, r.cache_write, r.reasoning_price, r.tiers].map(cell).join(','))].join('\n') + '\n';
}

/** "a chat request", "an agentic request": how a price's workload reads in a sentence. */
export const article = (w: Workload) => `${/^[aeiou]/i.test(w.name) ? 'an' : 'a'} ${w.name.toLowerCase()} request`;
/** "1,500 tokens in (20% from cache), 500 out": a request's shape in words. */
export function shape(w: Workload): string {
  const parts = [`${w.inputTokens.toLocaleString('en-US')} tokens in${w.cacheHitRate ? ` (${Math.round(w.cacheHitRate * 100)}% from cache)` : ''}`, `${w.outputTokens.toLocaleString('en-US')} out`];
  if (w.reasoningTokens) parts.push(`${w.reasoningTokens.toLocaleString('en-US')} reasoning`);
  return `${parts.join(', ')}, within a ${tokens(w.contextTokens)} context`;
}
/** A bill in US dollars: whole dollars once it is large, cents below. */
export function dollars(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (v >= 100) return `$${Math.round(v).toLocaleString('en-US')}`;
  if (v >= 0.01) return `$${v.toFixed(2)}`;
  return v === 0 ? '$0' : `$${v.toPrecision(2)}`;
}
const volumeLabel = (n: number) => (n >= 1_000_000 ? `${n / 1_000_000}M` : `${n / 1_000}K`);

/** Every model's monthly bill for the chosen request and volume, at its best full-context offer (the original's calculator). */
function costs(l: Loaded, s: State): Update {
  const w = workload(s.workload), volume = s.volume!;
  const perRequest = (rate: number) => (rate * billable(w)) / 1_000_000;
  const priced = l.models.filter((m) => m.comparable && m.pick_rate !== null);
  // A model whose full context cannot hold the request has no price for it, however cheap.
  const fits = (m: ModelRow) => m.full_context === null || Number(m.full_context) >= w.contextTokens;
  const small = priced.filter((m) => !fits(m)).length;
  const rows = priced.filter(fits)
    .map((m) => ({ m, request: perRequest(m.pick_rate!) }))
    .sort((a, b) => a.request - b.request || a.m.name.localeCompare(b.m.name));
  const tiered = rows.filter((r) => r.m.pick_tier !== null).length;
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['co-request', 'co-volume', 'co-shape', rows.length ? 'co-table' : 'co-none'] },
    { id: 'co-request', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: WORKLOADS.map((x) => `co-w-${x.id}`) },
    ...WORKLOADS.map((x) => ({ id: `co-w-${x.id}`, type: 'button', props: { label: x.name, action: 'set_workload', payload: { id: x.id }, style: x.id === w.id ? 'primary' : 'secondary' } })),
    { id: 'co-volume', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: VOLUMES.map((v) => `co-v-${v}`) },
    ...VOLUMES.map((v) => ({ id: `co-v-${v}`, type: 'button', props: { label: `${volumeLabel(v)} a month`, action: 'set_volume', payload: { volume: v }, style: v === volume ? 'primary' : 'secondary' } })),
    { id: 'co-shape', type: 'text', props: { content: '{/shape}', variant: 'caption' } },
    rows.length
      ? { id: 'co-table', type: 'table', props: { rows: '{/rows}', columns: [{ key: 'name', label: 'Model' }, { key: 'lab', label: 'Lab' }, { key: 'provider', label: 'Best full-context offer' }, { key: 'request', label: 'Per request', align: 'end' }, { key: 'month', label: 'Per month', align: 'end' }, { key: 'rate', label: 'Per million tokens', align: 'end' }, { key: 'note', label: 'Note' }], searchable: true, sortable: true, pageSize: 20 } }
      : { id: 'co-none', type: 'text', props: { content: '{/none}', variant: 'caption' } },
  ];
  const data = {
    shape: `${w.name}: ${w.description} ${shape(w)}, ${Math.round(w.cacheWriteRate * 100)}% written to cache. ${volumeLabel(volume)} requests a month, at each model's best full-context offer${tiered ? `; ${tiered} of these prices come from a context price tier` : ''}.${small ? ` ${small} models whose context is smaller than ${tokens(w.contextTokens)} are left out.` : ''}`,
    ...(rows.length ? {} : { none: priced.length ? `No priced model's context holds ${article(w)} of ${tokens(w.contextTokens)}.` : 'No priced models yet. Use Refresh in the app header to read the catalog.' }),
    ...(rows.length ? { rows: rows.map(({ m, request }) => ({ name: m.name, lab: m.lab, provider: m.pick_provider ?? '—', request: dollars(request), month: dollars(request * volume), rate: money(m.pick_rate), note: m.pick_tier !== null ? `${tokens(m.pick_tier)}+ context price` : '—' })) } : {}),
  };
  return { surface: 'costs', nodes, data: replace(data) };
}

const yes = (v: boolean | null | undefined) => (v === true ? 'Yes' : v === false ? 'No' : '—');
/** Up to four models side by side: price for the chosen request, limits, capabilities and shared benchmarks. */
function compare(l: Loaded, s: State): Update {
  const w = workload(s.workload), volume = s.volume!, cs = l.compared;
  if (!cs.length) return { surface: 'compare', nodes: [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['cp-none'] },
    { id: 'cp-none', type: 'text', props: { content: `Open a model under Models and choose Add to Compare. Up to ${MAX_COMPARED} models fit side by side.`, variant: 'caption' } },
  ], data: replace({}) };
  const key = (i: number) => `m${i}`;
  const row = (label: string, f: (c: Compared) => string) => ({ label, ...Object.fromEntries(cs.map((c, i) => [key(i), f(c)])) });
  const holds = (c: Compared) => c.detail.full_context === null || Number(c.detail.full_context) >= w.contextTokens;
  const perMonth = (c: Compared) => (!holds(c) ? `Context under ${tokens(w.contextTokens)}` : c.detail.pick_rate === null ? '—' : dollars((c.detail.pick_rate * billable(w)) / 1_000_000 * volume));
  const scoreNames = [...new Set(cs.flatMap((c) => c.scores.map((x) => x.name)))].slice(0, 20);
  const rows = [
    row('Lab', (c) => c.detail.lab),
    row('Providers', (c) => `${c.detail.providers} (${c.detail.priced} priced)`),
    row('Best full-context offer', (c) => c.detail.pick_provider ?? '—'),
    row(`Price, ${w.name.toLowerCase()} request`, (c) => money(c.detail.pick_rate)),
    row(`Per month, ${volumeLabel(volume)} requests`, perMonth),
    row("The lab's own price", (c) => money(c.detail.own_rate)),
    row('Context', (c) => tokens(c.detail.full_context ?? c.facts?.context)),
    row('Output limit', (c) => tokens(c.facts?.output_limit)),
    row('Reasoning', (c) => yes(c.abilities.reasoning)),
    row('Tool calls', (c) => yes(c.abilities.tool_call)),
    row('Structured output', (c) => yes(c.abilities.structured_output)),
    row('Attachments', (c) => yes(c.abilities.attachment)),
    row('Open weights', (c) => yes(c.facts?.open_weights)),
    row('Licence', (c) => c.facts?.license ?? '—'),
    row('Released', (c) => c.facts?.release_date ?? '—'),
    row('Knowledge to', (c) => c.facts?.knowledge ?? '—'),
    ...scoreNames.map((name) => row(name, (c) => { const x = c.scores.find((y) => y.name === name); return x ? `${x.score}${x.metric ? ` ${x.metric}` : ''}` : '—'; })),
  ];
  const nodes: Node[] = [
    { id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: ['cp-caption', 'cp-table', 'cp-remove'] },
    { id: 'cp-caption', type: 'text', props: { content: '{/caption}', variant: 'caption' } },
    { id: 'cp-table', type: 'table', props: { rows: '{/rows}', columns: [{ key: 'label', label: '' }, ...cs.map((c, i) => ({ key: key(i), label: c.detail.name }))] } },
    { id: 'cp-remove', type: 'stack', props: { direction: 'horizontal', gap: 'sm', wrap: true }, children: cs.map((c, i) => `cp-remove-${i}`) },
    ...cs.map((c, i) => ({ id: `cp-remove-${i}`, type: 'button', props: { label: `Remove ${c.detail.name}`, action: 'compare_remove', payload: { id: c.detail.id }, style: 'secondary' } })),
  ];
  const data = {
    caption: `Prices are US dollars per million tokens for ${article(w)}, at each model's best full-context offer; change the request and volume under Costs.${scoreNames.length ? ' Benchmark scores are as each lab or evaluator published them.' : ''}`,
    rows,
  };
  return { surface: 'compare', nodes, data: replace(data) };
}

/** "Independent: scale.com" — who published a score, in words. */
export function kindOf(p: string, publisher: string | null): string {
  const label = PROVENANCE_LABEL[p as Provenance] ?? PROVENANCE_LABEL.unclassified;
  return publisher ? `${label}: ${publisher}` : label;
}
const boardTitle = (b: { name: string; measure: string }) => (b.measure ? `${b.name} (${b.measure})` : b.name);

export interface Ranked { entry: Entry; perRun: number | null; perDollar: number | null }
/**
 * Points per dollar on a board, for the chosen request at each model's best full-context offer.
 * Only independently measured scores are ranked: a lab's figure for its own model is shown,
 * labelled, never ranked against a measurement.
 */
export function valued(entries: Entry[], models: ModelRow[], w: Workload): Ranked[] {
  const price = new Map(models.filter((m) => m.comparable && m.pick_rate !== null).map((m) => [m.id, m.pick_rate!]));
  return entries.map((entry) => {
    const rate = price.get(entry.model);
    const perRun = rate === undefined ? null : (rate * billable(w)) / 1_000_000;
    return { entry, perRun, perDollar: entry.provenance === 'independent' && perRun ? entry.score / perRun : null };
  });
}

function benchmarksView(l: Loaded, s: State): Update {
  const w = workload(s.workload);
  const ranked = l.boards.filter((b) => b.independent >= MIN_RANKED).length;
  const open = s.board ? l.boards.find((b) => b.slug === s.board!.slug && b.measure === s.board!.measure) : undefined;
  const nodes: Node[] = [{ id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children: [l.boards.length ? 'bm-work' : 'bm-none'] }];
  if (!l.boards.length) {
    nodes.push({ id: 'bm-none', type: 'text', props: { content: 'No benchmark scores yet. Use Refresh in the app header to read the catalog.', variant: 'caption' } });
    return { surface: 'benchmarks', nodes, data: replace({}) };
  }
  nodes.push(
    { id: 'bm-work', type: 'split', props: { ratio: '1:2', gap: 'lg' }, children: ['bm-browse', open ? 'bm-open' : 'bm-pick'] },
    { id: 'bm-browse', type: 'stack', props: { gap: 'sm' }, children: ['bm-count', 'bm-list'] },
    { id: 'bm-count', type: 'text', props: { content: '{/count}', variant: 'caption' } },
    { id: 'bm-list', type: 'grid', props: { columns: 1, gap: 'sm', searchable: true, pageSize: 15 }, children: { each: '/boards', template: 'bm-card' } },
    { id: 'bm-card', type: 'card', props: { title: '{title}', subtitle: '{line}', badge: '{badge}', layout: 'row', titleLines: 2, action: 'open_board', payload: { slug: '{slug}', measure: '{measure}' }, actionLabel: 'Open' } },
  );
  const data: Record<string, unknown> = {
    count: `${l.boards.length} benchmarks, ${ranked} with at least ${MIN_RANKED} independently measured models. Only independent scores are ranked; a lab's figures for its own model are shown and labelled.`,
    boards: l.boards.map((b) => ({ slug: b.slug, measure: b.measure, title: boardTitle(b), line: `${b.models} model${b.models === 1 ? '' : 's'}, ${b.independent} measured independently`, badge: b.independent >= MIN_RANKED ? 'Ranked' : '' })),
  };
  if (!open) {
    nodes.push({ id: 'bm-pick', type: 'text', props: { content: 'Choose a benchmark to see every score, who published it, and what a point costs.', variant: 'caption' } });
    return { surface: 'benchmarks', nodes, data: replace(data) };
  }
  const rows = valued(l.board, l.models, w);
  const leaders = open.independent >= MIN_RANKED ? rows.filter((r) => r.perDollar !== null).sort((a, b) => b.perDollar! - a.perDollar! || a.entry.model_name.localeCompare(b.entry.model_name)).slice(0, 5) : [];
  const kinds = [...new Set(l.board.map((e) => e.provenance))].sort();
  nodes.push(
    { id: 'bm-open', type: 'section', props: { title: boardTitle(open), description: '{/board/about}' }, children: [...(leaders.length ? ['bm-leaders'] : ['bm-unranked']), 'bm-entries', 'bm-kinds'] },
    leaders.length
      ? { id: 'bm-leaders', type: 'table', props: { rows: '{/board/leaders}', columns: [{ key: 'rank', label: '', align: 'end' }, { key: 'model', label: 'Best value, independently measured' }, { key: 'score', label: 'Score', align: 'end' }, { key: 'run', label: 'Cost per request', align: 'end' }, { key: 'points', label: 'Points per dollar', align: 'end' }] } }
      : { id: 'bm-unranked', type: 'text', props: { content: '{/board/unranked}', variant: 'caption' } },
    { id: 'bm-entries', type: 'table', props: { rows: '{/board/entries}', columns: [{ key: 'model', label: 'Model' }, { key: 'score', label: 'Score', align: 'end' }, { key: 'kind', label: 'Published by' }, { key: 'run', label: 'Cost per request', align: 'end' }, { key: 'points', label: 'Points per dollar', align: 'end' }, { key: 'date', label: 'Date' }, { key: 'source', label: 'Source' }], searchable: true, sortable: true, pageSize: 15 } },
    { id: 'bm-kinds', type: 'accordion', props: { items: '{/board/kinds}' } },
  );
  const points = (n: number | null) => (n === null ? '—' : n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1));
  data.board = {
    about: `${open.models} models, ${open.independent} measured independently. Cost per request is for ${article(w)} at each model's best full-context offer; choose the request under Costs.`,
    ...(leaders.length ? { leaders: leaders.map((r, i) => ({ rank: String(i + 1), model: r.entry.model_name, score: String(r.entry.score), run: dollars(r.perRun), points: points(r.perDollar) })) }
      : { unranked: `Not ranked: fewer than ${MIN_RANKED} models on this benchmark were measured independently, and figures from labs and sellers are not ranked against each other.` }),
    entries: rows.map((r) => ({ model: r.entry.model_name, score: String(r.entry.score), kind: kindOf(r.entry.provenance, r.entry.publisher), run: dollars(r.perRun), points: points(r.perDollar), date: r.entry.date ?? '—', source: r.entry.source ?? '—' })),
    kinds: kinds.map((k) => ({ title: PROVENANCE_LABEL[k as Provenance] ?? k, body: PROVENANCE_NOTE[k as Provenance] ?? '' })),
  };
  return { surface: 'benchmarks', nodes, data: replace(data) };
}
