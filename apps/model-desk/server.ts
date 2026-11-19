// Model Desk: the AI model market as a local data pipeline. A refresh reads the open model
// catalog as tables through the governed `web__fetch_page` tool (source.ts), matches every
// provider listing to its underlying model (identity.ts), and hands the candidate to the
// database (store.ts), which checks it and applies it in one transaction or keeps the last good
// snapshot and says why. DuckDB owns all catalog data; `context.state` holds only view choices.
// Every view is derived from one bounded database read (views.ts). No model requests are made.

import { createHash } from 'node:crypto';
import { identity } from './identity.ts';
import {
  benchmark, BENCHMARK_COLUMNS, listing, LISTING_COLUMNS, MAX_CALLS, model, MODEL_COLUMNS, MODELS_URL, PRICES_URL, provider, PROVIDER_COLUMNS, readAll,
  type Call, type Read, type Receipt,
} from './source.ts';
import { abilities, catalog, detail, history, model as about, offers, spans, workload, WORKLOADS } from './market.ts';
import { apply, failed, modelEvents, snapshot, type Database } from './store.ts';
import { MAX_COMPARED, normalize, NOTHING, TITLES, TYPES, view, VOLUMES, type Compared, type Loaded, type State } from './views.ts';

export { view, TITLES };

export interface Context {
  state: State;
  surfaces?: Record<string, unknown>;
  database: Database;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** Everything the views read, in bounded queries, priced for the chosen request: the pipeline
 * snapshot, the model list, the opened model and the compared ones. */
export async function load(db: Database, state: State): Promise<Loaded> {
  const w = workload(state.workload);
  const snap = await snapshot(db);
  const models = await catalog(db, w);
  const compared: Compared[] = [];
  for (const id of state.compare ?? []) {
    const d = await detail(db, id, w);
    if (!d) continue;
    const facts = await about(db, id);
    compared.push({ detail: d, facts: facts?.facts ?? null, abilities: await abilities(db, id), scores: facts?.scores ?? [] });
  }
  if (!state.model) return { snap, models, open: null, compared };
  const d = await detail(db, state.model, w);
  if (!d) return { snap, models, open: null, compared };
  const list = await offers(db, state.model, w), facts = await about(db, state.model);
  const past = await history(db, state.model, w), kept = await spans(db, state.model), events = await modelEvents(db, state.model);
  return { snap, models, open: { detail: d, offers: list, facts: facts?.facts ?? null, scores: facts?.scores ?? [], history: past, spans: kept, events }, compared };
}

const reason = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error:\s*/, '').slice(0, 400);

/** Reads every table the pipeline needs, within one command's 16 calls. */
export async function read(callTool: Context['callTool']) {
  const receipts: Receipt[] = [];
  let calls = 0;
  const call: Call = (name, args) => { calls++; return callTool(name, args); };
  const take = <T>(r: Read<T>) => { receipts.push(r.receipt); return r; };
  try {
    const models = take(await readAll(call, 'Models', MODELS_URL, '/*', MODEL_COLUMNS, model, 2));
    const benchmarks = take(await readAll(call, 'Benchmarks', MODELS_URL, '/*/benchmarks/*', BENCHMARK_COLUMNS, benchmark, 2));
    const providers = take(await readAll(call, 'Providers', PRICES_URL, '/*', PROVIDER_COLUMNS, provider, 2));
    const listings = take(await readAll(call, 'Listings', PRICES_URL, '/*/models/*', [...LISTING_COLUMNS], listing, MAX_CALLS - calls));
    return { ok: true as const, models, benchmarks, providers, listings, receipts };
  } catch (e) {
    return { ok: false as const, reason: reason(e), receipts };
  }
}

/**
 * The refresh, run by the daily trigger and the header's Refresh (a trigger may take minutes; a
 * clicked action has seconds, so no button runs it). Read, match, check and apply; a failed read
 * is recorded, never filled in.
 */
export async function refresh(ctx: Context): Promise<{ updates: ReturnType<typeof view> }> {
  ctx.state = normalize(ctx.state);
  const started = new Date().toISOString();
  const got = await read(ctx.callTool.bind(ctx));
  if (!got.ok) await failed(ctx.database, started, got.reason, got.receipts);
  else {
    const who = identity(got.models.rows.map((m) => ({ id: m.id, name: m.name })), got.providers.rows.map((p) => p.id));
    const listings = got.listings.rows.map((row) => ({ row, canonical: who.resolve(row[2] as string | null, row[1], row[4] as string | null) }));
    // What was read, in a stable form: the same source twice is one fingerprint.
    const fingerprint = createHash('sha256').update(JSON.stringify([got.providers.rows, got.listings.rows, got.models.rows, got.benchmarks.rows])).digest('hex');
    const dropped = got.models.dropped + got.benchmarks.dropped + got.providers.dropped + got.listings.dropped;
    const read = got.receipts.reduce((n, r) => n + r.total, 0);
    await apply(ctx.database, { providers: got.providers.rows, listings, models: got.models.rows, benchmarks: got.benchmarks.rows, receipts: got.receipts, dropped, read, fingerprint }, started);
  }
  return { updates: view(ctx.state, await load(ctx.database, ctx.state)) };
}

export async function handleAction(controlId: string, value: unknown, ctx: Context, action?: string) {
  ctx.state = normalize(ctx.state);
  switch (action) {
    case 'show_changes': {
      const type = String((value as { type?: unknown } | null)?.type ?? 'all');
      if (type !== 'all' && !Object.hasOwn(TYPES, type)) throw new Error('That kind of change is not one this desk records');
      ctx.state.type = type;
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'changes') };
    }
    case 'set_workload': {
      const id = String((value as { id?: unknown } | null)?.id ?? '');
      if (!WORKLOADS.some((w) => w.id === id)) throw new Error('That request shape is not one this desk prices');
      ctx.state.workload = id;
      // Every price follows the request: only the pipeline's own records stay as they were.
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface !== 'changes' && u.surface !== 'pipeline') };
    }
    case 'set_volume': {
      const volume = Number((value as { volume?: unknown } | null)?.volume);
      if (!VOLUMES.includes(volume)) throw new Error('Choose one of the monthly volumes shown');
      ctx.state.volume = volume;
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'costs' || u.surface === 'compare') };
    }
    case 'compare_add': case 'compare_remove': {
      const id = String((value as { id?: unknown } | null)?.id ?? '');
      const list = ctx.state.compare ?? [];
      if (action === 'compare_add') {
        if (!id || id.length > 200 || !(await detail(ctx.database, id))) throw new Error('That model is not in the current snapshot; refresh and choose again');
        if (!list.includes(id) && list.length >= MAX_COMPARED) throw new Error(`Compare holds ${MAX_COMPARED} models; remove one first`);
        ctx.state.compare = [...new Set([...list, id])];
      } else ctx.state.compare = list.filter((x) => x !== id);
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'compare' || u.surface === 'models') };
    }
    case 'open_model': {
      const id = String((value as { id?: unknown } | null)?.id ?? '');
      if (!id || id.length > 200 || !(await detail(ctx.database, id))) throw new Error('That model is not in the current snapshot; refresh and choose again');
      ctx.state.model = id;
      return { updates: view(ctx.state, await load(ctx.database, ctx.state)).filter((u) => u.surface === 'models') };
    }
    default: throw new Error(`Model Desk has no action ${action ?? controlId}`);
  }
}

export async function renderApp(context: Context) {
  context.state = normalize(context.state);
  return { updates: view(context.state, await load(context.database, context.state)) };
}

export const surfaceFile = () => view({}, NOTHING).map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));
