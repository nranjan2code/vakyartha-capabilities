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
import { apply, EMPTY, failed, snapshot, type Database } from './store.ts';
import { normalize, TITLES, TYPES, view, type State } from './views.ts';

export { view, TITLES };

export interface Context {
  state: State;
  surfaces?: Record<string, unknown>;
  database: Database;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
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
  return { updates: view(ctx.state, await snapshot(ctx.database)) };
}

export async function handleAction(controlId: string, value: unknown, ctx: Context, action?: string) {
  ctx.state = normalize(ctx.state);
  switch (action) {
    case 'show_changes': {
      const type = String((value as { type?: unknown } | null)?.type ?? 'all');
      if (type !== 'all' && !Object.hasOwn(TYPES, type)) throw new Error('That kind of change is not one this desk records');
      ctx.state.type = type;
      return { updates: view(ctx.state, await snapshot(ctx.database)).filter((u) => u.surface === 'changes') };
    }
    default: throw new Error(`Model Desk has no action ${action ?? controlId}`);
  }
}

export async function renderApp(context: Context) {
  context.state = normalize(context.state);
  return { updates: view(context.state, await snapshot(context.database)) };
}

export const surfaceFile = () => view({}, EMPTY).map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));
