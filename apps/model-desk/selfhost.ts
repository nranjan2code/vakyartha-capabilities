// Self-host or pay per token? (The original's floor, with the person's own GPU.)
//
// Throughput depends on hardware, batching, quantisation and sequence length, so it is not
// modelled. What can be said is a floor: renting the fewest GPUs the weights fit on costs the
// same whether they serve one token or a billion, and paying per token has no fixed cost. So
// self-hosting cannot win until a month of per-token spend passes that rent, and even then only
// on a saturated GPU. Every figure here is a lower bound on when self-hosting could start to pay,
// never a claim that it does. GPU rent is the person's own figure: no table of products or
// prices is kept.

import type { LicenceClass } from './licence.ts';

/** The person's GPU: memory per GPU and rent per GPU-hour, in US dollars. */
export interface Gpu { memoryGb: number; usdPerHour: number }

/** One machine holds at most eight GPUs; more is a cluster. */
export const MAX_GPUS = 8;
const HOURS_PER_MONTH = 730;
/** 16-bit weights, the default without quality loss. */
const BYTES_PER_PARAMETER = 2;
/** Serving needs more than the weights (cache, activations, the server): a quarter more, which understates long contexts. */
const SERVING_OVERHEAD = 1.25;

export const memoryGb = (parameters: number) => (parameters * BYTES_PER_PARAMETER * SERVING_OVERHEAD) / 1e9;

export type Verdict = 'break-even' | 'api-only' | 'cluster' | 'set-gpu' | 'missing';
export interface Case { verdict: Verdict; memory: number | null; gpus: number | null; rent: number | null; tokens: number | null }

/**
 * The floor for one model: GPUs needed, monthly rent, and the monthly tokens at which paying per
 * token (at `perMillion` dollars a million) costs the same as the rent.
 */
export function floor(parameters: number | null, licence: LicenceClass, perMillion: number | null, gpu: Gpu | null): Case {
  const memory = parameters && parameters > 0 ? memoryGb(parameters) : null;
  if (licence === 'non-commercial') return { verdict: 'api-only', memory, gpus: null, rent: null, tokens: null };
  if (memory === null) return { verdict: 'missing', memory, gpus: null, rent: null, tokens: null };
  if (!gpu) return { verdict: 'set-gpu', memory, gpus: null, rent: null, tokens: null };
  const gpus = Math.max(1, Math.ceil(memory / gpu.memoryGb));
  if (gpus > MAX_GPUS) return { verdict: 'cluster', memory, gpus, rent: null, tokens: null };
  const rent = gpus * gpu.usdPerHour * HOURS_PER_MONTH;
  if (!perMillion || perMillion <= 0) return { verdict: 'missing', memory, gpus, rent, tokens: null };
  return { verdict: 'break-even', memory, gpus, rent, tokens: (rent / perMillion) * 1_000_000 };
}
