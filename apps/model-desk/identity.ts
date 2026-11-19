// Canonical model identity: one real model is one catalog entry.
//
// Providers name one model a dozen ways ("X 5", "X 5 (Region)", "vendor.x-5", "x-5@eu"). The
// catalog now names the underlying model itself on most offers (`canonical_model_id`), and that
// is used whenever it points at a known model. For the rest, a listing is matched to a model only
// by exact equality of reduced spellings, never by prefix or similarity, so "X 5 Pro" and "X 5"
// stay apart; a spelling two different models claim is ambiguous and matches neither.
//
// The words that name a seller rather than a model ("vendor X 5") are read from the catalog
// itself, its provider and lab ids, so no list of companies is kept here.

export interface Named { id: string; name: string | null }

/** Region, tier and deployment suffixes providers add to an otherwise identical id. */
const ID_SUFFIX_NOISE = /[@:](eu|us|global|latest|preview|stable|v\d+|[a-z]{2}-[a-z]+-\d+)$/i;
/** A leading "<label>:" or "<label> —" some gateways put before a display name. */
const NAME_LABEL_PREFIX = /^[\p{L}\p{N} .+-]{2,20}[:—|]\s*/iu;
/** Ids that name no model: router aliases and placeholders several providers share. */
const GENERIC = new Set(['auto', 'default', 'router', 'latest', 'custom', 'model', 'chat', 'base', 'unknown', 'none', 'test', 'any', 'best']);

/** The comparison form: lower case letters and digits only, in any script. */
export const reduce = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export function cleanName(name: string, sellers: ReadonlySet<string>): string {
  let s = name.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const labelled = s.replace(NAME_LABEL_PREFIX, '').trim();
  if (labelled.length >= 3) s = labelled;
  // A leading seller word goes only when a real name remains: "Seller X 5 Turbo" becomes
  // "X 5 Turbo", while a two-word name keeps both words.
  const words = s.split(' ');
  if (words.length >= 3 && sellers.has(reduce(words[0]!))) {
    const rest = words.slice(1).join(' ');
    if (reduce(rest).length >= 3) s = rest;
  }
  return s.trim();
}

/** Every spelling a listing might be known by, most trustworthy first. */
export function candidates(name: string, modelId: string, sellers: ReadonlySet<string>): string[] {
  const out: string[] = [];
  const push = (v: string) => { if (v.length >= 3 && !out.includes(v)) out.push(v); };
  push(reduce(cleanName(name, sellers)));
  push(reduce(name));
  const bare = modelId.replace(ID_SUFFIX_NOISE, '');
  const tail = bare.split('/').pop() ?? bare;
  push(reduce(tail));
  for (const part of tail.split('.')) push(reduce(part));
  push(reduce(bare));
  return out;
}

const AMBIGUOUS = Symbol('ambiguous');

/** A stable alias and its dated pin reduce alike; the shorter is the alias and keeps the spelling. */
function alias(held: string, next: string): 'held' | 'next' | null {
  const a = reduce(held), b = reduce(next);
  if (a === b || b.startsWith(a)) return 'held';
  if (a.startsWith(b)) return 'next';
  return null;
}

export interface Identity {
  /** The canonical model id of a listing, or null when it cannot be told. */
  resolve(name: string | null, modelId: string, upstream: string | null): string | null;
}

export function identity(models: Named[], sellerIds: Iterable<string>): Identity {
  const known = new Set(models.map((m) => m.id));
  const sellers = new Set<string>();
  for (const s of sellerIds) if (reduce(s).length >= 2) sellers.add(reduce(s));
  for (const m of models) sellers.add(reduce(m.id.split('/')[0]!));
  const map = new Map<string, string | typeof AMBIGUOUS>();
  const register = (slug: string, id: string) => {
    if (slug.length < 3 || GENERIC.has(slug)) return;
    const held = map.get(slug);
    if (held === undefined) { map.set(slug, id); return; }
    if (held === AMBIGUOUS || held === id) return;
    const keep = alias(held, id);
    map.set(slug, keep === 'held' ? held : keep === 'next' ? id : AMBIGUOUS);
  };
  for (const m of models) {
    if (m.name) register(reduce(cleanName(m.name, sellers)), m.id);
    register(reduce(m.id.split('/').pop() ?? m.id), m.id);
  }
  return {
    resolve(name, modelId, upstream) {
      if (upstream && known.has(upstream)) return upstream;
      const tail = (modelId.split('/').pop() ?? modelId).toLowerCase();
      if (GENERIC.has(tail) || (name && GENERIC.has(reduce(name)))) return null;
      for (const slug of candidates(name ?? '', modelId, sellers)) {
        const hit = map.get(slug);
        if (hit === AMBIGUOUS) continue;
        if (hit) return hit;
      }
      return null;
    },
  };
}
