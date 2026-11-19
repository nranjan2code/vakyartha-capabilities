// Who published a benchmark score, read from the catalog itself. A number a lab published about
// its own model and one a third party measured are different claims: only the second is ranked.
//
// No list of evaluators, labs or sellers is kept. A score's publisher is its source's host, or,
// on a hosting site (a host whose folders each publish only one lab's models), the host and
// folder. The catalog then says who that publisher is: a lab's own sites are the domains of
// providers that sell only that lab's models, of the lab's own provider, and hosts named after the
// lab; a seller is a provider of several labs' models; an evaluator is a publisher that scores
// models of several labs and is neither. Anything the data cannot place stays unclassified, and is
// shown but not ranked.

export type Provenance = 'independent' | 'vendor' | 'rival' | 'aggregator' | 'unclassified' | 'unknown';

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  independent: 'Independent', vendor: 'Self-reported', rival: 'Another lab', aggregator: 'Marketplace', unclassified: 'Unclassified', unknown: 'Unsourced',
};
export const PROVENANCE_NOTE: Record<Provenance, string> = {
  independent: 'Published by a source that scores models of several labs and is neither a lab nor a seller.',
  vendor: "Published by the model's own lab: a claim, not a measurement.",
  rival: "Published by another lab, in its own comparison: an interested party's figure.",
  aggregator: "Published on the site of a seller of many labs' models, usually from the lab's own figures.",
  unclassified: 'A source is given, but the catalog does not say who published it.',
  unknown: 'No source is given.',
};

/** Labs that score three or more labs' models make a publisher an evaluator. */
const EVALUATOR_LABS = 3;
/** A host with at least this many single-lab folders is a hosting site, read folder by folder. */
const HOSTING_FOLDERS = 3;

interface Url { host: string; folder: string }
function parse(url: string | null | undefined): Url | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { host: u.hostname.toLowerCase().replace(/^www\./, ''), folder: u.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '' };
  } catch { return null; }
}
/** The domain a host belongs to: its last two labels. */
export const domainOf = (host: string) => host.split('.').slice(-2).join('.');
const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

export interface ScoreSource { model: string; source: string | null }
export interface Seller { id: string; doc: string | null; api: string | null; labs: string[] }

/** The provenance of each score, in the order given. */
export function provenance(scores: ScoreSource[], sellers: Seller[], labs: Iterable<string>): { provenance: Provenance; publisher: string | null }[] {
  const labOf = (model: string) => model.split('/')[0]!;
  // Hosting sites: many folders, each publishing one lab's models.
  const folders = new Map<string, Map<string, Set<string>>>();
  for (const s of scores) {
    const u = parse(s.source);
    if (!u) continue;
    const byFolder = folders.get(u.host) ?? new Map<string, Set<string>>();
    const set = byFolder.get(u.folder) ?? new Set<string>();
    set.add(labOf(s.model));
    byFolder.set(u.folder, set);
    folders.set(u.host, byFolder);
  }
  const hosting = new Set([...folders].filter(([, byFolder]) => byFolder.size >= HOSTING_FOLDERS && [...byFolder.values()].every((set) => set.size === 1)).map(([host]) => host));
  const publisherOf = (u: Url) => (hosting.has(u.host) ? `${u.host}/${u.folder}` : u.host);

  // Whose domain is whose. A provider of one lab's models is that lab's own service.
  const labDomains = new Map<string, Set<string>>();
  const claim = (domain: string, lab: string) => { const set = labDomains.get(domain) ?? new Set<string>(); set.add(lab); labDomains.set(domain, set); };
  const known = new Set(labs);
  for (const lab of known) {
    // A host named after the lab: its name with or without the top-level label.
    claim(`name:${squash(lab)}`, lab);
  }
  const sellerDomains = new Set<string>();
  for (const p of sellers) {
    const domains = [p.doc, p.api].map(parse).filter((u): u is Url => Boolean(u)).map((u) => domainOf(u.host));
    const own = p.labs.length === 1 ? p.labs[0]! : known.has(p.id) ? p.id : [...known].find((lab) => p.id.startsWith(`${lab}-`));
    for (const d of domains) {
      if (own && (p.labs.length === 1 || p.labs.includes(own))) claim(d, own);
      else if (p.labs.length >= 2) sellerDomains.add(d);
    }
  }
  const labsOfHost = (host: string): Set<string> => {
    const out = new Set<string>(labDomains.get(domainOf(host)) ?? []);
    for (const lab of labDomains.get(`name:${squash(domainOf(host))}`) ?? []) out.add(lab);
    for (const lab of labDomains.get(`name:${squash(domainOf(host).split('.')[0]!)}`) ?? []) out.add(lab);
    return out;
  };

  // How many labs each publisher scores.
  const reach = new Map<string, Set<string>>();
  for (const s of scores) {
    const u = parse(s.source);
    if (!u) continue;
    const key = publisherOf(u), set = reach.get(key) ?? new Set<string>();
    set.add(labOf(s.model));
    reach.set(key, set);
  }

  return scores.map((s) => {
    const u = parse(s.source);
    if (!u) return { provenance: 'unknown', publisher: null };
    const publisher = publisherOf(u), lab = labOf(s.model);
    // A seller's site first: its per-lab folders look like a hosting site's.
    if (sellerDomains.has(domainOf(u.host)) && !labsOfHost(u.host).size) return { provenance: 'aggregator', publisher: u.host };
    if (hosting.has(u.host)) {
      // A folder that publishes only this lab's models: the lab's own model page.
      const only = reach.get(publisher)!;
      return { provenance: only.size === 1 && only.has(lab) ? 'vendor' : 'unclassified', publisher };
    }
    const owners = labsOfHost(u.host);
    if (owners.has(lab)) return { provenance: 'vendor', publisher };
    if (owners.size) return { provenance: 'rival', publisher };
    if ((reach.get(publisher)?.size ?? 0) >= EVALUATOR_LABS) return { provenance: 'independent', publisher };
    return { provenance: 'unclassified', publisher };
  });
}
