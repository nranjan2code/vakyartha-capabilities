// Personal Finance Workbench model: exact parsing, canonical state and the one
// ledger read every view derives from. DuckDB `ledger` owns transactions as
// signed integer paise; `context.state` owns limits, recurring items and drafts.

export interface Database { run(sql: string, values?: (string | number | null)[]): Promise<void>; query(sql: string, values?: (string | number | null)[]): Promise<Record<string, unknown>[]> }
/** The editor's draft: amount is typed unsigned and `kind` gives its sign. */
export interface Entry { kind: 'out' | 'in'; amount: string; date: string; description: string; category: string; newCategory: string }
export interface Recurring { id: string; description: string; category: string; paise: number; day: number }
export interface RecDraft { kind: 'out' | 'in'; amount: string; description: string; category: string; newCategory: string; day: string }
export interface State {
  month?: string; budget?: string; budgets?: Record<string, number>; limit?: { category: string; amount: string };
  draft?: Entry; editId?: string; edit?: Entry; confirmDelete?: boolean;
  recurring?: Recurring[]; rec?: RecDraft; recId?: string;
  importText?: string; lastImport?: { at: string; count: number }; confirmClear?: boolean;
  seq?: number; notice?: string;
}
export interface Context { state: State; surfaces?: Record<string, unknown>; database: Database; now?: () => Date; appRevision?: number }
export interface Transaction { id: string; date: string; description: string; category: string; amount: string }
export interface Row { id: string; date: string; description: string; category: string; paise: number }
/** What one run reads from DuckDB for the selected month. Chart amounts are rupees. */
export interface Ledger {
  total: number; months: string[]; rows: Row[];
  categories: { label: string; amount: number }[]; daily: { date: string; net: number }[];
  monthly: { label: string; moneyIn: number; moneyOut: number }[];
  previous: { label: string; amount: number }[]; previousIn: number;
  payees: { description: string; count: number; amount: number }[];
  stack: { month: string; category: string; amount: number }[];
  allCategories: string[]; posted: string[];
}
export interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
export interface Update { surface: string; nodes: Node[]; data: { op: 'replace'; path: '/'; value: Record<string, unknown> }[] }

export const MAX_IMPORT = 200, MAX_LEDGER = 5000, MAX_TEXT = 50_000, MAX_RECURRING = 50, MAX_LIMITS = 60;
export const ALL = '*';
export const EMPTY_LEDGER: Ledger = { total: 0, months: [], rows: [], categories: [], daily: [], monthly: [], previous: [], previousIn: 0, payees: [], stack: [], allCategories: [], posted: [] };
export const replaceAll = (value: Record<string, unknown>) => [{ op: 'replace' as const, path: '/' as const, value }];

// --- exact parsing -----------------------------------------------------------------

export function paise(value: unknown): number {
  if (typeof value !== 'string' || !/^-?\d{1,9}(?:\.\d{1,2})?$/.test(value)) throw new Error('Amounts must be decimals with at most two places, like -1250.50');
  const sign = value.startsWith('-') ? -1 : 1, [whole, decimal = ''] = value.replace(/^-/, '').split('.');
  const result = sign * (Number(whole) * 100 + Number(decimal.padEnd(2, '0')));
  if (!Number.isSafeInteger(result)) throw new Error('Amount exceeds the supported range');
  return result;
}
/** Unsigned paise as an exact decimal string, the form drafts and exports use. */
export const decimal = (p: number) => `${p < 0 ? '-' : ''}${Math.floor(Math.abs(p) / 100)}.${String(Math.abs(p) % 100).padStart(2, '0')}`;
/** A typed amount (digit grouping and the rupee sign allowed) as positive paise. */
export function typedPaise(amount: string): number {
  let p = 0;
  try { p = paise(amount.replace(/[,\s₹]/g, '')); } catch { /* reported below */ }
  if (p <= 0) throw new Error('Enter an amount above zero with at most two decimals, like 250 or 1250.50');
  return p;
}
export const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
/** The person's calendar day, read from their clock. */
export const localDay = (now: Date) => new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
export const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const shiftMonth = (month: string, by: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7);

/** Minimal RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines. */
function csv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch; }
    else if (ch === '"' && !field) quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (quoted) throw new Error('A quoted CSV field is not closed');
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}
const quote = (v: string) => /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
/** The month's rows in the import format, so an export can be imported elsewhere. */
export const toCsv = (rows: Row[]) => ['id,date,description,category,amount', ...rows.map((r) => [r.id, r.date, quote(r.description), quote(r.category), decimal(r.paise)].join(','))].join('\n');

/** A JSON array or a CSV with an id,date,description,category,amount header, validated as one batch. */
export function records(text: string): Transaction[] {
  const trimmed = text.trim();
  let rows: Record<string, unknown>[];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('JSON must be an array of transactions');
    rows = parsed;
  } else {
    const [header, ...body] = csv(trimmed);
    const keys = (header ?? []).map((h) => h.trim().toLowerCase());
    for (const k of ['id', 'date', 'description', 'category', 'amount']) if (!keys.includes(k)) throw new Error('CSV needs a header with id, date, description, category and amount');
    rows = body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
  }
  if (!rows.length || rows.length > MAX_IMPORT) throw new Error(`Import 1–${MAX_IMPORT} transactions at a time`);
  const ids = new Set<string>();
  return rows.map((r, i) => {
    const at = `Row ${i + 1}: `;
    if (!r || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(r.id) || ids.has(r.id)) throw new Error(`${at}IDs must be unique letters, digits, _ or -`);
    ids.add(r.id);
    if (!isDay(r.date)) throw new Error(`${at}use a real YYYY-MM-DD date`);
    if (typeof r.description !== 'string' || !r.description.trim() || r.description.length > 200 || typeof r.category !== 'string' || !r.category.trim() || r.category.length > 60) throw new Error(`${at}needs a description and a category`);
    try { if (paise(r.amount) === 0) throw new Error('Zero amounts are not imported'); } catch (e) { throw new Error(`${at}${(e as Error).message}`); }
    return { id: r.id, date: r.date, description: r.description.trim(), category: r.category.trim(), amount: r.amount as string };
  });
}

// --- canonical state -----------------------------------------------------------------

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const text = (v: unknown, max: number) => typeof v === 'string' ? v.slice(0, max) : '';
const kind = (v: unknown) => v === 'in' ? 'in' as const : 'out' as const;
const obj = (v: unknown) => (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
const entry = (v: unknown, today: string): Entry => { const x = obj(v); return { kind: kind(x.kind), amount: text(x.amount, 20), date: isDay(x.date) ? x.date : today, description: text(x.description, 200), category: text(x.category, 60), newCategory: text(x.newCategory, 60) }; };
const amount = (v: unknown) => Number.isSafeInteger(v) && (v as number) !== 0 ? v as number : 0;

export function normalize(s: State, now = new Date()): State {
  const today = localDay(now), old = s as State & { lastCount?: unknown };
  const lastImport = s.lastImport && typeof s.lastImport === 'object' ? s.lastImport
    : typeof s.lastImport === 'string' && Number.isInteger(old.lastCount) ? { at: s.lastImport, count: old.lastCount as number } : undefined;
  const recurring = (Array.isArray(s.recurring) ? s.recurring : []).slice(0, MAX_RECURRING).flatMap((r): Recurring[] => {
    const x = obj(r), description = text(x.description, 200).trim(), category = text(x.category, 60).trim();
    return typeof x.id === 'string' && /^r\d+$/.test(x.id) && description && category && amount(x.paise) && Number.isInteger(x.day) && (x.day as number) >= 1 && (x.day as number) <= 31
      ? [{ id: x.id, description, category, paise: x.paise as number, day: x.day as number }] : [];
  });
  const editId = typeof s.editId === 'string' && s.editId ? s.editId.slice(0, 80) : '', recId = recurring.some((r) => r.id === s.recId) ? s.recId! : '';
  const rec = obj(s.rec), limit = obj(s.limit);
  return {
    month: typeof s.month === 'string' && MONTH.test(s.month) ? s.month : today.slice(0, 7),
    budget: typeof s.budget === 'string' && s.budget !== '0' ? s.budget.slice(0, 20) : '',
    budgets: Object.fromEntries(Object.entries(obj(s.budgets)).filter(([k, v]) => k.trim() && k.length <= 60 && amount(v) > 0).slice(0, MAX_LIMITS)) as Record<string, number>,
    limit: { category: text(limit.category, 60) || ALL, amount: text(limit.amount, 20) },
    draft: entry(s.draft, today),
    editId, ...(editId ? { edit: entry(s.edit, today) } : {}), confirmDelete: Boolean(editId) && s.confirmDelete === true,
    recurring, recId,
    rec: { kind: kind(rec.kind), amount: text(rec.amount, 20), description: text(rec.description, 200), category: text(rec.category, 60), newCategory: text(rec.newCategory, 60), day: text(rec.day, 2) || '1' },
    importText: typeof s.importText === 'string' ? s.importText.slice(0, MAX_TEXT) : '',
    ...(lastImport && typeof lastImport.at === 'string' && Number.isInteger(lastImport.count) ? { lastImport: { at: lastImport.at, count: lastImport.count } } : {}),
    confirmClear: s.confirmClear === true,
    seq: Number.isSafeInteger(s.seq) && s.seq! >= 0 ? s.seq : 0,
    notice: text(s.notice, 300),
  };
}

// --- the ledger read -------------------------------------------------------------------

export async function initialize(db: Database) {
  await db.run('CREATE TABLE IF NOT EXISTS ledger(id VARCHAR PRIMARY KEY, date VARCHAR, description VARCHAR, category VARCHAR, paise BIGINT)');
}
export const count = async (db: Database) => Number((await db.query('SELECT count(*)::INTEGER AS n FROM ledger'))[0]!.n);

/** Every figure the views need for `month`; `thisMonth` is the calendar month recurring items post into. */
export async function load(db: Database, month: string, thisMonth = month): Promise<Ledger> {
  await initialize(db);
  const total = await count(db);
  if (!total) return EMPTY_LEDGER;
  const q = async (sql: string, values: string[] = []) => db.query(sql, values);
  const IN = 'sum(CASE WHEN paise>0 THEN paise ELSE 0 END)::DOUBLE/100', OUT = 'sum(CASE WHEN paise<0 THEN -paise ELSE 0 END)::DOUBLE/100', M = 'substr(date,1,7)';
  const months = (await q(`SELECT DISTINCT ${M} AS m FROM ledger ORDER BY m DESC`)).map((r) => String(r.m));
  const rows = (await q(`SELECT id,date,description,category,paise::DOUBLE AS paise FROM ledger WHERE ${M}=? ORDER BY date DESC,id`, [month])).map((r) => ({ id: String(r.id), date: String(r.date), description: String(r.description), category: String(r.category), paise: Number(r.paise) }));
  const spending = async (m: string) => (await q(`SELECT category AS label, ${OUT} AS amount FROM ledger WHERE ${M}=? AND paise<0 GROUP BY category ORDER BY amount DESC, label`, [m])).map((r) => ({ label: String(r.label), amount: Number(r.amount) }));
  const before = shiftMonth(month, -1);
  const categories = await spending(month), previous = await spending(before);
  const previousIn = Number((await q(`SELECT coalesce(${IN},0) AS i FROM ledger WHERE ${M}=?`, [before]))[0]!.i);
  const daily = (await q(`SELECT date, sum(paise)::DOUBLE/100 AS net FROM ledger WHERE ${M}=? GROUP BY date ORDER BY date`, [month])).map((r) => ({ date: String(r.date), net: Number(r.net) }));
  const monthly = (await q(`SELECT ${M} AS m, ${IN} AS i, ${OUT} AS o FROM ledger GROUP BY m ORDER BY m DESC LIMIT 12`)).map((r) => ({ label: String(r.m), moneyIn: Number(r.i), moneyOut: Number(r.o) })).reverse();
  const payees = (await q(`SELECT min(description) AS d, count(*)::INTEGER AS n, ${OUT} AS a FROM ledger WHERE ${M}=? AND paise<0 GROUP BY lower(trim(description)) ORDER BY a DESC, d LIMIT 10`, [month])).map((r) => ({ description: String(r.d), count: Number(r.n), amount: Number(r.a) }));
  const stack = (await q(`SELECT ${M} AS m, category, ${OUT} AS a FROM ledger WHERE paise<0 AND ${M}>=? GROUP BY m, category ORDER BY m, category`, [monthly.at(-6)?.label ?? monthly[0]!.label])).map((r) => ({ month: String(r.m), category: String(r.category), amount: Number(r.a) }));
  const allCategories = (await q('SELECT DISTINCT category FROM ledger ORDER BY category LIMIT 200')).map((r) => String(r.category));
  const posted = (await q('SELECT id FROM ledger WHERE id LIKE ?', [`rec-%-${thisMonth}`])).map((r) => String(r.id));
  return { total, months, rows, categories, daily, monthly, previous, previousIn, payees, stack, allCategories, posted };
}
