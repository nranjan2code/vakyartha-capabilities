// Wish Radar: your personal wishlist, price drops, rises, ratings, delivery speed
// and cross-merchant price comparisons across Indian stores (Amazon.in, Nykaa, Flipkart, brand stores).
// Stored privately in a local DuckDB price ledger with exact paise arithmetic.
// Zero paid third-party APIs, zero scraping services, 100% private.

import { generateProgramme, formatBroadcastScript } from './programme.ts';

export interface Database {
  run(sql: string, values?: (string | number | boolean | null)[]): Promise<void>;
  query(sql: string, values?: (string | number | boolean | null)[]): Promise<Record<string, unknown>[]>;
}

export interface Wish {
  id: string;
  title: string;
  category: string;
  targetPaise?: number;
  store: string;
  url?: string;
  image?: string;
  pincode?: string;
  notes?: string;
  createdAt: string;
}

export interface ObservationRow {
  id: string;
  wishId: string;
  wishTitle: string;
  recordedAt: string;
  store: string;
  pricePaise: number;
  inStock: boolean | null;
  offerNotes: string;
  rating?: number;
  ratingCount?: string;
  deliveryInfo?: string;
  pincode?: string;
}

export interface StorePriceComparison {
  store: string;
  pricePaise: number;
  inStock: boolean | null;
  recordedAt: string;
  rating?: number;
  deliveryInfo?: string;
  diffPaise: number; // diff from cheapest
}

export interface WishSummary {
  wish: Wish;
  latestPricePaise: number | null;
  previousPricePaise: number | null;
  minPricePaise: number | null;
  maxPricePaise: number | null;
  latestDate: string | null;
  inStock: boolean | null;
  latestStore: string;
  latestOffer: string;
  rating?: number;
  ratingCount?: string;
  deliveryInfo?: string;
  pincode?: string;
  status: 'target_met' | 'price_dropped' | 'price_rose' | 'stable' | 'no_data';
  statusLabel: string;
  statusTone: 'success' | 'warning' | 'danger' | 'neutral';
  savingsPaise: number;
  storeComparisons: StorePriceComparison[];
  cheapestStore?: string;
  cheapestPaise?: number;
}

export interface ChartPoint {
  date: string;
  price: number;
  target?: number;
}

export interface LedgerData {
  totalObservations: number;
  summaries: WishSummary[];
  recentObservations: ObservationRow[];
  targetMetCount: number;
  totalSavingsPaise: number;
  selectedWishSummary?: WishSummary;
  selectedChartRecords: ChartPoint[];
}

export interface ProductOption {
  asin: string;
  title: string;
  pricePaise: number;
  priceFormatted: string;
  image?: string;
  rating?: number;
  url: string;
}

export interface SupportedStore {
  id: string;
  name: string;
  domain: string;
  category: string;
  enabled: boolean;
  status: 'active' | 'configured' | 'pending';
  searchSupported: boolean;
  isCustom?: boolean;
  lastChecked?: string;
  latencyMs?: number;
  error?: string;
}

export const DEFAULT_STORES: SupportedStore[] = [
  { id: 'amazon', name: 'Amazon India', domain: 'www.amazon.in', category: 'General & Electronics', enabled: true, status: 'configured', searchSupported: true },
  { id: 'flipkart', name: 'Flipkart', domain: 'www.flipkart.com', category: 'General & Electronics', enabled: true, status: 'configured', searchSupported: false },
  { id: 'nykaa', name: 'Nykaa', domain: 'www.nykaa.com', category: 'Beauty & Personal Care', enabled: true, status: 'configured', searchSupported: false },
  { id: 'croma', name: 'Croma', domain: 'www.croma.com', category: 'Electronics & Appliances', enabled: true, status: 'configured', searchSupported: false },
  { id: 'tatacliq', name: 'Tata CLiQ', domain: 'www.tatacliq.com', category: 'Fashion & Luxury', enabled: true, status: 'configured', searchSupported: false },
  { id: 'reliancedigital', name: 'Reliance Digital', domain: 'www.reliancedigital.in', category: 'Electronics & Gadgets', enabled: true, status: 'configured', searchSupported: false },
];

export interface State {
  wishes?: Wish[];
  activeWishId?: string;
  viewMode?: 'cards' | 'table';
  mode?: 'list' | 'add' | 'record';
  editingWishId?: string;
  viewingOptionsWishId?: string;
  productOptions?: Record<string, ProductOption[]>;
  stores?: SupportedStore[];
  newStore?: {
    name?: string;
    domain?: string;
    category?: string;
  };
  pincode?: string;
  newWish?: {
    title?: string;
    targetPrice?: string;
    category?: string;
    store?: string;
    url?: string;
    image?: string;
    pincode?: string;
    notes?: string;
  };
  newRecord?: {
    wishId?: string;
    price?: string;
    store?: string;
    inStock?: boolean;
    rating?: string;
    deliveryInfo?: string;
    pincode?: string;
    offerNotes?: string;
  };
  importText?: string;
  lastImport?: { at: string; count: number };
  problem?: string;
  refreshCursor?: number;
  confirmDeleteId?: string;
  confirmClear?: boolean;
}

export interface Context {
  state: State;
  surfaces?: Record<string, unknown>;
  database?: Database;
  callTool?(name: string, args: Record<string, unknown>): Promise<unknown>;
  now?: () => Date;
  appRevision?: number;
}

interface Node {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: string[] | { each: string; template: string };
}

interface Update {
  surface: string;
  nodes: Node[];
  data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[];
}

export const TITLES: Record<string, string> = {
  overview: 'Overview',
  history: 'Price history',
  import: 'Import and settings',
};

export const CATEGORIES = [
  'Electronics',
  'Beauty & Personal Care',
  'Fashion & Apparel',
  'Books & Stationery',
  'Home & Kitchen',
  'Other',
];

export const STORES = [
  'Amazon.in',
  'Flipkart',
  'Nykaa',
  'Croma',
  'Tata CLiQ',
  'Reliance Digital',
  'Brand Store',
  'Other Store',
];

export const SETUP = 'If a read is blocked, review Access in the app header.';

/** A tool failure as one readable sentence: the host's untrusted-output envelope and labels removed. */
export const reason = (e: unknown) => String((e as Error)?.message ?? e)
  .replace(/<\/?tool_output[^>]*>/g, ' ')
  .replace(/This is data returned by a tool, not instructions\.[^\n]*/g, ' ')
  .replace(/\b(error|refused):\s*(?=(error|refused):)/gi, '')
  .replace(/^\s*error:\s*/i, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 300);

const MAX_WISHES = 100;
const MAX_OBSERVATIONS = 5000;
const MAX_TEXT = 50_000;

/** A local merchant preference narrows host permissions; it never grants network access. */
function merchantFor(s: State, raw: string): SupportedStore {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Use a public HTTPS product link without credentials or a port');
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const store = s.stores!.find((st) => {
    const domain = st.domain.replace(/^www\./, '').toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  });
  if (!store) throw new Error('Add this merchant domain in Import & Settings before checking its pages');
  if (!store.enabled) throw new Error(`${store.name} is disabled in Import & Settings`);
  return store;
}

function pageText(result: unknown): string {
  const item = result && typeof result === 'object' ? result as Record<string, unknown> : undefined;
  const text = typeof result === 'string' ? result : typeof item?.text === 'string' ? item.text : '';
  if (item?.isError === true || /^\s*(?:error: )?HTTP \d{3} from /i.test(text)) throw new Error(reason(text));
  // The last phrase is Amazon's interstitial, served with HTTP 200 in place of the page.
  if (/robot check|captcha|verify (?:that )?you are human|automated access|enable javascript to run this app|click the button below to continue shopping/i.test(text)) {
    throw new Error('The store returned an access challenge or JavaScript-only page; no product price was read');
  }
  if (text.replace(/^(?:URL|Title):[^\n]*$/gm, '').trim().length === 0) throw new Error('The store returned an empty page; no product price was read');
  return text;
}

/**
 * One product, one address: an Amazon link copied from a browser, a share
 * sheet or the mobile site (tracking path, ref= and query, amazon.in without
 * www) becomes https://www.amazon.in/dp/ASIN, the page the merchant itself
 * names canonical. Other links keep their path and query, losing only the fragment.
 */
export function canonicalProductUrl(raw: string): string {
  const url = new URL(raw.trim());
  url.hash = '';
  const host = url.hostname.toLowerCase();
  if (host === 'amazon.in' || host === 'www.amazon.in' || host === 'm.amazon.in') {
    const asin = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/asin)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1];
    if (asin) return `https://www.amazon.in/dp/${asin.toUpperCase()}`;
  }
  return url.href;
}

async function fetchMerchant(c: Context, s: State, url: string): Promise<string> {
  merchantFor(s, url);
  if (!c.callTool) throw new Error(SETUP);
  return pageText(await c.callTool('web__fetch_page', { url }));
}

/**
 * Say what happened and what still works. A refusal (403, 429, 503 or an
 * interstitial) is the store declining an automated read: it is reported as
 * that, never retried, and never stands in for a price.
 */
function checkFailure(title: string, err: unknown, kind: 'page' | 'search' = 'page'): string {
  const msg = reason(err);
  const refused = /HTTP (?:403|429|503)\b/.test(msg) || /access challenge/.test(msg);
  const next = kind === 'search'
    ? ' The store declined this automated search; no price was saved. Use Search on Amazon to find it in your browser, then Edit this wish and paste the product link; product pages are read separately. Or Record price by hand, or paste a copied deal into the deal advisor.'
    : ' The store declined this automated read; no price was saved. Record price by hand, paste a copied deal into the deal advisor, or track this wish at another merchant.';
  return `${kind === 'search' ? 'Search' : 'Price check'} failed for "${title}": ${msg}${refused ? next : ''}`;
}

// --- exact paise arithmetic --------------------------------------------------------

export function paise(value: unknown): number {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) throw new Error('Price must be a positive number');
    return Math.round(value * 100);
  }
  if (typeof value !== 'string') throw new Error('Price must be a valid INR decimal string like 1499 or 1499.50');
  const clean = value.replace(/[₹,\s]/g, '').trim();
  if (clean.startsWith('-') || clean === '0' || clean === '0.0' || clean === '0.00') {
    throw new Error('Price must be a positive number');
  }
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(clean)) throw new Error('Enter a valid positive INR price (e.g. 1499 or 1499.50)');
  const [whole, decimal = ''] = clean.split('.');
  const result = Number(whole) * 100 + Number(decimal.padEnd(2, '0').slice(0, 2));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Price must be a positive number');
  return result;
}

export function formatInr(paiseAmount: number): string {
  const rupees = paiseAmount / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paiseAmount % 100 === 0 ? 0 : 2,
  }).format(rupees);
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// --- database & data access -------------------------------------------------------

export async function initializeDb(db: Database): Promise<void> {
  await db.run(
    'CREATE TABLE IF NOT EXISTS price_observations (' +
    'id VARCHAR PRIMARY KEY, ' +
    'wish_id VARCHAR, ' +
    'recorded_at VARCHAR, ' +
    'store VARCHAR, ' +
    'price_paise BIGINT, ' +
    'in_stock BOOLEAN, ' +
    'offer_notes VARCHAR, ' +
    'rating DOUBLE, ' +
    'rating_count VARCHAR, ' +
    'delivery_info VARCHAR, ' +
    'pincode VARCHAR)'
  );
  try { await db.run('ALTER TABLE price_observations ADD COLUMN rating DOUBLE'); } catch {}
  try { await db.run('ALTER TABLE price_observations ADD COLUMN rating_count VARCHAR'); } catch {}
  try { await db.run('ALTER TABLE price_observations ADD COLUMN delivery_info VARCHAR'); } catch {}
  try { await db.run('ALTER TABLE price_observations ADD COLUMN pincode VARCHAR'); } catch {}
}

export async function load(db: Database | undefined, wishes: Wish[], activeWishId?: string): Promise<LedgerData> {
  if (!db) {
    return {
      totalObservations: 0,
      summaries: wishes.map((w) => ({
        wish: w,
        latestPricePaise: null,
        previousPricePaise: null,
        minPricePaise: null,
        maxPricePaise: null,
        latestDate: null,
        inStock: null,
        latestStore: w.store,
        latestOffer: '',
        status: 'no_data',
        statusLabel: w.url && w.url.includes('amazon.') ? 'Ready to check' : 'No checks yet',
        statusTone: 'neutral',
        savingsPaise: 0,
        storeComparisons: [],
      })),
      recentObservations: [],
      targetMetCount: 0,
      totalSavingsPaise: 0,
      selectedChartRecords: [],
    };
  }

  await initializeDb(db);
  const countRes = await db.query('SELECT count(*)::INTEGER AS n FROM price_observations');
  const totalObservations = Number(countRes[0]?.n ?? 0);

  const wishMap = new Map(wishes.map((w) => [w.id, w]));

  const rawRows = await db.query(
    'SELECT id, wish_id, recorded_at, store, price_paise::BIGINT AS price_paise, in_stock, offer_notes, rating, rating_count, delivery_info, pincode ' +
    'FROM price_observations ORDER BY recorded_at DESC, id DESC LIMIT 100'
  );

  const recentObservations: ObservationRow[] = rawRows.map((r) => {
    const wid = String(r.wish_id);
    return {
      id: String(r.id),
      wishId: wid,
      wishTitle: wishMap.get(wid)?.title ?? 'Deleted item',
      recordedAt: String(r.recorded_at),
      store: String(r.store),
      pricePaise: Number(r.price_paise),
      inStock: r.in_stock == null ? null : Boolean(r.in_stock),
      offerNotes: String(r.offer_notes ?? ''),
      rating: r.rating != null ? Number(r.rating) : undefined,
      ratingCount: r.rating_count ? String(r.rating_count) : undefined,
      deliveryInfo: r.delivery_info ? String(r.delivery_info) : undefined,
      pincode: r.pincode ? String(r.pincode) : undefined,
    };
  });

  const summaries: WishSummary[] = [];
  let targetMetCount = 0;
  let totalSavingsPaise = 0;

  for (const wish of wishes) {
    const obs = await db.query(
      'SELECT price_paise::BIGINT AS price_paise, recorded_at, store, in_stock, offer_notes, rating, rating_count, delivery_info, pincode ' +
      'FROM price_observations WHERE wish_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 2',
      [wish.id]
    );

    const agg = await db.query(
      'SELECT min(price_paise)::BIGINT AS min_p, max(price_paise)::BIGINT AS max_p ' +
      'FROM price_observations WHERE wish_id = ?',
      [wish.id]
    );

    // Multi-store comparisons: latest observation per store
    const storeRows = await db.query(
      'SELECT store, price_paise::BIGINT AS price_paise, in_stock, recorded_at, rating, delivery_info ' +
      'FROM price_observations WHERE wish_id = ? ORDER BY recorded_at DESC, id DESC',
      [wish.id]
    );

    const seenStores = new Set<string>();
    const storeComparisons: StorePriceComparison[] = [];
    let cheapestStore: string | undefined;
    let cheapestPaise = Infinity;

    for (const sr of storeRows) {
      const sName = String(sr.store);
      if (!seenStores.has(sName)) {
        seenStores.add(sName);
        const pVal = Number(sr.price_paise);
        if (pVal < cheapestPaise) {
          cheapestPaise = pVal;
          cheapestStore = sName;
        }
        storeComparisons.push({
          store: sName,
          pricePaise: pVal,
          inStock: sr.in_stock == null ? null : Boolean(sr.in_stock),
          recordedAt: String(sr.recorded_at),
          rating: sr.rating != null ? Number(sr.rating) : undefined,
          deliveryInfo: sr.delivery_info ? String(sr.delivery_info) : undefined,
          diffPaise: 0,
        });
      }
    }

    if (cheapestPaise !== Infinity) {
      for (const sc of storeComparisons) {
        sc.diffPaise = sc.pricePaise - cheapestPaise;
      }
    }

    const latest = obs[0] ? Number(obs[0].price_paise) : null;
    const previous = obs[1] ? Number(obs[1].price_paise) : null;
    const minP = agg[0]?.min_p != null ? Number(agg[0].min_p) : null;
    const maxP = agg[0]?.max_p != null ? Number(agg[0].max_p) : null;
    const latestDate = obs[0] ? String(obs[0].recorded_at) : null;
    const inStock = obs[0]?.in_stock == null ? null : Boolean(obs[0].in_stock);
    const latestStore = obs[0] ? String(obs[0].store) : wish.store;
    const latestOffer = obs[0] ? String(obs[0].offer_notes ?? '') : '';
    const rating = obs[0]?.rating != null ? Number(obs[0].rating) : undefined;
    const ratingCount = obs[0]?.rating_count ? String(obs[0].rating_count) : undefined;
    const deliveryInfo = obs[0]?.delivery_info ? String(obs[0].delivery_info) : undefined;
    const pincode = obs[0]?.pincode ? String(obs[0].pincode) : wish.pincode;

    let status: WishSummary['status'] = 'no_data';
    let statusLabel = wish.url && wish.url.includes('amazon.') ? 'Ready to check' : 'No checks yet';
    let statusTone: WishSummary['statusTone'] = 'neutral';
    let savingsPaise = 0;

    if (latest != null) {
      if (wish.targetPaise != null && latest <= wish.targetPaise) {
        status = 'target_met';
        statusLabel = 'Deal · Target met';
        statusTone = 'success';
        savingsPaise = wish.targetPaise - latest;
        targetMetCount++;
        totalSavingsPaise += savingsPaise;
      } else if (previous != null && latest < previous) {
        status = 'price_dropped';
        statusLabel = 'Price dropped';
        statusTone = 'warning';
      } else if (previous != null && latest > previous) {
        status = 'price_rose';
        statusLabel = 'Price rose';
        statusTone = 'danger';
      } else {
        status = 'stable';
        statusLabel = 'Stable';
        statusTone = 'neutral';
      }
    }

    summaries.push({
      wish,
      latestPricePaise: latest,
      previousPricePaise: previous,
      minPricePaise: minP,
      maxPricePaise: maxP,
      latestDate,
      inStock,
      latestStore,
      latestOffer,
      rating,
      ratingCount,
      deliveryInfo,
      pincode,
      status,
      statusLabel,
      statusTone,
      savingsPaise,
      storeComparisons,
      cheapestStore,
      cheapestPaise: cheapestPaise !== Infinity ? cheapestPaise : undefined,
    });
  }

  // Selected item for trend chart & deep dive
  const selectedWish = wishes.find((w) => w.id === activeWishId) ?? (activeWishId ? undefined : wishes[0]);
  const selectedWishSummary = summaries.find((sm) => sm.wish.id === selectedWish?.id);
  let selectedChartRecords: ChartPoint[] = [];

  if (selectedWish) {
    const chartRows = await db.query(
      'SELECT recorded_at, price_paise::BIGINT AS price_paise ' +
      'FROM price_observations WHERE wish_id = ? ORDER BY recorded_at ASC, id ASC LIMIT 30',
      [selectedWish.id]
    );

    selectedChartRecords = chartRows.map((r) => {
      const pt: ChartPoint = {
        date: formatShortDate(String(r.recorded_at)),
        price: Math.round((Number(r.price_paise) / 100) * 100) / 100,
      };
      if (selectedWish.targetPaise != null) {
        pt.target = Math.round((selectedWish.targetPaise / 100) * 100) / 100;
      }
      return pt;
    });
  }

  return {
    totalObservations,
    summaries,
    recentObservations,
    targetMetCount,
    totalSavingsPaise,
    selectedWishSummary,
    selectedChartRecords,
  };
}

// --- normalization -----------------------------------------------------------------

export function normalize(s: State, _now = new Date()): State {
  const wishes: Wish[] = Array.isArray(s.wishes)
    ? s.wishes.filter((w) => w && typeof w.id === 'string' && typeof w.title === 'string').slice(0, MAX_WISHES).map((w) => ({
        id: String(w.id),
        title: String(w.title).slice(0, 160),
        category: CATEGORIES.includes(String(w.category)) ? String(w.category) : 'Other',
        targetPaise: Number.isSafeInteger(Number(w.targetPaise)) && Number(w.targetPaise) > 0 ? Number(w.targetPaise) : undefined,
        store: STORES.includes(String(w.store)) ? String(w.store) : 'Amazon.in',
        url: typeof w.url === 'string' && w.url.startsWith('https://') ? w.url.slice(0, 500) : undefined,
        image: typeof w.image === 'string' && w.image.startsWith('https://') ? w.image.slice(0, 500) : undefined,
        pincode: typeof w.pincode === 'string' ? w.pincode.slice(0, 20) : undefined,
        notes: typeof w.notes === 'string' ? w.notes.slice(0, 300) : undefined,
        createdAt: typeof w.createdAt === 'string' ? w.createdAt : new Date().toISOString(),
      }))
    : [];

  const mode = s.mode === 'add' || s.mode === 'record' ? s.mode : 'list';
  const viewMode = s.viewMode === 'table' ? 'table' : 'cards';

  return {
    wishes,
    activeWishId: typeof s.activeWishId === 'string' ? s.activeWishId : undefined,
    viewMode,
    mode,
    editingWishId: typeof s.editingWishId === 'string' ? s.editingWishId : undefined,
    viewingOptionsWishId: typeof s.viewingOptionsWishId === 'string' ? s.viewingOptionsWishId : undefined,
    refreshCursor: Number.isSafeInteger(s.refreshCursor) && s.refreshCursor! >= 0 ? s.refreshCursor : 0,
    productOptions: s.productOptions && typeof s.productOptions === 'object' ? s.productOptions : {},
    stores: Array.isArray(s.stores) && s.stores.length > 0
      ? s.stores.map((st) => {
          let domain = String(st.domain);
          if (!domain.startsWith('www.') && (domain.includes('amazon') || domain.includes('flipkart') || domain.includes('nykaa') || domain.includes('croma') || domain.includes('tatacliq') || domain.includes('reliancedigital'))) {
            domain = `www.${domain}`;
          }
          return {
            id: String(st.id),
            name: String(st.name),
            domain,
            category: String(st.category || 'General & Electronics'),
            enabled: st.enabled !== false,
            status: (st.lastChecked && st.status === 'active' ? 'active' : 'configured') as 'active' | 'configured',
            searchSupported: st.id === 'amazon',
            isCustom: Boolean(st.isCustom),
            lastChecked: typeof st.lastChecked === 'string' ? st.lastChecked : undefined,
            latencyMs: typeof st.latencyMs === 'number' ? st.latencyMs : undefined,
            error: typeof st.error === 'string' ? reason(st.error) : undefined,
          };
        })
      : DEFAULT_STORES.map((x) => ({ ...x })),
    newStore: s.newStore && typeof s.newStore === 'object'
      ? {
          name: typeof s.newStore.name === 'string' ? s.newStore.name.slice(0, 80) : '',
          domain: typeof s.newStore.domain === 'string' ? s.newStore.domain.slice(0, 120) : '',
          category: typeof s.newStore.category === 'string' ? s.newStore.category.slice(0, 60) : 'General & Electronics',
        }
      : { name: '', domain: '', category: 'General & Electronics' },
    pincode: typeof s.pincode === 'string' ? s.pincode.slice(0, 20) : '560001',
    newWish: s.newWish && typeof s.newWish === 'object'
      ? {
          title: typeof s.newWish.title === 'string' ? s.newWish.title.slice(0, 160) : '',
          targetPrice: typeof s.newWish.targetPrice === 'string' ? s.newWish.targetPrice.slice(0, 20) : '',
          category: CATEGORIES.includes(String(s.newWish.category)) ? String(s.newWish.category) : CATEGORIES[0],
          store: STORES.includes(String(s.newWish.store)) ? String(s.newWish.store) : STORES[0],
          url: typeof s.newWish.url === 'string' ? s.newWish.url.slice(0, 500) : '',
          image: typeof s.newWish.image === 'string' ? s.newWish.image.slice(0, 500) : '',
          pincode: typeof s.newWish.pincode === 'string' ? s.newWish.pincode.slice(0, 20) : '560001',
          notes: typeof s.newWish.notes === 'string' ? s.newWish.notes.slice(0, 300) : '',
        }
      : { title: '', targetPrice: '', category: CATEGORIES[0], store: STORES[0], url: '', image: '', pincode: '560001', notes: '' },
    newRecord: s.newRecord && typeof s.newRecord === 'object'
      ? {
          wishId: typeof s.newRecord.wishId === 'string' ? s.newRecord.wishId : (wishes[0]?.id ?? ''),
          price: typeof s.newRecord.price === 'string' ? s.newRecord.price.slice(0, 20) : '',
          store: STORES.includes(String(s.newRecord.store)) ? String(s.newRecord.store) : STORES[0],
          inStock: s.newRecord.inStock !== false,
          rating: typeof s.newRecord.rating === 'string' ? s.newRecord.rating.slice(0, 10) : '',
          deliveryInfo: typeof s.newRecord.deliveryInfo === 'string' ? s.newRecord.deliveryInfo.slice(0, 80) : '',
          pincode: typeof s.newRecord.pincode === 'string' ? s.newRecord.pincode.slice(0, 20) : '560001',
          offerNotes: typeof s.newRecord.offerNotes === 'string' ? s.newRecord.offerNotes.slice(0, 200) : '',
        }
      : { wishId: wishes[0]?.id ?? '', price: '', store: STORES[0], inStock: true, rating: '', deliveryInfo: '', pincode: '560001', offerNotes: '' },
    importText: typeof s.importText === 'string' ? s.importText.slice(0, MAX_TEXT) : '',
    lastImport: s.lastImport && typeof s.lastImport.at === 'string' && Number.isInteger(s.lastImport.count)
      ? { at: s.lastImport.at, count: s.lastImport.count }
      : undefined,
    problem: typeof s.problem === 'string' ? s.problem.slice(0, 400) : undefined,
    confirmDeleteId: typeof s.confirmDeleteId === 'string' ? s.confirmDeleteId : undefined,
    confirmClear: s.confirmClear === true,
  };
}

// --- Amazon parsing helper ---------------------------------------------------------

export function parseAmazonPageText(text: string): {
  paise: number;
  inStock: boolean | null;
  image?: string;
  rating?: number;
  ratingCount?: string;
  deliveryInfo?: string;
  pincode?: string;
} {
  const pageTitle = text.match(/^Title: (.+?)(?: : Amazon\.in:.*)?$/m)?.[1]?.trim();
  if (pageTitle) {
    const lines = text.split('\n');
    const heading = lines.findIndex((line, i) => i > 3 && line.trim() === pageTitle);
    if (heading < 0) throw new Error('No clear INR price bound to the product heading was detected on the Amazon page');
    text = lines.slice(heading, heading + 80).join('\n');
  }
  // The selling price is the first amount on a line of its own kind: instalments,
  // offers, cashback, savings and the list price sit beside it and are not it.
  const notPrice = /\bEMI\b|per month|\/month|cashback|discount|savings on|\boffer|\bupto\b|\bup to\b|M\.R\.P|list price|was:|coupon/i;
  let match: RegExpMatchArray | null = null;
  for (const line of text.split('\n')) {
    if (/add this item to your cart|see price in cart|price in cart/i.test(line)) {
      throw new Error('Amazon shows this price only in the cart; no price was read. Record price by hand from your browser.');
    }
    if (notPrice.test(line)) continue;
    match = line.match(/₹\s*([0-9]+(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?)(?![0-9.])/);
    if (match) break;
  }
  if (!match) throw new Error('No clear INR price was detected on the Amazon page');
  const rawNum = match[1]!.replace(/,/g, '');
  const [whole, dec = ''] = rawNum.split('.');
  const p = Number(whole) * 100 + Number(dec.padEnd(2, '0').slice(0, 2));
  if (!Number.isSafeInteger(p) || p <= 0) throw new Error('Price must be a positive number');
  const inStock = /currently unavailable|out of stock|sold out/i.test(text) ? false : /\bin stock\b/i.test(text) ? true : null;

  const ratingMatch = text.match(/([0-5](?:\.[0-9])?) out of 5 stars/i);
  const rating = ratingMatch ? Number(ratingMatch[1]) : undefined;
  const reviewMatch = text.match(/([0-9,]+)\s*(?:ratings|reviews)\b/i);
  const ratingCount = reviewMatch?.[1];
  const deliveryLine = text.split('\n').find((line) => /^(?:FREE delivery|Fastest delivery)\s+(?:by\s+)?(?:[A-Z][a-z]{2},|Tomorrow|Today|[0-9])/i.test(line));
  const deliveryInfo = deliveryLine?.replace(/\(https:\/\/[^)]+\)/g, '').trim().slice(0, 80);
  // Browser location and images are absent from this public text contract.
  const pincode = undefined;
  const image = undefined;
  return { paise: p, inStock, image, rating, ratingCount, deliveryInfo, pincode };
}

/** Parse the current fetch tool's text/link contract, keeping each price bound to its product URL. */
function amazonTextOptions(text: string, query: string): ProductOption[] {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !['inch', 'inches'].includes(t));
  const accessories = /\b(case|cover|protector|skin|sleeve|cable|adapter|pouch|bag|stand|hub|dock|guard|screenguard|glass)\b/i;
  const options = new Map<string, ProductOption>();
  let current: { asin: string; title: string; url: string; rating?: number } | undefined;
  for (const line of text.split('\n')) {
    const link = line.match(/^(.*?) \((https:\/\/www\.amazon\.in\/[^\s)]+)\)/);
    if (link) {
      const url = new URL(link[2]!);
      const asin = url.pathname.match(/\/dp\/([A-Z0-9]{10})(?:\/|$)/)?.[1];
      const label = link[1]!.trim();
      if (asin && !/^(?:Price,|[0-9.]+ [0-9.]+ out of|\+|See |More |Quick |Add )/i.test(label)) {
        current = { asin, title: label, url: `https://www.amazon.in/dp/${asin}` };
        if (tokens.some((token) => !label.toLowerCase().split(/[^a-z0-9]+/).includes(token)) || (!accessories.test(query) && accessories.test(label))) current = undefined;
      } else if (asin && current && asin !== current.asin) {
        current = undefined;
      }
    }
    if (!current) continue;
    const rating = line.match(/([0-5](?:\.[0-9])?) out of 5 stars/);
    if (rating) current.rating = Number(rating[1]);
    if (!line.startsWith('Price, product page ')) continue;
    // Require the price link to identify the same product. Navigation and adjacent offers cannot supply it.
    if (!link || !new URL(link[2]!).pathname.includes(`/dp/${current.asin}`)) continue;
    const price = line.match(/^Price, product page ₹\s*([0-9,]+(?:\.[0-9]{1,2})?)/)?.[1];
    if (!price) continue;
    try {
      const pricePaise = paise(price);
      options.set(current.asin, { ...current, pricePaise, priceFormatted: formatInr(pricePaise) });
    } catch {}
  }
  return [...options.values()].slice(0, 5);
}

export function parseAmazonSearchResults(html: string, query = ''): ProductOption[] {
  return amazonTextOptions(html, query);
}

export function parseGenericPage(text: string, fallbackStore = 'Store'): {
  paise?: number;
  inStock: boolean | null;
  image?: string;
  title?: string;
  rating?: number;
  ratingCount?: string;
} {
  const title = text.match(/^Title: (.+)$/m)?.[1]?.trim();
  const lines = text.split('\n');
  const heading = title ? lines.findIndex((line, i) => i > 3 && line.trim() === title) : -1;
  if (heading < 0) throw new Error(`${fallbackStore} page does not expose a product heading through Web pages; no price saved`);
  const block = lines.slice(heading + 1, heading + 21);
  const prices = new Set<number>();
  for (const line of block) {
    // Unlabelled navigation, instalments, list prices and recommendations are not product offers.
    const match = line.match(/^(?:Price|Selling price|Offer price)\s*:?\s*(?:₹|INR|Rs\.?)\s*([0-9,]+(?:\.[0-9]{1,2})?)(?![0-9.])/i);
    if (match) prices.add(paise(match[1]!));
  }
  if (prices.size !== 1) throw new Error(`${fallbackStore} page has no unambiguous labelled INR product price through Web pages; no price saved`);
  const body = block.join('\n');
  const inStock = /out of stock|currently unavailable|sold out/i.test(body) ? false : /\bin stock\b/i.test(body) ? true : null;
  return { title, paise: [...prices][0], inStock };
}

// --- handleAction -----------------------------------------------------------------

export async function handleAction(controlId: string, value: unknown, c: Context, action?: string) {
  const now = c.now?.() ?? new Date();
  const s = (c.state = normalize(c.state, now));
  let focusSurface: string | undefined;

  if (!action) {
    // Bound field autosave
    if (controlId === '/newWish/title') s.newWish!.title = String(value ?? '').slice(0, 160);
    else if (controlId === '/newWish/targetPrice') s.newWish!.targetPrice = String(value ?? '').slice(0, 20);
    else if (controlId === '/newWish/category') s.newWish!.category = String(value ?? '');
    else if (controlId === '/newWish/store') s.newWish!.store = String(value ?? '');
    else if (controlId === '/newWish/url') s.newWish!.url = String(value ?? '').slice(0, 500);
    else if (controlId === '/newWish/image') s.newWish!.image = String(value ?? '').slice(0, 500);
    else if (controlId === '/newWish/pincode') s.newWish!.pincode = String(value ?? '').slice(0, 20);
    else if (controlId === '/newWish/notes') s.newWish!.notes = String(value ?? '').slice(0, 300);
    else if (controlId === '/newStore/name') s.newStore!.name = String(value ?? '').slice(0, 80);
    else if (controlId === '/newStore/domain') s.newStore!.domain = String(value ?? '').slice(0, 120);
    else if (controlId === '/newStore/category') s.newStore!.category = String(value ?? '').slice(0, 60);
    else if (controlId === '/newRecord/wishId') s.newRecord!.wishId = String(value ?? '');
    else if (controlId === '/newRecord/price') s.newRecord!.price = String(value ?? '').slice(0, 20);
    else if (controlId === '/newRecord/store') s.newRecord!.store = String(value ?? '');
    else if (controlId === '/newRecord/inStock') s.newRecord!.inStock = Boolean(value);
    else if (controlId === '/newRecord/rating') s.newRecord!.rating = String(value ?? '').slice(0, 10);
    else if (controlId === '/newRecord/deliveryInfo') s.newRecord!.deliveryInfo = String(value ?? '').slice(0, 80);
    else if (controlId === '/newRecord/pincode') s.newRecord!.pincode = String(value ?? '').slice(0, 20);
    else if (controlId === '/newRecord/offerNotes') s.newRecord!.offerNotes = String(value ?? '').slice(0, 200);
    else if (controlId === '/pincode') s.pincode = String(value ?? '').slice(0, 20);
    else if (controlId === '/importText') s.importText = String(value ?? '').slice(0, MAX_TEXT);
    else throw new Error(`Unknown Wish Radar field: ${controlId}`);
    // Drafts have no observation dependency. Retain the committed view's
    // computed values while replacing its normalized draft object.
    const field = controlId.split('/')[1]!;
    const surface = field === 'newWish' || field === 'newRecord' ? 'overview'
      : field === 'newStore' || field === 'importText' ? 'import' : undefined;
    const saved = surface ? c.surfaces?.[surface] as { data?: Record<string, unknown> } | undefined : undefined;
    if (surface && saved?.data) {
      return { updates: [{ surface, nodes: [], data: [{ op: 'replace' as const, path: '/' as const, value: { ...saved.data, [field]: (s as unknown as Record<string, unknown>)[field] } }] }] };
    }
  } else if (action === 'show_add') {
    s.mode = 'add';
    s.editingWishId = undefined;
    s.newWish = { title: '', targetPrice: '', category: CATEGORIES[0], store: STORES[0], url: '', image: '', pincode: s.pincode || '560001', notes: '' };
    s.problem = undefined;
    focusSurface = 'overview';
  } else if (action === 'show_edit') {
    s.mode = 'add';
    s.problem = undefined;
    const wid = typeof value === 'object' && value && 'id' in value ? String((value as { id: unknown }).id) : undefined;
    const targetWish = s.wishes!.find((w) => w.id === wid);
    if (targetWish) {
      s.editingWishId = targetWish.id;
      s.newWish = {
        title: targetWish.title,
        targetPrice: targetWish.targetPaise != null ? (targetWish.targetPaise / 100).toString() : '',
        category: targetWish.category,
        store: targetWish.store,
        url: targetWish.url ?? '',
        image: targetWish.image ?? '',
        pincode: targetWish.pincode ?? s.pincode ?? '560001',
        notes: targetWish.notes ?? '',
      };
    }
    focusSurface = 'overview';
  } else if (action === 'show_record') {
    s.mode = 'record';
    s.problem = undefined;
    const wid = typeof value === 'object' && value && 'id' in value ? String((value as { id: unknown }).id) : undefined;
    if (wid && s.wishes!.some((w) => w.id === wid)) {
      s.newRecord!.wishId = wid;
      const targetWish = s.wishes!.find((w) => w.id === wid);
      if (targetWish) {
        s.newRecord!.store = targetWish.store;
        s.newRecord!.pincode = targetWish.pincode ?? s.pincode ?? '560001';
      }
    }
    focusSurface = 'overview';
  } else if (action === 'toggle_view_mode') {
    s.viewMode = s.viewMode === 'table' ? 'cards' : 'table';
  } else if (action === 'cancel_mode') {
    s.mode = 'list';
    s.editingWishId = undefined;
    s.confirmDeleteId = undefined;
    s.newWish = { title: '', targetPrice: '', category: CATEGORIES[0], store: STORES[0], url: '', image: '', pincode: s.pincode || '560001', notes: '' };
  } else if (action === 'add_wish' || action === 'remember_wish' || action === 'update_wish') {
    s.problem = undefined;
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    const editingId = action === 'update_wish'
      ? (valObj && ('id' in valObj || 'wishId' in valObj) ? String(valObj.id ?? valObj.wishId) : s.editingWishId)
      : s.editingWishId;

    const title = valObj && 'title' in valObj ? String(valObj.title).trim() : s.newWish?.title?.trim();
    if (!title) throw new Error('Enter an item title for your wish');

    const rawTarget = valObj && 'targetPrice' in valObj ? valObj.targetPrice : s.newWish?.targetPrice;
    const targetPaise = rawTarget !== undefined && rawTarget !== null && String(rawTarget).trim() !== ''
      ? paise(rawTarget)
      : undefined;

    const rawCat = valObj && 'category' in valObj ? String(valObj.category) : s.newWish?.category;
    const category = rawCat && CATEGORIES.includes(rawCat) ? rawCat : 'Other';

    const rawStore = valObj && 'store' in valObj ? String(valObj.store) : s.newWish?.store;
    const store = rawStore && STORES.includes(rawStore) ? rawStore : 'Amazon.in';

    const rawUrl = valObj && 'url' in valObj ? String(valObj.url).trim() : s.newWish?.url?.trim();
    let url: string | undefined;
    if (rawUrl && rawUrl.startsWith('https://')) {
      try { url = canonicalProductUrl(rawUrl).slice(0, 500); } catch { throw new Error('Enter a valid https product link'); }
    }

    const rawImage = valObj && 'image' in valObj ? String(valObj.image).trim() : s.newWish?.image?.trim();
    const image = rawImage && rawImage.startsWith('https://') ? rawImage.slice(0, 500) : undefined;

    const rawPin = valObj && 'pincode' in valObj ? String(valObj.pincode).trim() : (s.newWish?.pincode?.trim() || s.pincode);
    const pincode = rawPin ? rawPin.slice(0, 20) : '560001';

    const rawNotes = valObj && 'notes' in valObj ? String(valObj.notes).trim() : s.newWish?.notes?.trim();
    const notes = rawNotes ? rawNotes.slice(0, 300) : undefined;

    if (editingId) {
      const existing = s.wishes!.find((w) => w.id === editingId);
      if (!existing) throw new Error('Wish to update not found');
      existing.title = title;
      existing.category = category;
      existing.targetPaise = targetPaise;
      existing.store = store;
      existing.url = url;
      existing.image = image;
      existing.pincode = pincode;
      existing.notes = notes;
      s.editingWishId = undefined;
    } else {
      if (s.wishes!.length >= MAX_WISHES) throw new Error(`Wish Radar supports up to ${MAX_WISHES} active wishes`);
      const newId = `wish-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const wish: Wish = {
        id: newId,
        title,
        category,
        targetPaise,
        store,
        url,
        image,
        pincode,
        notes,
        createdAt: now.toISOString(),
      };

      if (!wish.url && c.callTool && store === 'Amazon.in') {
        try {
          const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(title)}`;
          const rawText = await fetchMerchant(c, s, searchUrl);
          const options = parseAmazonSearchResults(rawText, title);
          if (!options.length) s.problem = 'Wish saved. No matching priced products could be read; add an exact product link to check it.';
          if (options.length > 0) {
            s.productOptions![newId] = options;
            s.problem = 'Matching candidates found. Compare variants and select the exact product before checking its price.';
          }
        } catch (err) {
          s.problem = `Wish saved. ${checkFailure(title, err, 'search')}`;
        }
      }

      s.wishes!.unshift(wish);
    }
    s.mode = 'list';
    s.newWish = { title: '', targetPrice: '', category: CATEGORIES[0], store: STORES[0], url: '', image: '', pincode: s.pincode || '560001', notes: '' };
  } else if (action === 'add_record' || action === 'record_price') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    let wid = valObj && 'wishId' in valObj ? String(valObj.wishId) : s.newRecord?.wishId;
    if (!wid && valObj && 'itemTitle' in valObj) {
      const match = s.wishes!.find((w) => w.title.toLowerCase().includes(String(valObj.itemTitle).toLowerCase()));
      if (match) wid = match.id;
    }
    if (!wid || !s.wishes!.some((w) => w.id === wid)) throw new Error('Choose an item from your wishlist');

    const rawPrice = valObj && 'price' in valObj ? valObj.price : s.newRecord?.price;
    const pricePaise = paise(rawPrice);
    if (!c.database) throw new Error('Database is not available');

    await initializeDb(c.database);
    const countRes = await c.database.query('SELECT count(*)::INTEGER AS n FROM price_observations');
    if (Number(countRes[0]?.n ?? 0) >= MAX_OBSERVATIONS) throw new Error(`Database limit of ${MAX_OBSERVATIONS} observations reached`);

    const obsId = `obs-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const rawStore = valObj && 'store' in valObj ? String(valObj.store) : s.newRecord?.store;
    const store = rawStore && STORES.includes(rawStore) ? rawStore : 'Amazon.in';
    const inStock = valObj && 'inStock' in valObj ? Boolean(valObj.inStock) : (s.newRecord?.inStock !== false);

    const rawRating = valObj && 'rating' in valObj ? valObj.rating : s.newRecord?.rating;
    const ratingVal = rawRating ? Number(rawRating) : null;

    const ratingCount = valObj && 'ratingCount' in valObj ? String(valObj.ratingCount).slice(0, 30) : null;
    const deliveryInfo = valObj && 'deliveryInfo' in valObj ? String(valObj.deliveryInfo).trim().slice(0, 80) : (s.newRecord?.deliveryInfo?.trim() || null);
    const pincode = valObj && 'pincode' in valObj ? String(valObj.pincode).trim().slice(0, 20) : (s.newRecord?.pincode?.trim() || s.pincode || '560001');
    const offerNotes = valObj && 'offerNotes' in valObj ? String(valObj.offerNotes).trim().slice(0, 200) : (s.newRecord?.offerNotes?.trim() ?? '');

    await c.database.run(
      'INSERT INTO price_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        obsId,
        wid,
        now.toISOString(),
        store,
        pricePaise,
        inStock,
        offerNotes,
        Number.isFinite(ratingVal) ? ratingVal : null,
        ratingCount,
        deliveryInfo,
        pincode,
      ]
    );

    s.mode = 'list';
    s.newRecord = { wishId: wid, price: '', store: s.newRecord?.store ?? STORES[0], inStock: true, rating: '', deliveryInfo: '', pincode: s.pincode || '560001', offerNotes: '' };
    s.problem = undefined;
  } else if (action === 'check_amazon' || action === 'check_amazon_price' || action === 'check_live_price') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    let wid = valObj && ('wishId' in valObj || 'id' in valObj) ? String(valObj.wishId ?? valObj.id) : undefined;
    if (!wid && valObj && 'itemTitle' in valObj) {
      const match = s.wishes!.find((w) => w.title.toLowerCase().includes(String(valObj.itemTitle).toLowerCase()));
      if (match) wid = match.id;
    }
    const wish = s.wishes!.find((w) => w.id === wid);
    if (!wish) throw new Error('Wish not found');

    if (!c.callTool) {
      s.problem = 'Web pages is unavailable. Review Access in this app’s header.';
      if (action === 'check_amazon_price') throw new Error(s.problem);
      const ledgerData = await load(c.database, s.wishes!, s.activeWishId);
      return { updates: view(s, ledgerData, now) };
    }

    let kind: 'page' | 'search' = 'page';
    try {
      if (wish.url) wish.url = canonicalProductUrl(wish.url);
      if (wish.url && merchantFor(s, wish.url).id === 'amazon') {
        const rawText = await fetchMerchant(c, s, wish.url);
        const parsed = parseAmazonPageText(rawText);

        if (parsed.image && !wish.image) {
          wish.image = parsed.image;
        }

        if (c.database) {
          await initializeDb(c.database);
          const obsId = `obs-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await c.database.run(
            'INSERT INTO price_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              obsId,
              wish.id,
              now.toISOString(),
              'Amazon.in',
              parsed.paise,
              parsed.inStock,
              'Live Amazon check',
              parsed.rating ?? null,
              parsed.ratingCount ?? null,
              parsed.deliveryInfo ?? null,
              parsed.pincode ?? wish.pincode ?? s.pincode ?? '560001',
            ]
          );
        }
        s.problem = undefined;
      } else if (wish.url && (wish.url.startsWith('https://') || wish.url.startsWith('http://'))) {
        const rawText = await fetchMerchant(c, s, wish.url);
        const parsed = parseGenericPage(rawText, wish.store);

        if (parsed.image && !wish.image) wish.image = parsed.image;
        if (!parsed.paise) throw new Error(`Could not detect live price on ${wish.store} page`);

        if (c.database) {
          await initializeDb(c.database);
          const obsId = `obs-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
          await c.database.run(
            'INSERT INTO price_observations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              obsId,
              wish.id,
              now.toISOString(),
              wish.store,
              parsed.paise,
              parsed.inStock,
              `Live ${wish.store} check`,
              parsed.rating ?? null,
              parsed.ratingCount ?? null,
              null,
              wish.pincode ?? s.pincode ?? '560001',
            ]
          );
        }
        s.problem = undefined;
      } else {
        if (wish.store !== 'Amazon.in') throw new Error(`Search discovery is not available for ${wish.store}. Edit this wish to add its direct product link.`);
        kind = 'search';
        const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(wish.title)}`;
        const rawText = await fetchMerchant(c, s, searchUrl);
        const options = parseAmazonSearchResults(rawText, wish.title);

        if (!options.length) {
          s.problem = `No matching priced products could be read for "${wish.title}". Click "Edit" to paste a direct product link, or "Record Price" to log an observed price.`;
          const ledgerData = await load(c.database, s.wishes!, s.activeWishId);
          return { updates: view(s, ledgerData, now) };
        }

        s.productOptions![wish.id] = options;
        s.problem = 'Matching candidates found. Compare variants and select the exact product before checking its price.';
      }
    } catch (err) {
      s.problem = checkFailure(wish.title, err, kind);
      if (action === 'check_amazon_price') throw new Error(s.problem);
    }
  } else if (action === 'show_options') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    const wid = valObj && ('wishId' in valObj || 'id' in valObj) ? String(valObj.wishId ?? valObj.id) : undefined;
    s.viewingOptionsWishId = wid;
  } else if (action === 'close_options') {
    s.viewingOptionsWishId = undefined;
  } else if (action === 'select_option') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    const wid = valObj && 'wishId' in valObj ? String(valObj.wishId) : s.viewingOptionsWishId;
    const wish = s.wishes!.find((w) => w.id === wid);
    if (wish && valObj) {
      const option = s.productOptions?.[wish.id]?.find((opt) => opt.asin === valObj.asin);
      if (!option) throw new Error('Select a product from this wish’s current discovered candidates');
      merchantFor(s, option.url);
      wish.url = option.url;
      if (option.image) wish.image = option.image;
      wish.title = option.title;
    }
    s.viewingOptionsWishId = undefined;
    s.problem = undefined;
  } else if (action === 'toggle_store') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    const sid = valObj && 'id' in valObj ? String(valObj.id) : undefined;
    const store = s.stores?.find((st) => st.id === sid);
    if (!store) throw new Error('Store not found');
    const enabledCount = s.stores!.filter((st) => st.enabled).length;
    if (store.enabled && enabledCount <= 1) throw new Error('Keep at least one shopping merchant enabled');
    store.enabled = !store.enabled;
  } else if (action === 'test_store') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    const sid = valObj && 'id' in valObj ? String(valObj.id) : undefined;
    const store = s.stores?.find((st) => st.id === sid);
    if (!store) throw new Error('Store not found');
    if (!c.callTool) throw new Error('Web fetch integration is not available');

    const domain = store.domain;
    const start = Date.now();
    try {
      await fetchMerchant(c, s, `https://${domain}`);
      const elapsed = Date.now() - start;
      store.lastChecked = now.toISOString();
      store.latencyMs = elapsed;
      store.status = 'active';
      store.error = undefined;
    } catch (err) {
      const r = reason(err);
      store.lastChecked = now.toISOString();
      store.status = 'configured';
      if (r.includes('403') || r.includes('503')) {
        store.error = `HTTP request refused or unavailable (${r.match(/403|503/)?.[0]}); browser access may differ`;
      } else {
        store.error = r.slice(0, 80);
      }
    }
  } else if (action === 'add_store') {
    const name = s.newStore?.name?.trim() || '';
    let domain = s.newStore?.domain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || '';
    if (!name || !domain) throw new Error('Enter a store name and domain (e.g. boAt Lifestyle, boat-lifestyle.com)');
    if (s.stores!.some((st) => st.domain.toLowerCase() === domain)) throw new Error('That store domain is already configured');

    const newStoreId = `store-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    s.stores!.push({
      id: newStoreId,
      name,
      domain,
      category: s.newStore?.category || 'General & Electronics',
      enabled: true,
      status: 'configured',
      searchSupported: false,
      isCustom: true,
    });
    s.newStore = { name: '', domain: '', category: 'General & Electronics' };
  } else if (action === 'remove_store') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    const sid = valObj && 'id' in valObj ? String(valObj.id) : undefined;
    s.stores = s.stores!.filter((st) => st.id !== sid);
  } else if (action === 'restore_stores') {
    s.stores = DEFAULT_STORES.map((x) => ({ ...x }));
  } else if (action === 'ask_delete') {
    const wid = typeof value === 'object' && value && 'id' in value ? String((value as { id: unknown }).id) : undefined;
    s.confirmDeleteId = wid;
  } else if (action === 'cancel_delete') {
    s.confirmDeleteId = undefined;
  } else if (action === 'confirm_delete' || action === 'remove_wish') {
    const valObj = typeof value === 'object' && value ? (value as Record<string, unknown>) : undefined;
    let wid = s.confirmDeleteId ?? (valObj && ('wishId' in valObj || 'id' in valObj) ? String(valObj.wishId ?? valObj.id) : undefined);
    if (!wid && valObj && 'itemTitle' in valObj) {
      const match = s.wishes!.find((w) => w.title.toLowerCase().includes(String(valObj.itemTitle).toLowerCase()));
      if (match) wid = match.id;
    }
    if (wid) {
      s.wishes = s.wishes!.filter((w) => w.id !== wid);
      if (c.database) {
        await initializeDb(c.database);
        await c.database.run('DELETE FROM price_observations WHERE wish_id = ?', [wid]);
      }
      if (s.activeWishId === wid) s.activeWishId = undefined;
    }
    s.confirmDeleteId = undefined;
  } else if (action === 'select_wish') {
    const wid = typeof value === 'object' && value && 'id' in value ? String((value as { id: unknown }).id) : undefined;
    s.activeWishId = wid === s.activeWishId ? undefined : wid;
  } else if (action === 'dismiss_problem') {
    s.problem = undefined;
  } else if (action === 'ask_clear') {
    s.confirmClear = true;
  } else if (action === 'cancel_clear') {
    s.confirmClear = false;
  } else if (action === 'clear_all') {
    if (c.database) {
      await initializeDb(c.database);
      await c.database.run('DELETE FROM price_observations');
    }
    s.confirmClear = false;
    delete s.lastImport;
  } else if (action === 'import_records') {
    const text = s.importText?.trim() ?? '';
    if (!text) throw new Error('Paste CSV or JSON records to import');
    let importedCount = 0;

    if (text.startsWith('[')) {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of wish items');
      for (const item of parsed.slice(0, 50)) {
        if (item && typeof item === 'object' && typeof item.title === 'string' && item.title.trim()) {
          const rawTarget = item.targetPrice ?? item.targetPaise;
          const targetPaise = rawTarget !== undefined && rawTarget !== null && String(rawTarget).trim() !== '' ? paise(rawTarget) : undefined;
          s.wishes!.push({
            id: `wish-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            title: String(item.title).slice(0, 160),
            category: CATEGORIES.includes(String(item.category)) ? String(item.category) : 'Other',
            targetPaise,
            store: STORES.includes(String(item.store)) ? String(item.store) : 'Amazon.in',
            url: typeof item.url === 'string' && item.url.startsWith('https://') ? item.url.slice(0, 500) : undefined,
            image: typeof item.image === 'string' && item.image.startsWith('https://') ? item.image.slice(0, 500) : undefined,
            pincode: typeof item.pincode === 'string' ? item.pincode.slice(0, 20) : s.pincode,
            notes: typeof item.notes === 'string' ? item.notes.slice(0, 300) : undefined,
            createdAt: now.toISOString(),
          });
          importedCount++;
        }
      }
    } else {
      // CSV format: title, targetPrice, category, store, url, image
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.toLowerCase().startsWith('title,')) continue; // skip header
        const parts = line.split(',').map((p) => p.trim());
        if (parts[0]) {
          const targetPaise = parts[1] && parts[1].trim() ? paise(parts[1]) : undefined;
          s.wishes!.push({
            id: `wish-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            title: parts[0].slice(0, 160),
            targetPaise,
            category: CATEGORIES.includes(parts[2] ?? '') ? parts[2]! : 'Other',
            store: STORES.includes(parts[3] ?? '') ? parts[3]! : 'Amazon.in',
            url: parts[4] && parts[4].startsWith('https://') ? parts[4].slice(0, 500) : undefined,
            image: parts[5] && parts[5].startsWith('https://') ? parts[5].slice(0, 500) : undefined,
            pincode: s.pincode || '560001',
            createdAt: now.toISOString(),
          });
          importedCount++;
        }
      }
    }

    if (!importedCount) throw new Error('No valid records found in import text');
    s.lastImport = { at: now.toISOString(), count: importedCount };
    s.importText = '';
    focusSurface = 'overview';
  } else {
    throw new Error(`Unknown Wish Radar action: ${action}`);
  }

  const ledgerData = await load(c.database, s.wishes!, s.activeWishId);
  return {
    updates: view(s, ledgerData, now),
    ...(focusSurface ? { focusSurface } : {}),
  };
}

// --- background refresh (triggers) ------------------------------------------------

export async function refresh(c: Context) {
  const now = c.now?.() ?? new Date();
  const s = (c.state = normalize(c.state, now));
  const eligible = s.wishes!.filter((wish) => wish.url);
  const failures: string[] = [];
  const advice = new Set<string>();
  // A merchant that declined one automated read is not asked again in this refresh.
  const declined = new Set<string>();
  const start = Date.now();
  const count = Math.min(eligible.length, 4);
  let attempted = 0;
  for (let offset = 0; offset < count && Date.now() - start < 12_000; offset++) {
    const index = ((s.refreshCursor ?? 0) + offset) % eligible.length;
    const wish = eligible[index]!;
    let merchant = '';
    try { merchant = merchantFor(c.state, wish.url!).id; } catch { /* the check reports it */ }
    if (merchant && declined.has(merchant)) break;
    await handleAction('check_live_price', { id: wish.id }, c, 'check_live_price');
    // handleAction normalizes state, so always read the current owner.
    const problem = c.state.problem;
    if (problem) {
      const cut = problem.indexOf(' The store declined this automated');
      failures.push(cut < 0 ? problem : problem.slice(0, cut));
      if (cut >= 0) { advice.add(problem.slice(cut + 1)); if (merchant) declined.add(merchant); }
    }
    attempted++;
  }
  const current = c.state;
  current.refreshCursor = eligible.length ? ((s.refreshCursor ?? 0) + attempted) % eligible.length : 0;
  current.problem = [...failures, ...advice, eligible.length > attempted ? `${eligible.length - attempted} linked wishes deferred to the next refresh.` : ''].filter(Boolean).join(' ') || undefined;
  const ledgerData = await load(c.database, current.wishes!, current.activeWishId);
  return { updates: view(current, ledgerData, now) };
}

// --- handleQuery (read-only tool export) --------------------------------------------

export async function handleQuery(toolName: string, params: Record<string, unknown> = {}, c: Context): Promise<unknown> {
  const s = normalize(c.state);
  const ledgerData = await load(c.database, s.wishes!, s.activeWishId);

  if (toolName === 'get_wishlist') {
    const filter = typeof params?.filter === 'string' ? params.filter : 'all';
    const category = typeof params?.category === 'string' ? params.category : undefined;

    let summaries = ledgerData.summaries;
    if (category) {
      summaries = summaries.filter((sm) => sm.wish.category.toLowerCase() === category.toLowerCase());
    }
    if (filter === 'deals') {
      summaries = summaries.filter((sm) => sm.status === 'target_met');
    } else if (filter === 'drops') {
      summaries = summaries.filter((sm) => sm.status === 'target_met' || sm.status === 'price_dropped');
    }

    return {
      expectedRevision: c.appRevision,
      pincode: s.pincode || '560001',
      totalWishes: s.wishes!.length,
      targetMetCount: ledgerData.targetMetCount,
      totalSavings: formatInr(ledgerData.totalSavingsPaise),
      wishes: summaries.map((sm) => {
        const spreadStr = sm.cheapestPaise != null && sm.latestPricePaise != null && sm.cheapestStore !== sm.latestStore
          ? `${formatInr(sm.latestPricePaise - sm.cheapestPaise)} cheaper on ${sm.cheapestStore} than ${sm.latestStore}`
          : (sm.storeComparisons.length > 1 ? 'Lowest observed price across stores' : undefined);

        return {
          id: sm.wish.id,
          title: sm.wish.title,
          category: sm.wish.category,
          store: sm.latestStore,
          targetPrice: sm.wish.targetPaise != null ? formatInr(sm.wish.targetPaise) : 'No target set',
          targetPaise: sm.wish.targetPaise ?? null,
          latestPrice: sm.latestPricePaise != null ? formatInr(sm.latestPricePaise) : 'No checks yet',
          latestPricePaise: sm.latestPricePaise,
          rating: sm.rating ? `${sm.rating} / 5` : undefined,
          ratingCount: sm.ratingCount,
          delivery: sm.deliveryInfo,
          pincode: sm.pincode,
          status: sm.statusLabel,
          inStock: sm.latestDate ? sm.inStock : null,
          cheapestStore: sm.cheapestStore,
          cheapestPrice: sm.cheapestPaise ? formatInr(sm.cheapestPaise) : undefined,
          priceSpread: spreadStr,
          url: sm.wish.url,
          notes: sm.wish.notes,
        };
      }),
    };
  }

  if (toolName === 'get_price_history') {
    const wishId = typeof params?.wishId === 'string' ? params.wishId : undefined;
    const itemTitle = typeof params?.itemTitle === 'string' ? params.itemTitle.toLowerCase() : undefined;
    const limit = typeof params?.limit === 'number' && Number.isInteger(params.limit) && params.limit > 0
      ? Math.min(params.limit, 50)
      : 20;

    let targetWish = s.wishes!.find((w) => w.id === wishId);
    if (!targetWish && itemTitle) {
      targetWish = s.wishes!.find((w) => w.title.toLowerCase().includes(itemTitle));
    }

    let observations = ledgerData.recentObservations;
    if (targetWish) {
      observations = observations.filter((o) => o.wishId === targetWish!.id);
    }
    observations = observations.slice(0, limit);

    const prices = observations.map((o) => o.pricePaise).filter((p) => p > 0);
    const minPaise = prices.length ? Math.min(...prices) : null;
    const maxPaise = prices.length ? Math.max(...prices) : null;

    const targetSummary = targetWish ? ledgerData.summaries.find((sm) => sm.wish.id === targetWish!.id) : undefined;

    return {
      expectedRevision: c.appRevision,
      item: targetWish ? { id: targetWish.id, title: targetWish.title, targetPrice: targetWish.targetPaise != null ? formatInr(targetWish.targetPaise) : undefined } : undefined,
      totalObservations: observations.length,
      allTimeLow: minPaise != null ? formatInr(minPaise) : undefined,
      allTimeHigh: maxPaise != null ? formatInr(maxPaise) : undefined,
      observations: observations.map((o) => ({
        id: o.id,
        wishId: o.wishId,
        item: o.wishTitle,
        store: o.store,
        price: formatInr(o.pricePaise),
        pricePaise: o.pricePaise,
        inStock: o.inStock,
        rating: o.rating,
        ratingCount: o.ratingCount,
        delivery: o.deliveryInfo,
        pincode: o.pincode,
        offerNotes: o.offerNotes,
        recordedAt: o.recordedAt,
      })),
      storeComparisons: targetSummary?.storeComparisons.map((sc) => ({
        store: sc.store,
        price: formatInr(sc.pricePaise),
        differenceFromLowest: sc.diffPaise === 0 ? 'Lowest Price' : `+${formatInr(sc.diffPaise)}`,
        rating: sc.rating,
        delivery: sc.deliveryInfo,
        inStock: sc.inStock,
        recordedAt: sc.recordedAt,
      })),
    };
  }

  if (toolName === 'get_broadcast_script') {
    const prog = generateProgramme(s, ledgerData, c.now?.() ?? new Date());
    const format = typeof params?.format === 'string' ? params.format : 'both';
    return {
      expectedRevision: c.appRevision,
      title: prog.title,
      badge: prog.badge,
      totalSegments: prog.segments.length,
      tickerCount: prog.ticker?.length ?? 0,
      ...(format === 'script' || format === 'both' ? { broadcastScript: formatBroadcastScript(prog) } : {}),
      ...(format === 'programme' || format === 'both' ? { programme: prog } : {}),
    };
  }

  throw new Error(`Unknown query tool: ${toolName}`);
}

// --- derived views -----------------------------------------------------------------

const replaceAll = (value: Record<string, unknown>) => [{ op: 'replace' as const, path: '/' as const, value }];

export const wishWorkflow = {
  title: 'Deal advisor',
  stages: ['Analyze', 'Review'],
  brief: 'Your wishlist analysis brief',
  boundary: 'Your records and wishes stay on this computer. Price analysis is private and requires no subscriptions.',
  saved: 'Deal analysis complete.',
  guide: {
    start: {
      heading: 'Analyse wishlist and trends',
      hint: 'Ask the assistant to evaluate your recorded price points, compare deals across stores, or review pasted offer text.',
    },
    responded: {
      heading: 'Review recommendations',
      hint: 'Inspect suggested timing, delivery speeds, and discounts before logging new observations or making a purchase.',
    },
    saved: {
      heading: 'Analysis ready',
      hint: 'Your price comparison is updated in Wish Radar.',
    },
  },
  steps: [
    {
      id: 'evaluate-trends',
      label: 'Evaluate price trends',
      mode: 'send' as const,
      stage: 0,
      message: 'Analyze my active Wish Radar items, ratings and their price histories. Which items have dropped closest to their target price in INR? Highlight any current deals or price rises.',
    },
    {
      id: 'parse-offer',
      label: 'Read a copied deal or SMS',
      mode: 'edit' as const,
      stage: 0,
      message: 'Paste promotional email, SMS or deal text here (e.g. Nykaa Pink Friday sale or Amazon Great Indian Festival offer): ',
    },
    {
      id: 'timing-advice',
      label: 'Buy or wait advice',
      mode: 'send' as const,
      stage: 1,
      message: 'Based on the all-time low, current ratings and latest prices recorded in Wish Radar, is it a good time to buy now, or should I wait for upcoming festival sales in India?',
    },
  ],
  review: {
    label: 'Review wishes & deals',
    surface: 'overview',
    tool: 'remember_wish',
    stage: 1,
  },
};

export function advisorRequest(s: State, l: LedgerData): string {
  const wishesDesc = s.wishes!.map((w) => {
    const sm = l.summaries.find((x) => x.wish.id === w.id);
    const ratingStr = sm?.rating ? `Rating: ${sm.rating} / 5` : '';
    const deliveryStr = sm?.deliveryInfo ? `[${sm.deliveryInfo}]` : '';
    const targetStr = w.targetPaise != null ? `Target ${formatInr(w.targetPaise)}` : 'No target set';
    return `- ${w.title} (${w.category}, ${w.store}): ${targetStr}, Latest: ${sm?.latestPricePaise != null ? formatInr(sm.latestPricePaise) : 'No checks yet'}, ${ratingStr} ${deliveryStr}, Status: ${sm?.statusLabel ?? 'Waiting'}`;
  }).join('\n');

  return `Here is my current Wish Radar status:
Location PIN: ${s.pincode || '560001'}
Total wishes tracked: ${s.wishes!.length}
Deals meeting target: ${l.targetMetCount}
Potential savings: ${formatInr(l.totalSavingsPaise)}
Items:
${wishesDesc || 'No items tracked yet.'}

Please review these items, compare their recorded prices, delivery speeds, ratings and target prices in Indian Rupees, and advise on which items are ready to buy vs hold off on.`;
}

export function view(input: State, l: LedgerData = { totalObservations: 0, summaries: [], recentObservations: [], targetMetCount: 0, totalSavingsPaise: 0, selectedChartRecords: [] }, now = new Date(Date.now())): Update[] {
  const s = normalize(input, now);
  return [overviewSurface(s, l, now), historySurface(s, l), importSurface(s, l)];
}

function overviewSurface(s: State, l: LedgerData, now = new Date(Date.now())): Update {
  const hasWishes = s.wishes!.length > 0;
  const isAddMode = s.mode === 'add';
  const isRecordMode = s.mode === 'record';
  const isTableView = s.viewMode === 'table';

  // Deal Spotlight Banner if any deal meets target
  const topDeal = l.summaries.find((sm) => sm.status === 'target_met');
  const hasSelectedObservations = (l.selectedChartRecords?.length ?? 0) > 0;

  const viewingWish = s.viewingOptionsWishId ? s.wishes!.find((w) => w.id === s.viewingOptionsWishId) : undefined;
  const currentOptions = viewingWish ? (s.productOptions?.[viewingWish.id] || []) : [];

  const nodes: Node[] = [
    {
      id: 'root',
      type: 'stack',
      props: { gap: 'md' },
      children: [
        ...(s.problem ? ['problem-alert', 'dismiss-problem-btn'] : []),
        ...(isAddMode
          ? ['add-card']
          : isRecordMode
          ? ['record-card']
          : [
              'actions-bar',
              'stats-grid',
              ...(topDeal ? ['deal-spotlight'] : []),
              ...(viewingWish && currentOptions.length > 0 ? ['options-section'] : []),
              hasWishes ? (isTableView ? 'wishes-table-section' : 'wishes-cards-section') : 'empty-card',
              ...(hasSelectedObservations ? ['trend-deepdive-section'] : []),
              ...(s.confirmDeleteId ? ['delete-confirm-card'] : []),
            ]),
      ],
    },
    ...(s.problem
      ? [
          {
            id: 'problem-alert',
            type: 'alert',
            props: { title: 'Check notice', body: '{/problemText}', tone: 'warning' },
          },
          {
            id: 'dismiss-problem-btn',
            type: 'button',
            props: { label: 'Dismiss notice', action: 'dismiss_problem', style: 'link' },
          },
        ]
      : []),
    ...(isAddMode
      ? [
          {
            id: 'add-card',
            type: 'card',
            props: {
              title: s.editingWishId ? 'Edit tracked wish' : 'Add a new wish to track',
              subtitle: s.editingWishId
                ? 'Update item title, target price (optional), preferred merchant, delivery PIN or product URL.'
                : 'Target price in INR (optional), preferred merchant, delivery PIN and direct link.',
            },
            children: ['add-form-stack'],
          },
          {
            id: 'add-form-stack',
            type: 'stack',
            props: { gap: 'sm' },
            children: ['add-title', 'add-target', 'add-category', 'add-store', 'add-pincode', 'add-url', 'add-image', 'add-notes', 'add-button-bar'],
          },
          { id: 'add-title', type: 'input', props: { label: 'Item title', bind: '/newWish/title', placeholder: 'e.g. Sony WH-1000XM5 or boAt Rockerz 450' } },
          { id: 'add-target', type: 'input', props: { label: 'Target price · INR (optional)', bind: '/newWish/targetPrice', placeholder: 'e.g. 1499 (optional)' } },
          { id: 'add-category', type: 'select', props: { label: 'Category', bind: '/newWish/category', options: '{/categoryOptions}' } },
          { id: 'add-store', type: 'select', props: { label: 'Preferred merchant', bind: '/newWish/store', options: '{/storeOptions}' } },
          { id: 'add-pincode', type: 'input', props: { label: 'Delivery PIN code', bind: '/newWish/pincode', placeholder: '560001' } },
          { id: 'add-url', type: 'input', props: { label: 'Direct product URL (optional)', bind: '/newWish/url', placeholder: 'https://www.amazon.in/dp/...' } },
          { id: 'add-image', type: 'input', props: { label: 'Product thumbnail image URL (optional)', bind: '/newWish/image', placeholder: 'https://...' } },
          { id: 'add-notes', type: 'textarea', props: { label: 'Personal notes or sale timing', bind: '/newWish/notes', placeholder: 'e.g. Wait for Diwali or Great Indian Festival sale discount', rows: 3 } },
          {
            id: 'add-button-bar',
            type: 'stack',
            props: { direction: 'horizontal', gap: 'sm' },
            children: ['add-save-btn', 'add-cancel-btn'],
          },
          { id: 'add-save-btn', type: 'button', props: { label: s.editingWishId ? 'Update wish' : 'Save wish', action: 'add_wish', style: 'primary' } },
          { id: 'add-cancel-btn', type: 'button', props: { label: 'Cancel', action: 'cancel_mode', style: 'secondary' } },
        ]
      : []),
    ...(isRecordMode
      ? [
          {
            id: 'record-card',
            type: 'card',
            props: { title: 'Log a price observation', subtitle: 'Record observed price, rating, delivery speed and current offer notes.' },
            children: ['record-form-stack'],
          },
          {
            id: 'record-form-stack',
            type: 'stack',
            props: { gap: 'sm' },
            children: ['record-item-select', 'record-price', 'record-store', 'record-rating', 'record-delivery', 'record-notes', 'record-button-bar'],
          },
          { id: 'record-item-select', type: 'select', props: { label: 'Tracked item', bind: '/newRecord/wishId', options: '{/wishOptions}' } },
          { id: 'record-price', type: 'input', props: { label: 'Observed price · INR', bind: '/newRecord/price', placeholder: '1299' } },
          { id: 'record-store', type: 'select', props: { label: 'Observed at merchant', bind: '/newRecord/store', options: '{/storeOptions}' } },
          { id: 'record-rating', type: 'input', props: { label: 'Store rating (e.g. 4.4)', bind: '/newRecord/rating', placeholder: '4.4' } },
          { id: 'record-delivery', type: 'input', props: { label: 'Delivery speed or date', bind: '/newRecord/deliveryInfo', placeholder: 'e.g. FREE delivery by Friday' } },
          { id: 'record-notes', type: 'input', props: { label: 'Current offer or coupon note', bind: '/newRecord/offerNotes', placeholder: 'e.g. Extra 10% instant discount on ICICI cards' } },
          {
            id: 'record-button-bar',
            type: 'stack',
            props: { direction: 'horizontal', gap: 'sm' },
            children: ['record-save-btn', 'record-cancel-btn'],
          },
          { id: 'record-save-btn', type: 'button', props: { label: 'Save observation', action: 'add_record', style: 'primary' } },
          { id: 'record-cancel-btn', type: 'button', props: { label: 'Cancel', action: 'cancel_mode', style: 'secondary' } },
        ]
      : []),
    ...(!isAddMode && !isRecordMode
      ? [
          {
            id: 'actions-bar',
            type: 'stack',
            props: { direction: 'horizontal', wrap: true, gap: 'sm', align: 'center' },
            children: ['btn-add-wish', 'btn-log-price', 'btn-advisor', 'btn-toggle-view'],
          },
          { id: 'btn-add-wish', type: 'button', props: { label: 'Add a wish', action: 'show_add', style: 'primary' } },
          { id: 'btn-log-price', type: 'button', props: { label: 'Log a price check', action: 'show_record', style: 'secondary' } },
          { id: 'btn-advisor', type: 'button', props: { label: 'Deal advisor', action: 'assistant.compose', payload: { path: 'advisorRequest', workflowPath: 'wishWorkflow' }, style: 'secondary' } },
          { id: 'btn-toggle-view', type: 'button', props: { label: '{/toggleViewLabel}', action: 'toggle_view_mode', style: 'secondary' } },
          {
            id: 'stats-grid',
            type: 'grid',
            props: { columns: 4, minItemWidth: 'sm', gap: 'sm' },
            children: ['stat-total', 'stat-deals', 'stat-savings', 'stat-observations'],
          },
          { id: 'stat-total', type: 'stat', props: { label: 'Tracked items', value: '{/statTotal}' } },
          { id: 'stat-deals', type: 'stat', props: { label: 'At or below target', value: '{/statDeals}', tone: '{/statDealsTone}' } },
          { id: 'stat-savings', type: 'stat', props: { label: 'Potential savings', value: '{/statSavings}', tone: '{/statSavingsTone}' } },
          { id: 'stat-observations', type: 'stat', props: { label: 'Price checks logged', value: '{/statChecks}' } },
          ...(topDeal
            ? [
                {
                  id: 'deal-spotlight',
                  type: 'card',
                  props: {
                    title: '{/dealSpotlightTitle}',
                    subtitle: '{/dealSpotlightSubtitle}',
                    body: '{/dealSpotlightBody}',
                    tone: 'success',
                    badge: 'Deal alert',
                  },
                  children: ['deal-spotlight-bar'],
                },
                {
                  id: 'deal-spotlight-bar',
                  type: 'stack',
                  props: { direction: 'horizontal', gap: 'sm', wrap: true },
                  children: ['btn-spotlight-advisor', 'btn-spotlight-history'],
                },
                { id: 'btn-spotlight-advisor', type: 'button', props: { label: 'Ask the deal advisor', action: 'assistant.compose', payload: { path: 'advisorRequest', workflowPath: 'wishWorkflow' }, style: 'primary' } },
                { id: 'btn-spotlight-history', type: 'button', props: { label: 'View price history', action: 'view.open', payload: { surface: 'history' }, style: 'secondary' } },
              ]
            : []),
          ...(viewingWish && currentOptions.length > 0
            ? [
                {
                  id: 'options-section',
                  type: 'section',
                  props: {
                    title: `Matching Models & Variants for "${viewingWish.title}"`,
                    description: 'Select an exact model to track, or close options to keep current selection.',
                  },
                  children: ['options-grid', 'options-close-btn'],
                },
                {
                  id: 'options-grid',
                  type: 'grid',
                  props: { columns: 3, minItemWidth: 'sm', gap: 'md' },
                  children: { each: '/productOptionsList', template: 'opt-card' },
                },
                {
                  id: 'opt-card',
                  type: 'card',
                  props: {
                    title: '{title}',
                    subtitle: '{priceFormatted}',
                    body: '{body}',
                    badge: '{badge}',
                    image: '{image}',
                    imageLayout: 'thumbnail',
                    titleLines: 2,
                  },
                  children: ['opt-select-btn'],
                },
                {
                  id: 'opt-select-btn',
                  type: 'button',
                  props: {
                    label: 'Track this model',
                    action: 'select_option',
                    payload: {
                      wishId: '{wishId}',
                      asin: '{asin}',
                      url: '{url}',
                      title: '{title}',
                      pricePaise: '{pricePaise}',
                      image: '{image}',
                    },
                    style: 'primary',
                  },
                },
                {
                  id: 'options-close-btn',
                  type: 'button',
                  props: { label: 'Close options', action: 'close_options', style: 'secondary' },
                },
              ]
            : []),
          ...(hasWishes
            ? [
                ...(isTableView
                  ? [
                      {
                        id: 'wishes-table-section',
                        type: 'section',
                        props: { title: 'Price comparison', description: 'Real observations and store comparisons recorded in local DuckDB.' },
                        children: ['wishes-table'],
                      },
                      {
                        id: 'wishes-table',
                        type: 'table',
                        props: {
                          columns: [
                            { key: 'title', label: 'Item' },
                            { key: 'category', label: 'Category' },
                            { key: 'store', label: 'Store' },
                            { key: 'target', label: 'Target', align: 'end' },
                            { key: 'latest', label: 'Latest price', align: 'end' },
                            { key: 'rating', label: 'Rating' },
                            { key: 'delivery', label: 'Delivery' },
                            { key: 'status', label: 'Status' },
                            { key: 'date', label: 'Last checked' },
                          ],
                          rows: '{/wishesTable}',
                          sortable: true,
                          searchable: true,
                          pageSize: 10,
                        },
                      },
                    ]
                  : [
                      {
                        id: 'wishes-cards-section',
                        type: 'section',
                        props: { title: 'Wishlist', description: 'Tracked items with target thresholds, verified merchant observations and delivery details.' },
                        children: ['wishes-grid'],
                      },
                      {
                        id: 'wishes-grid',
                        type: 'grid',
                        props: { columns: 3, minItemWidth: 'sm', gap: 'md' },
                        children: { each: '/cards', template: 'wc-card' },
                      },
                      {
                        id: 'wc-card',
                        type: 'card',
                        props: {
                          title: '{title}',
                          subtitle: '{subtitle}',
                          body: '{body}',
                          badge: '{badge}',
                          tone: '{tone}',
                          image: '{image}',
                          imageLayout: 'thumbnail',
                          titleLines: 2,
                        },
                        children: ['wc-actions'],
                      },
                      {
                        id: 'wc-actions',
                        type: 'stack',
                        props: { direction: 'horizontal', gap: 'sm', wrap: true },
                        children: ['wc-check', 'wc-options', 'wc-record', 'wc-trend', 'wc-edit', 'wc-delete'],
                      },
                      { id: 'wc-check', type: 'button', props: { label: '{checkLabel}', action: 'check_amazon', payload: { id: '{id}' }, style: '{checkStyle}' } },
                      { id: 'wc-options', type: 'button', props: { label: '{optionsLabel}', action: 'show_options', payload: { id: '{id}' }, style: 'secondary', visibleIf: '{hasOptions}' } },
                      { id: 'wc-record', type: 'button', props: { label: 'Record price', action: 'show_record', payload: { id: '{id}' }, style: 'secondary' } },
                      { id: 'wc-trend', type: 'button', props: { label: 'View history', action: 'select_wish', payload: { id: '{id}' }, style: 'secondary' } },
                      { id: 'wc-edit', type: 'button', props: { label: 'Edit', action: 'show_edit', payload: { id: '{id}' }, style: 'secondary' } },
                      { id: 'wc-delete', type: 'button', props: { label: 'Remove', action: 'ask_delete', payload: { id: '{id}' }, style: 'link' } },
                    ]),
              ]
            : [
                {
                  id: 'empty-card',
                  type: 'card',
                  props: {
                    title: 'No wishes tracked yet',
                    body: 'Add your first wish with a target price in INR. Track price drops, rises, ratings, delivery speed and deals privately without third-party subscriptions or automated scraping.',
                  },
                  children: ['empty-add-btn'],
                },
                { id: 'empty-add-btn', type: 'button', props: { label: 'Add your first wish', action: 'show_add', style: 'primary' } },
              ]),
          ...(hasSelectedObservations
            ? [
                {
                  id: 'trend-deepdive-section',
                  type: 'section',
                  props: { title: '{/selectedTrendTitle}', description: '{/selectedTrendDesc}' },
                  children: ['trend-stats-grid', ...(l.selectedWishSummary && l.selectedWishSummary.storeComparisons.length > 1 ? ['store-compare-table'] : []), 'trend-chart'],
                },
                {
                  id: 'trend-stats-grid',
                  type: 'grid',
                  props: { columns: 4, minItemWidth: 'sm', gap: 'sm' },
                  children: ['ts-latest', 'ts-target', 'ts-low', 'ts-diff'],
                },
                { id: 'ts-latest', type: 'stat', props: { label: 'Latest observed price', value: '{/selectedLatest}' } },
                { id: 'ts-target', type: 'stat', props: { label: 'Your target price', value: '{/selectedTarget}' } },
                { id: 'ts-low', type: 'stat', props: { label: 'All-time low', value: '{/selectedLow}' } },
                { id: 'ts-diff', type: 'stat', props: { label: 'Difference from target', value: '{/selectedDiff}', tone: '{/selectedDiffTone}' } },
                ...(l.selectedWishSummary && l.selectedWishSummary.storeComparisons.length > 1
                  ? [
                      {
                        id: 'store-compare-table',
                        type: 'table',
                        props: {
                          columns: [
                            { key: 'store', label: 'Store or seller' },
                            { key: 'price', label: 'Latest price', align: 'end' },
                            { key: 'spread', label: 'Difference from lowest', align: 'end' },
                            { key: 'delivery', label: 'Delivery' },
                            { key: 'stock', label: 'Stock' },
                            { key: 'date', label: 'Checked' },
                          ],
                          rows: '{/selectedCompareRows}',
                        },
                      },
                    ]
                  : []),
                {
                  id: 'trend-chart',
                  type: 'chart',
                  props: {
                    kind: 'line',
                    title: l.selectedWishSummary?.wish.targetPaise != null ? 'Price against target over time · INR' : 'Price over time · INR',
                    series: {
                      records: '{/trendRecords}',
                      label: 'date',
                      fields: l.selectedWishSummary?.wish.targetPaise != null ? ['price', 'target'] : ['price'],
                    },
                    height: 'md',
                  },
                },
              ]
            : []),
          ...(s.confirmDeleteId
            ? [
                {
                  id: 'delete-confirm-card',
                  type: 'card',
                  props: { title: 'Remove item and delete observations?', body: 'This removes the item and all its logged price history.', tone: 'danger' },
                  children: ['delete-confirm-bar'],
                },
                {
                  id: 'delete-confirm-bar',
                  type: 'stack',
                  props: { direction: 'horizontal', gap: 'sm' },
                  children: ['btn-delete-confirm', 'btn-delete-cancel'],
                },
                { id: 'btn-delete-confirm', type: 'button', props: { label: 'Delete wish', action: 'confirm_delete', style: 'danger' } },
                { id: 'btn-delete-cancel', type: 'button', props: { label: 'Keep wish', action: 'cancel_delete', style: 'secondary' } },
              ]
            : []),
        ]
      : []),
  ];

  // Dedicated broadcast programme and TTS spoken copy
  const prog = generateProgramme(s, l, now);
  const spokenBulletin = prog.segments.map((x) => x.text).join(' ');

  // Selected item metrics
  const sel = l.selectedWishSummary;
  const selTarget = sel?.wish.targetPaise;
  const selLatest = sel?.latestPricePaise;
  const selDiff = selLatest != null && selTarget != null ? selLatest - selTarget : 0;

  const data: Record<string, unknown> = {
    newWish: s.newWish,
    newRecord: s.newRecord,
    categoryOptions: CATEGORIES.map((c) => ({ label: c, value: c })),
    storeOptions: STORES.map((st) => ({ label: st, value: st })),
    wishOptions: s.wishes!.map((w) => ({ label: w.title, value: w.id })),
    statTotal: String(s.wishes!.length),
    statDeals: String(l.targetMetCount),
    statDealsTone: l.targetMetCount > 0 ? 'success' : 'neutral',
    statSavings: formatInr(l.totalSavingsPaise),
    statSavingsTone: l.totalSavingsPaise > 0 ? 'success' : 'neutral',
    statChecks: String(l.totalObservations),
    toggleViewLabel: isTableView ? 'Show as cards' : 'Show as table',
    problemText: s.problem ?? '',
    spoken: {
      programme: prog,
      bulletin: spokenBulletin,
    },
    dealSpotlightTitle: topDeal ? `Deal Alert: ${topDeal.wish.title} is at or below your target` : '',
    dealSpotlightSubtitle: topDeal ? `Last recorded on ${topDeal.latestStore} for ${formatInr(topDeal.latestPricePaise ?? 0)}${topDeal.wish.targetPaise != null ? ` (Target: ${formatInr(topDeal.wish.targetPaise)})` : ''}` : '',
    dealSpotlightBody: topDeal ? `You save ${formatInr(topDeal.savingsPaise)}! ${topDeal.rating ? `Store rating: ${topDeal.rating} / 5. ` : ''}${topDeal.deliveryInfo ? `Delivery: ${topDeal.deliveryInfo}. ` : ''}Review with Deal Advisor or inspect historical trends.` : '',
    advisorRequest: advisorRequest(s, l),
    wishWorkflow,
    cards: l.summaries.map((sm) => {
      const targetDiff = sm.latestPricePaise != null && sm.wish.targetPaise != null ? sm.latestPricePaise - sm.wish.targetPaise : null;
      const lines: string[] = [];

      if (sm.latestPricePaise != null) {
        if (sm.wish.targetPaise != null) {
          const diffText =
            targetDiff != null
              ? targetDiff <= 0
                ? ` (Save ${formatInr(-targetDiff)})`
                : ` (+${formatInr(targetDiff)} above target)`
              : '';
          lines.push(`Target: ${formatInr(sm.wish.targetPaise)} · Latest: ${formatInr(sm.latestPricePaise)} on ${sm.latestStore}${diffText}`);
        } else {
          lines.push(`Latest: ${formatInr(sm.latestPricePaise)} on ${sm.latestStore} (No target set)`);
        }
      } else {
        if (sm.wish.targetPaise != null) {
          lines.push(`Target: ${formatInr(sm.wish.targetPaise)} · No observations recorded yet`);
        } else {
          lines.push('No target set · No observations recorded yet');
        }
      }

      if (!sm.wish.url) {
        if (sm.wish.store === 'Amazon.in') {
          const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(sm.wish.title)}`;
          lines.push(`[Search on Amazon](${searchUrl}) · Click "Find Online" to discover matching models & live prices`);
        } else {
          lines.push('No link set · Edit this wish to add a direct product link');
        }
      }

      const details: string[] = [];
      if (sm.deliveryInfo) details.push(`Delivery: ${sm.deliveryInfo}`);
      if (sm.pincode) details.push(`PIN: ${sm.pincode}`);
      if (sm.rating) details.push(`Rating: ${sm.rating} / 5${sm.ratingCount ? ` (${sm.ratingCount} reviews)` : ''}`);
      if (details.length > 0) lines.push(details.join(' · '));

      if (sm.cheapestStore && sm.storeComparisons.length > 1) {
        lines.push(`Best Price: ${sm.cheapestStore} at ${formatInr(sm.cheapestPaise ?? 0)}`);
      }
      if (sm.latestOffer) {
        lines.push(`Offer: ${sm.latestOffer}`);
      }
      lines.push(sm.inStock == null ? 'Availability not checked' : sm.inStock ? 'In stock at last observation' : 'Unavailable at last observation');

      const options = s.productOptions?.[sm.wish.id] || [];
      const hasOptions = options.length > 0;

      return {
        id: sm.wish.id,
        title: sm.wish.title,
        subtitle: `${sm.wish.store} · ${sm.wish.category}`,
        body: lines.join('\n'),
        badge: sm.statusLabel,
        tone: sm.statusTone,
        image: sm.wish.image || '',
        checkLabel: sm.wish.url ? 'Check price' : sm.wish.store === 'Amazon.in' ? 'Find online' : 'Check link',
        checkStyle: sm.wish.url ? 'secondary' : 'primary',
        optionsLabel: `Compare variants (${options.length})`,
        hasOptions: hasOptions ? 'true' : '',
        optionsCount: String(options.length),
        hasAmazonUrl: sm.wish.url && sm.wish.url.includes('amazon.') ? 'true' : '',
      };
    }),
    productOptionsList: (s.productOptions?.[s.viewingOptionsWishId || ''] || []).map((opt) => ({
      wishId: s.viewingOptionsWishId,
      asin: opt.asin,
      url: opt.url,
      title: opt.title,
      priceFormatted: opt.priceFormatted,
      pricePaise: opt.pricePaise,
      image: opt.image || '',
      badge: opt.rating ? `⭐ ${opt.rating} / 5` : 'Discovered model',
      body: `Search listing: ${opt.priceFormatted}\nDirect Amazon.in link\nSelect this product, then check its current price. Stock and delivery are not verified.`,
    })),
    wishesTable: l.summaries.map((sm) => ({
      id: sm.wish.id,
      title: sm.wish.title,
      category: sm.wish.category,
      store: sm.latestStore,
      target: sm.wish.targetPaise != null ? formatInr(sm.wish.targetPaise) : '—',
      latest: sm.latestPricePaise != null ? formatInr(sm.latestPricePaise) : '—',
      rating: sm.rating ? `${sm.rating} / 5` : '—',
      delivery: sm.deliveryInfo || 'Standard',
      status: sm.statusLabel,
      date: sm.latestDate ? sm.latestDate.slice(0, 10) : 'None',
    })),
    // Trend Deep Dive Section
    selectedTrendTitle: sel ? `Price Trend & Store Comparison: ${sel.wish.title}` : 'Price trend',
    selectedTrendDesc: sel ? (sel.wish.targetPaise != null ? `Historical price observations against your ${formatInr(sel.wish.targetPaise)} target threshold.` : 'Historical price observations and retailer comparisons.') : '',
    selectedLatest: selLatest != null ? formatInr(selLatest) : '—',
    selectedTarget: sel?.wish.targetPaise != null ? formatInr(sel.wish.targetPaise) : '—',
    selectedLow: sel?.minPricePaise != null ? formatInr(sel.minPricePaise) : '—',
    selectedDiff: selLatest != null && sel?.wish.targetPaise != null ? `${selDiff <= 0 ? '-' : '+'}${formatInr(Math.abs(selDiff))}` : '—',
    selectedDiffTone: selDiff <= 0 ? 'success' : 'danger',
    trendRecords: l.selectedChartRecords,
    selectedCompareRows: (sel?.storeComparisons ?? []).map((sc) => ({
      store: sc.store,
      price: formatInr(sc.pricePaise),
      spread: sc.diffPaise === 0 ? 'Lowest Price' : `+${formatInr(sc.diffPaise)}`,
      delivery: sc.deliveryInfo || 'Not checked',
      stock: sc.inStock == null ? 'Not checked' : sc.inStock ? 'In stock' : 'Out of stock',
      date: sc.recordedAt.slice(0, 10),
    })),
  };

  return { surface: 'overview', nodes, data: replaceAll(data) };
}

function historySurface(_s: State, l: LedgerData): Update {
  const hasHistory = l.recentObservations.length > 0;

  const nodes: Node[] = [
    {
      id: 'root',
      type: 'stack',
      props: { gap: 'md' },
      children: ['history-bar', hasHistory ? 'history-table' : 'history-empty'],
    },
    {
      id: 'history-bar',
      type: 'stack',
      props: { direction: 'horizontal', wrap: true, gap: 'sm', align: 'center' },
      children: ['btn-back-overview', 'btn-export-csv'],
    },
    { id: 'btn-back-overview', type: 'button', props: { label: 'Back to overview', action: 'view.open', payload: { surface: 'overview' }, style: 'secondary' } },
    { id: 'btn-export-csv', type: 'button', props: { label: 'Export history (CSV)', action: 'file.save', payload: { name: 'wish-radar-prices', text: '/exportCsv' }, style: 'secondary' } },
    ...(hasHistory
      ? [
          {
            id: 'history-table',
            type: 'table',
            props: {
              columns: [
                { key: 'date', label: 'Date' },
                { key: 'item', label: 'Item' },
                { key: 'store', label: 'Store' },
                { key: 'price', label: 'Price', align: 'end' },
                { key: 'rating', label: 'Rating' },
                { key: 'delivery', label: 'Delivery speed' },
                { key: 'pincode', label: 'PIN' },
                { key: 'stock', label: 'In stock' },
                { key: 'notes', label: 'Offers and notes' },
              ],
              rows: '{/historyRows}',
              sortable: true,
              searchable: true,
              pageSize: 15,
            },
          },
        ]
      : [
          {
            id: 'history-empty',
            type: 'text',
            props: { content: 'No price checks recorded yet. Observations you log or check appear here in chronological order.', variant: 'caption' },
          },
        ]),
  ];

  // CSV export representation
  const csvHeader = 'date,item,store,price_inr,rating,delivery,pincode,in_stock,notes\n';
  const csvLines = l.recentObservations.map((r) =>
    `"${r.recordedAt.slice(0, 19)}","${r.wishTitle.replace(/"/g, '""')}","${r.store}",${(r.pricePaise / 100).toFixed(2)},${r.rating ?? ''},"${(r.deliveryInfo ?? '').replace(/"/g, '""')}","${r.pincode ?? ''}",${r.inStock == null ? '' : r.inStock ? 'yes' : 'no'},"${r.offerNotes.replace(/"/g, '""')}"`
  ).join('\n');

  const data: Record<string, unknown> = {
    exportCsv: csvHeader + csvLines,
    historyRows: l.recentObservations.map((r) => ({
      id: r.id,
      date: r.recordedAt.slice(0, 10),
      item: r.wishTitle,
      store: r.store,
      price: formatInr(r.pricePaise),
      rating: r.rating ? `${r.rating} / 5` : '—',
      delivery: r.deliveryInfo || '—',
      pincode: r.pincode || '—',
      stock: r.inStock == null ? 'Not checked' : r.inStock ? 'Yes' : 'No',
      notes: r.offerNotes || '—',
    })),
  };

  return { surface: 'history', nodes, data: replaceAll(data) };
}

function importSurface(s: State, l: LedgerData): Update {
  const EXAMPLE = 'title,targetPrice,category,store,url,image\nSony WH-1000XM5,20000,Electronics,Amazon.in,https://www.amazon.in/dp/B09XS7JWHH,https://m.media-amazon.com/images/I/61O3iMlnJIL._SL1500_.jpg\nMinimalist Vitamin C Serum,650,Beauty & Personal Care,Nykaa,https://www.nykaa.com/...,https://...';

  const customStores = (s.stores || []).filter((x) => x.isCustom);
  const activeStores = (s.stores || []).filter((x) => x.enabled);

  const nodes: Node[] = [
    {
      id: 'root',
      type: 'stack',
      props: { gap: 'md' },
      children: [
        'import-header-bar',
        'retailers-section',
        'import-section',
        'format-section',
        'network-section',
        ...(l.totalObservations > 0 ? ['clear-section'] : []),
      ],
    },
    {
      id: 'import-header-bar',
      type: 'stack',
      props: { direction: 'horizontal', gap: 'sm' },
      children: ['btn-import-back'],
    },
    { id: 'btn-import-back', type: 'button', props: { label: 'Back to overview', action: 'view.open', payload: { surface: 'overview' }, style: 'secondary' } },
    {
      id: 'retailers-section',
      type: 'section',
      props: {
        title: 'Merchant preferences',
        description: '{/sandboxSummary}',
      },
      children: ['stores-grid', 'add-store-card'],
    },
    {
      id: 'stores-grid',
      type: 'grid',
      props: { columns: 3, minItemWidth: 'sm', gap: 'md' },
      children: { each: '/storesList', template: 'store-card' },
    },
    {
      id: 'store-card',
      type: 'card',
      props: {
        title: '{name}',
        subtitle: '{subtitle}',
        badge: '{statusBadge}',
        tone: '{statusTone}',
        body: '{healthLine}',
      },
      children: ['store-actions'],
    },
    {
      id: 'store-actions',
      type: 'stack',
      props: { direction: 'horizontal', gap: 'sm', wrap: true },
      children: ['store-toggle-btn', 'store-test-btn', 'store-remove-btn'],
    },
    { id: 'store-toggle-btn', type: 'button', props: { label: '{toggleLabel}', action: 'toggle_store', payload: { id: '{id}' }, style: '{toggleStyle}' } },
    { id: 'store-test-btn', type: 'button', props: { label: 'Test connection', action: 'test_store', payload: { id: '{id}' }, style: 'secondary' } },
    { id: 'store-remove-btn', type: 'button', props: { label: 'Remove', action: 'remove_store', payload: { id: '{id}' }, style: 'link', visibleIf: '{isCustom}' } },

    {
      id: 'add-store-card',
      type: 'card',
      props: {
        title: 'Allow a merchant or domain',
        subtitle: 'Add an Indian shopping destination or direct store domain for live price checks.',
      },
      children: ['add-store-stack'],
    },
    {
      id: 'add-store-stack',
      type: 'stack',
      props: { gap: 'sm' },
      children: ['add-store-name', 'add-store-domain', 'add-store-cat', 'add-store-btn-bar'],
    },
    { id: 'add-store-name', type: 'input', props: { label: 'Store name', bind: '/newStore/name', placeholder: 'e.g. boAt Lifestyle or Myntra' } },
    { id: 'add-store-domain', type: 'input', props: { label: 'Store domain or URL', bind: '/newStore/domain', placeholder: 'e.g. boat-lifestyle.com' } },
    { id: 'add-store-cat', type: 'select', props: { label: 'Category', bind: '/newStore/category', options: '{/storeCatOptions}' } },
    {
      id: 'add-store-btn-bar',
      type: 'stack',
      props: { direction: 'horizontal', gap: 'sm', align: 'center' },
      children: ['btn-add-store', 'btn-restore-stores'],
    },
    { id: 'btn-add-store', type: 'button', props: { label: 'Add merchant', action: 'add_store', style: 'primary' } },
    { id: 'btn-restore-stores', type: 'button', props: { label: 'Restore default stores', action: 'restore_stores', style: 'link' } },

    {
      id: 'import-section',
      type: 'section',
      props: { title: 'Import wishes and items', description: '{/receipt}' },
      children: ['import-text', 'import-bar'],
    },
    { id: 'import-text', type: 'textarea', props: { label: 'Paste CSV or JSON', bind: '/importText', placeholder: EXAMPLE, rows: 8 } },
    {
      id: 'import-bar',
      type: 'stack',
      props: { direction: 'horizontal', gap: 'sm' },
      children: ['btn-run-import'],
    },
    { id: 'btn-run-import', type: 'button', props: { label: 'Import items', action: 'import_records', style: 'primary' } },
    {
      id: 'format-section',
      type: 'section',
      props: { title: 'Format and privacy' },
      children: ['format-description', 'format-example', 'privacy-note'],
    },
    { id: 'format-description', type: 'text', props: { content: 'Import a CSV with **title, targetPrice, category, store, url, image** or a JSON array of wishes. Prices are in Indian Rupees.' } },
    { id: 'format-example', type: 'text', props: { content: EXAMPLE, variant: 'code' } },
    { id: 'privacy-note', type: 'text', props: { content: 'All records stay in your private local DuckDB file on this computer. No third-party APIs, no credentials, no tracking.', variant: 'caption' } },
    {
      id: 'network-section',
      type: 'section',
      props: { title: 'Network access', description: 'Public web price checks use the governed Web pages integration without third-party subscriptions.' },
      children: ['network-info'],
    },
    {
      id: 'network-info',
      type: 'text',
      props: {
        content: 'Wish Radar accesses online stores through Vakyartha\'s governed **Web pages** sandbox integration. No cookies, session tokens or personal account logins are ever transmitted.',
        variant: 'caption',
      },
    },
    ...(l.totalObservations > 0
      ? [
          {
            id: 'clear-section',
            type: 'section',
            props: { title: 'Database management', description: '{/ledgerSize}' },
            children: [s.confirmClear ? 'confirm-clear-card' : 'btn-ask-clear'],
          },
          ...(s.confirmClear
            ? [
                {
                  id: 'confirm-clear-card',
                  type: 'card',
                  props: { title: 'Clear all price observations?', body: 'This removes all logged price history from DuckDB. Your wishlist items are preserved.', tone: 'danger' },
                  children: ['clear-button-stack'],
                },
                {
                  id: 'clear-button-stack',
                  type: 'stack',
                  props: { direction: 'horizontal', gap: 'sm' },
                  children: ['btn-confirm-clear', 'btn-cancel-clear'],
                },
                { id: 'btn-confirm-clear', type: 'button', props: { label: 'Delete all observations', action: 'clear_all', style: 'danger' } },
                { id: 'btn-cancel-clear', type: 'button', props: { label: 'Keep observations', action: 'cancel_clear', style: 'secondary' } },
              ]
            : [
                { id: 'btn-ask-clear', type: 'button', props: { label: 'Delete all logged observations', action: 'ask_clear', style: 'link' } },
              ]),
        ]
      : []),
  ];

  const data: Record<string, unknown> = {
    importText: s.importText ?? '',
    receipt: s.lastImport ? `Last import: ${s.lastImport.count} item(s) on ${s.lastImport.at.slice(0, 10)}.` : 'No external imports yet. Use your own CSV/JSON records.',
    sandboxSummary: `${(s.stores || []).filter((x) => x.enabled).length} of ${(s.stores || []).length} merchant preferences enabled · Host permissions still apply`,
    storesList: (s.stores || []).map((st) => ({
      id: st.id,
      name: st.name,
      subtitle: `${st.domain} · ${st.category}`,
      statusBadge: st.enabled ? (st.error ? 'Notice' : (st.status === 'active' ? 'Page readable' : 'Configured')) : 'Disabled',
      statusTone: st.enabled ? (st.error ? (st.error.includes('Requires') ? 'caution' : 'neutral') : (st.status === 'active' ? 'success' : 'neutral')) : 'neutral',
      healthLine: st.error
        ? `Status: ${st.error}`
        : st.lastChecked
        ? `Homepage readable (${st.latencyMs ? `${st.latencyMs}ms` : 'OK'}) · ${st.lastChecked.slice(0, 10)} · Product prices not verified`
        : st.searchSupported
        ? 'Amazon search parsing available · Live access unverified'
        : 'Direct product link required · Live prices unverified',
      toggleLabel: st.enabled ? 'Disable' : 'Enable',
      toggleStyle: st.enabled ? 'secondary' : 'primary',
      isCustom: st.isCustom ? 'true' : '',
    })),
    newStore: s.newStore,
    storeCatOptions: [
      { label: 'General & Electronics', value: 'General & Electronics' },
      { label: 'Electronics & Appliances', value: 'Electronics & Appliances' },
      { label: 'Beauty & Personal Care', value: 'Beauty & Personal Care' },
      { label: 'Fashion & Luxury', value: 'Fashion & Luxury' },
      { label: 'Other', value: 'Other' },
    ],
    ...(l.totalObservations > 0 ? { ledgerSize: `${l.totalObservations} logged price observation(s) across ${s.wishes!.length} item(s).` } : {}),
  };

  return { surface: 'import', nodes, data: replaceAll(data) };
}

/** The shipped surface.json: every view of a new, empty app */
export const surfaceFile = (now = new Date(Date.now())) =>
  view(normalize({}, now), { totalObservations: 0, summaries: [], recentObservations: [], targetMetCount: 0, totalSavingsPaise: 0, selectedChartRecords: [] }, now).map((u) => ({
    id: u.surface,
    title: TITLES[u.surface] ?? u.surface,
    data: u.data[0]!.value,
    nodes: u.nodes,
  }));

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) { const now=context.now?.()??new Date();const state=normalize(context.state,now);return {updates:view(state,await load(context.database,state.wishes!,state.activeWishId),now)}; }
