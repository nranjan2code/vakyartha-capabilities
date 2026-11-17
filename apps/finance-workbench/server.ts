// Personal Finance Workbench: your own INR ledger for day-to-day use. Add, edit
// and delete transactions, set monthly limits, keep recurring items, import and
// export CSV. DuckDB `ledger` is the only transaction owner (signed integer
// paise); `context.state` keeps limits, recurring items and drafts. Each run
// reads the selected month once and `view()` derives every surface from it.
// No sample records, bank login or network.

import { ALL, MAX_LEDGER, MAX_LIMITS, MAX_RECURRING, MAX_TEXT, MONTH, count, daysIn, decimal, initialize, load, localDay, normalize, paise, records, replaceAll, typedPaise } from './model.ts';
import type { Context, Database, RecDraft, State } from './model.ts';
import { TITLES, money, monthName, view } from './views.ts';

export { EMPTY_LEDGER, load, normalize, paise, records } from './model.ts';
export type { Context, Ledger, State, Transaction } from './model.ts';
export { TITLES, view } from './views.ts';

const idOf = (value: unknown) => String((value as { id?: unknown } | null)?.id ?? '');
/** A draft field arrives as typed text, or as a number from a number input. */
const typed = (value: unknown, max: number) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : typeof value === 'string' ? value : '').slice(0, max);
/** The category a draft names: a newly typed one wins over the chosen one. */
const named = (d: { category: string; newCategory: string }) => {
  const category = (d.newCategory.trim() || d.category).trim();
  if (!category) throw new Error('Choose a category or type a new one');
  return category;
};
const described = (d: { description: string }) => {
  const description = d.description.trim();
  if (!description) throw new Error('Add a description, such as Groceries or Salary');
  return description;
};
const signed = (d: { kind: 'out' | 'in'; amount: string }) => typedPaise(d.amount) * (d.kind === 'in' ? 1 : -1);
const room = async (db: Database, adding: number) => { if (await count(db) + adding > MAX_LEDGER) throw new Error(`The ledger keeps up to ${MAX_LEDGER} records; export and delete older ones first`); };
const insert = (db: Database, id: string, date: string, description: string, category: string, p: number) => db.run('INSERT INTO ledger VALUES(?,?,?,?,?)', [id, date, description, category, p]);
async function freshId(db: Database, s: State) {
  for (;;) { const id = `entry-${(s.seq = (s.seq ?? 0) + 1)}`; if (!(await db.query('SELECT id FROM ledger WHERE id=?', [id])).length) return id; }
}
/** A draft edit keeps the committed view and replaces only the draft, without SQL. */
function draftOnly(c: Context, surface: string, part: Record<string, unknown>) {
  const saved = c.surfaces?.[surface] as { data?: Record<string, unknown> } | undefined;
  return saved?.data ? { updates: [{ surface, nodes: [], data: replaceAll({ ...saved.data, ...part }) }] } : undefined;
}

export async function handleAction(controlId: string, value: unknown, c: Context, action?: string) {
  const now = c.now?.() ?? new Date(), today = localDay(now), thisMonth = today.slice(0, 7), db = c.database;
  const s = (c.state = normalize(c.state, now));
  let focusSurface: string | undefined;
  if (!action) {
    const [, group, key] = controlId.split('/');
    if (controlId === '/month') { if (!MONTH.test(String(value))) throw new Error('Choose a month'); s.month = String(value); }
    else if (controlId === '/importText') {
      if (typeof value !== 'string' || value.length > MAX_TEXT) throw new Error('Paste at most 50,000 characters at a time');
      s.importText = value;
      const kept = draftOnly(c, 'import', { importText: value }); if (kept) return kept;
    } else if (group === 'entry' && key && key in s.draft!) {
      const e = s.editId ? s.edit! : s.draft!;
      Object.assign(e, normalize({ draft: { ...e, [key]: typed(value, 200) } }, now).draft);
      const kept = draftOnly(c, 'ledger', { entry: e }); if (kept) return kept;
    } else if (group === 'rec' && key && key in s.rec!) {
      s.rec = normalize({ rec: { ...s.rec!, [key]: typed(value, 200) } }, now).rec;
      const kept = draftOnly(c, 'recurring', { rec: s.rec }); if (kept) return kept;
    } else if (controlId === '/limit/category') {
      // Choosing a category shows its saved limit, ready to change.
      const category = typed(value, 60) || ALL;
      s.limit = { category, amount: category === ALL ? s.budget! : s.budgets![category] ? decimal(s.budgets![category]!) : '' };
    } else if (controlId === '/limit/amount') {
      s.limit!.amount = typed(value, 20);
      const kept = draftOnly(c, 'budgets', { limit: s.limit }); if (kept) return kept;
    } else throw new Error(`Unknown Finance Workbench field: ${controlId}`);
  } else {
    s.notice = '';
    await initialize(db);
    if (action === 'save_entry') {
      const e = s.editId ? s.edit! : s.draft!, description = described(e), category = named(e), p = signed(e);
      if (s.editId) {
        if (!(await db.query('SELECT id FROM ledger WHERE id=?', [s.editId])).length) throw new Error('That transaction is no longer in the ledger; press Cancel');
        await db.run('UPDATE ledger SET date=?, description=?, category=?, paise=? WHERE id=?', [e.date, description, category, p, s.editId]);
        s.notice = `Saved ${description} · ${money(p)}.`;
        s.editId = '';
      } else {
        await room(db, 1);
        await insert(db, await freshId(db, s), e.date, description, category, p);
        s.notice = `Added ${description} · ${money(p)}.`;
        // Keep the type, date and category for the next entry of a batch.
        s.draft = { ...e, amount: '', description: '', category, newCategory: '' };
      }
      s.month = e.date.slice(0, 7);
    } else if (action === 'open_entry') {
      const row = (await db.query('SELECT id,date,description,category,paise::DOUBLE AS paise FROM ledger WHERE id=?', [idOf(value)]))[0];
      if (!row) throw new Error('That transaction is no longer in the ledger');
      const p = Number(row.paise);
      s.editId = String(row.id);
      s.edit = { kind: p > 0 ? 'in' : 'out', amount: decimal(Math.abs(p)), date: String(row.date), description: String(row.description), category: String(row.category), newCategory: '' };
      s.confirmDelete = false;
      focusSurface = 'ledger';
    } else if (action === 'cancel_edit') { s.editId = ''; }
    else if (action === 'ask_delete') { s.confirmDelete = Boolean(s.editId); }
    else if (action === 'cancel_delete') { s.confirmDelete = false; }
    else if (action === 'delete_entry') {
      if (!s.editId) throw new Error('Open a transaction first');
      await db.run('DELETE FROM ledger WHERE id=?', [s.editId]);
      s.notice = `Deleted ${s.edit!.description.trim() || 'the transaction'}.`;
      s.editId = '';
    } else if (action === 'save_limit') {
      const { category, amount } = s.limit!, p = typedPaise(amount);
      if (category === ALL) s.budget = decimal(p);
      else {
        if (!(category in s.budgets!) && Object.keys(s.budgets!).length >= MAX_LIMITS) throw new Error(`Keep up to ${MAX_LIMITS} category limits`);
        s.budgets![category] = p;
      }
      s.limit!.amount = decimal(p);
      s.notice = `${category === ALL ? 'All spending' : category} is limited to ${money(p)} a month.`;
    } else if (action === 'remove_limit') {
      const { category } = s.limit!;
      if (category === ALL) s.budget = ''; else delete s.budgets![category];
      s.limit!.amount = '';
      s.notice = `Removed the limit on ${category === ALL ? 'all spending' : category}.`;
    } else if (action === 'save_rec') {
      const d: RecDraft = s.rec!, description = described(d), category = named(d), p = signed(d), day = Number(d.day);
      if (!Number.isInteger(day) || day < 1 || day > 31) throw new Error('The day of the month is a number from 1 to 31');
      const current = s.recurring!.find((r) => r.id === s.recId);
      if (current) Object.assign(current, { description, category, paise: p, day });
      else {
        if (s.recurring!.length >= MAX_RECURRING) throw new Error(`Keep up to ${MAX_RECURRING} recurring items`);
        s.recurring!.push({ id: `r${(s.seq = (s.seq ?? 0) + 1)}`, description, category, paise: p, day });
      }
      s.notice = `Saved ${description} · ${money(p)} on day ${day} of each month.`;
      s.recId = ''; s.rec = undefined;
    } else if (action === 'open_rec') {
      const r = s.recurring!.find((x) => x.id === idOf(value));
      if (!r) throw new Error('That recurring item was removed');
      s.recId = r.id;
      s.rec = { kind: r.paise > 0 ? 'in' : 'out', amount: decimal(Math.abs(r.paise)), description: r.description, category: r.category, newCategory: '', day: String(r.day) };
      focusSurface = 'recurring';
    } else if (action === 'cancel_rec') { s.recId = ''; s.rec = undefined; }
    else if (action === 'delete_rec') {
      s.recurring = s.recurring!.filter((r) => r.id !== s.recId);
      s.recId = ''; s.rec = undefined;
      s.notice = 'Removed the recurring item. Transactions already added stay in the ledger.';
    } else if (action === 'post_recurring' || action === 'post_due') {
      // One deterministic ID per item and month, so an item is never added twice.
      const have = new Set((await db.query('SELECT id FROM ledger WHERE id LIKE ?', [`rec-%-${thisMonth}`])).map((r) => String(r.id)));
      const due = s.recurring!.filter((r) => (action === 'post_due' || r.id === idOf(value)) && !have.has(`rec-${r.id}-${thisMonth}`));
      if (!due.length) throw new Error(`Nothing left to add for ${monthName(thisMonth)}`);
      await room(db, due.length);
      await db.run('BEGIN TRANSACTION');
      try {
        for (const r of due) await insert(db, `rec-${r.id}-${thisMonth}`, `${thisMonth}-${String(Math.min(r.day, daysIn(thisMonth))).padStart(2, '0')}`, r.description, r.category, r.paise);
        await db.run('COMMIT');
      } catch { await db.run('ROLLBACK'); throw new Error('Nothing was added; try again'); }
      s.month = thisMonth;
      s.notice = `Added ${due.length === 1 ? due[0]!.description : `${due.length} recurring items`} to ${monthName(thisMonth)}.`;
    } else if (action === 'import_records') {
      const rows = records(s.importText ?? '');
      await room(db, rows.length);
      const clash = await db.query(`SELECT id FROM ledger WHERE id IN (${rows.map(() => '?').join(',')}) LIMIT 3`, rows.map((r) => r.id));
      if (clash.length) throw new Error(`Already imported: ${clash.map((r) => r.id).join(', ')}. Nothing was added; IDs are never overwritten.`);
      await db.run('BEGIN TRANSACTION');
      try {
        for (const r of rows) await insert(db, r.id, r.date, r.description, r.category, paise(r.amount));
        await db.run('COMMIT');
      } catch { await db.run('ROLLBACK'); throw new Error('Import rejected as a whole; check the IDs and values'); }
      s.lastImport = { at: now.toISOString(), count: rows.length };
      s.importText = '';
      // Show the month the import ends in, which is usually the one being reviewed.
      s.month = rows.map((r) => r.date.slice(0, 7)).sort().at(-1)!;
      focusSurface = 'overview';
    } else if (action === 'ask_clear') { s.confirmClear = true; }
    else if (action === 'cancel_clear') { s.confirmClear = false; }
    else if (action === 'clear_ledger') {
      await db.run('DELETE FROM ledger');
      s.confirmClear = false; s.editId = '';
      delete s.lastImport;
    } else if (action !== 'recalculate') throw new Error(`Unknown Finance Workbench action: ${action}`);
  }
  const done = (c.state = normalize(s, now));
  return { updates: view(done, await load(db, done.month!, thisMonth), now), ...(focusSurface ? { focusSurface } : {}) };
}

/** The shipped surface.json: every view of a new, empty app, on a fixed clock with the entry date left for the first run. */
export function surfaceFile() {
  const shipped = new Date(2000, 0, 1);
  return view(normalize({}, shipped), undefined, shipped).map((u) => {
    const data = u.data[0]!.value;
    return { id: u.surface, title: TITLES[u.surface], data: u.surface === 'ledger' ? { ...data, entry: { ...(data.entry as object), date: '' } } : data, nodes: u.nodes };
  });
}

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) {
  const now = context.now?.() ?? new Date(), state = normalize(context.state, now);
  return { updates: view(state, await load(context.database, state.month!, localDay(now).slice(0, 7)), now) };
}
