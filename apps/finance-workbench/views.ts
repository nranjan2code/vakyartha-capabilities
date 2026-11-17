// Personal Finance Workbench views: six surfaces derived from the state and one
// ledger read. Each view is a caption, one action bar and its working area;
// regions are emitted only when they apply.

import { ALL, EMPTY_LEDGER, daysIn, localDay, normalize, paise, replaceAll, shiftMonth, toCsv } from './model.ts';
import type { Ledger, Node, State, Update } from './model.ts';

export const TITLES: Record<string, string> = { overview: 'Overview', ledger: 'Transactions', budgets: 'Budgets', insights: 'Insights', recurring: 'Recurring', import: 'Import' };
export const STARTERS = ['Education', 'Entertainment', 'Food', 'Groceries', 'Health', 'Housing', 'Income', 'Other', 'Shopping', 'Transport', 'Travel', 'Utilities'];
const EXAMPLE = 'id,date,description,category,amount\nsalary-2026-10,2026-10-01,October salary,Income,85000.00\nrent-2026-10,2026-10-03,Rent,Housing,-25000.00';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const inrSigned = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', signDisplay: 'exceptZero' });
export const money = (p: number) => inr.format(p / 100);
const flow = (p: number) => inrSigned.format(p / 100);
export const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthShort = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const dayName = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const percent = (part: number, whole: number) => `${Math.round((part / whole) * 100)}%`;
const toPaise = (rupees: number) => Math.round(rupees * 100);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const budgetOf = (s: State) => { try { const p = paise(s.budget); return p > 0 ? p : null; } catch { return null; } };
const tone = (used: number, limit: number) => used > limit ? 'danger' : used > limit * 0.8 ? 'warning' : 'success';

const root = (children: string[]): Node => ({ id: 'root', type: 'stack', props: { gap: 'md', density: 'compact' }, children });
const caption = (id: string, content: string): Node => ({ id, type: 'text', props: { content, variant: 'caption' } });
const bar = (id: string, children: string[]): Node => ({ id, type: 'stack', props: { direction: 'horizontal', wrap: true, gap: 'sm', align: 'end' }, children });
const button = (id: string, label: string, action: string, style: string, payload?: unknown): Node => ({ id, type: 'button', props: { label, action, style, ...(payload === undefined ? {} : { payload }) } });
const open = (id: string, label: string, surface: string, style = 'secondary') => button(id, label, 'view.open', style, { surface });
const monthPick: Node = { id: 'month', type: 'select', props: { label: 'Month', bind: '/month', options: '{/monthOptions}', presentation: 'dropdown', maxWidth: 'sm' } };
const KINDS = [{ label: 'Expense', value: 'out' }, { label: 'Income', value: 'in' }];
/** Tabs over the sections that have content; a section's title is its tab label. */
const tabs = (id: string, panels: [title: string, children: string[]][]): Node[] => [
  { id, type: 'tabs', children: panels.map((_, i) => `${id}-${i}`) },
  ...panels.map(([title, children], i): Node => ({ id: `${id}-${i}`, type: 'section', props: { title }, children })),
];

/** The figures several views share, in paise, from the selected month's rows. */
function figures(s: State, l: Ledger, now: Date) {
  const today = localDay(now), month = s.month!, current = month === today.slice(0, 7), days = daysIn(month);
  const income = sum(l.rows.filter((r) => r.paise > 0).map((r) => r.paise)), spent = -sum(l.rows.filter((r) => r.paise < 0).map((r) => r.paise));
  const elapsed = current ? Number(today.slice(8)) : days, before = shiftMonth(month, -1);
  const categories = [...new Set([...STARTERS, ...l.allCategories, ...s.recurring!.map((r) => r.category), ...Object.keys(s.budgets!)])].sort((a, b) => a.localeCompare(b));
  const thisMonth = today.slice(0, 7), posted = new Set(l.posted);
  const recurring = s.recurring!.map((r) => {
    const added = posted.has(`rec-${r.id}-${thisMonth}`), date = `${thisMonth}-${String(Math.min(r.day, daysIn(thisMonth))).padStart(2, '0')}`;
    return { id: r.id, description: r.description, amount: flow(r.paise), tone: r.paise > 0 ? 'success' : 'neutral', added, meta: `${added ? 'Added' : date < today ? 'Was due' : 'Due'} ${dayName(date)} · ${r.category}` };
  });
  return {
    today, month, current, days, elapsed, left: days - elapsed, income, spent, budget: budgetOf(s), before, thisMonth, categories,
    previousSpent: toPaise(sum(l.previous.map((c) => c.amount))), due: recurring.filter((r) => !r.added), added: recurring.filter((r) => r.added),
    monthOptions: [...new Set([month, thisMonth, ...l.months])].sort().reverse().map((m) => ({ label: monthName(m), value: m })),
  };
}
type Figures = ReturnType<typeof figures>;
const dueCards = (prefix: string, edit: boolean): Node[] => [
  { id: `${prefix}-list`, type: 'grid', props: { columns: 1, gap: 'sm' }, children: { each: '/due', template: `${prefix}-card` } },
  { id: `${prefix}-card`, type: 'card', props: { title: '{description}', subtitle: '{meta}', badge: '{amount}', tone: '{tone}', layout: 'row', ...(edit ? { action: 'open_rec', payload: { id: '{id}' }, actionLabel: 'Edit' } : {}) }, children: [`${prefix}-add`] },
  button(`${prefix}-add`, 'Add to ledger', 'post_recurring', 'secondary', { id: '{id}' }),
];

/** What the docked assistant starts with on Transactions; the person edits and sends it. */
const assistantRequest = 'Add these to my ledger: ';
export const assistantWorkflow = {
  title: 'Add by chat', brief: 'What you spent or received',
  boundary: 'The assistant reads your categories and adds the transactions you describe, after you approve them. It never deletes or changes a saved transaction.',
  saved: 'Added to your ledger. Check them in the list, and choose one to change it.',
  steps: [
    { id: 'add', label: 'Add transactions', mode: 'edit', message: assistantRequest },
    { id: 'month', label: 'Summarise this month', mode: 'send', message: 'Read my ledger and summarise this month: money in, money out, what is left of my limits and the largest expenses. Use only what the ledger returned.' },
  ],
  review: { label: 'See the transactions', surface: 'ledger', tool: 'add_transactions' },
};

export function view(input: State, ledger: Ledger = EMPTY_LEDGER, now = new Date()): Update[] {
  const s = normalize(input, now), l = { ...EMPTY_LEDGER, ...ledger }, f = figures(s, l, now);
  return [overviewSurface(s, l, f), ledgerSurface(s, l, f), budgetsSurface(s, l, f), insightsSurface(s, l, f), recurringSurface(s, f), importSurface(s, l)];
}

function overviewSurface(s: State, l: Ledger, f: Figures): Update {
  if (!l.total) return { surface: 'overview', data: replaceAll({}), nodes: [
    root(['fin-empty']),
    { id: 'fin-empty', type: 'card', props: { title: 'Start your ledger', body: 'Add what you earn and spend as it happens, or import your own records. Totals, limits and charts appear here. Nothing leaves this computer.' }, children: ['empty-bar'] },
    bar('empty-bar', ['start-add', 'start-import']), open('start-add', 'Add a transaction', 'ledger', 'primary'), open('start-import', 'Import a file', 'import'),
  ] };
  const has = l.rows.length > 0, { budget, spent, income } = f, due = f.current ? f.due : [];
  const outByDay = new Map<string, number>();
  for (const r of l.rows) if (r.paise < 0) outByDay.set(r.date, (outByDay.get(r.date) ?? 0) - r.paise);
  let running = 0;
  const spendRun = [...outByDay].sort(([a], [b]) => a.localeCompare(b)).map(([date, p]) => ({ date, spent: (running += p) / 100 }));
  const remaining = budget === null ? 0 : budget - spent;
  const nodes: Node[] = [
    root(['cap', 'bar', ...(has ? ['totals', budget ? 'budget-progress' : 'budget-none'] : []), ...(due.length ? ['due'] : []), ...(spendRun.length ? ['charts'] : [])]),
    caption('cap', '{/summary}'),
    bar('bar', ['month', 'add', 'to-import']), monthPick, open('add', 'Add transaction', 'ledger', 'primary'), open('to-import', 'Import', 'import', 'link'),
    ...(has ? [
      { id: 'totals', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: { each: '/totals', template: 'total' } },
      { id: 'total', type: 'stat', props: { label: '{label}', value: '{value}', tone: '{tone}' } },
      budget
        ? { id: 'budget-progress', type: 'progress', props: { label: 'Spending against the monthly limit', value: '{/budgetUsed}', max: '{/budgetMax}', unit: '₹', tone: '{/budgetTone}', note: '{/budgetNote}' } }
        : bar('budget-none', ['budget-hint', 'budget-set']),
      ...(budget ? [] : [caption('budget-hint', 'No monthly limit yet.'), open('budget-set', 'Set a limit', 'budgets', 'link')]),
    ] as Node[] : []),
    ...(due.length ? [{ id: 'due', type: 'section', props: { title: 'Recurring items to add this month' }, children: ['due-list'] } as Node, ...dueCards('due', false)] : []),
    ...(spendRun.length ? [
      { id: 'charts', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'md' }, children: ['spending-chart', 'run-chart'] },
      { id: 'spending-chart', type: 'chart', props: {
        kind: 'bar', orientation: 'horizontal', showShare: true, title: 'Spending by category · INR',
        series: { records: '{/categories}', label: 'label', fields: ['amount'], names: ['Spent (INR)'] }, height: 'md',
        drilldown: { title: 'View spending transactions', records: '{/spendingRows}', match: 'category', columns: [
          { key: 'date', label: 'Date' }, { key: 'description', label: 'Description' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount (INR)' },
        ] },
      } },
      { id: 'run-chart', type: 'chart', props: { kind: 'area', title: 'Spending so far this month · INR', series: { records: '{/spendRun}', label: 'date', fields: ['spent'], names: ['Spent so far (INR)'] }, xScale: 'time', height: 'md',
        ...(budget ? { guides: [{ value: budget / 100, label: 'Monthly limit', tone: 'warning' }] } : {}) } },
    ] as Node[] : []),
  ];
  const data = {
    month: s.month, monthOptions: f.monthOptions,
    summary: has
      ? `${monthName(f.month)} · ${plural(l.rows.length, 'transaction')}${budget ? remaining >= 0 ? ` · ${money(remaining)} left of ${money(budget)}` : ` · ${money(-remaining)} over the ${money(budget)} limit` : ''}`
      : `No transactions in ${monthName(f.month)}. Add one or choose another month.`,
    ...(has ? {
      totals: [
        { label: 'Money in', value: money(income), tone: 'neutral' }, { label: 'Money out', value: money(spent), tone: 'neutral' },
        { label: income >= spent ? 'Saved' : 'Overspent', value: money(Math.abs(income - spent)), tone: income >= spent ? 'success' : 'danger' },
        { label: 'Spent per day', value: money(Math.round(spent / f.elapsed)), tone: 'neutral' },
      ],
      ...(budget ? {
        budgetUsed: spent / 100, budgetMax: budget / 100, budgetTone: tone(spent, budget),
        budgetNote: remaining < 0 ? `${money(-remaining)} over the limit.` : f.current && f.left > 0 ? `${money(remaining)} left: ${money(Math.floor(remaining / f.left))} a day for the ${plural(f.left, 'day')} that remain.` : `${money(remaining)} left.`,
      } : {}),
    } : {}),
    ...(due.length ? { due } : {}),
    ...(spendRun.length ? {
      spendRun, categories: l.categories,
      spendingRows: l.rows.filter((r) => r.paise < 0).map((r) => ({ date: r.date, description: r.description, category: r.category, amount: money(r.paise) })),
    } : {}),
  };
  return { surface: 'overview', nodes, data: replaceAll(data) };
}

function ledgerSurface(s: State, l: Ledger, f: Figures): Update {
  const has = l.rows.length > 0, editing = Boolean(s.editId), entry = editing ? s.edit! : s.draft!;
  const nodes: Node[] = [
    root(['cap', ...(l.total ? ['bar'] : []), 'work']),
    caption('cap', '{/summary}'),
    ...(l.total ? [bar('bar', ['month', 'to-import', ...(has ? ['export'] : [])]), monthPick, open('to-import', 'Import', 'import'),
      ...(has ? [button('export', 'Export CSV', 'file.save', 'link', { name: `transactions-${f.month}`, text: '/exportCsv' })] : [])] : []),
    { id: 'work', type: 'split', props: { ratio: '1:2', gap: 'md' }, children: ['editor', has ? 'list' : 'list-empty'] },
    { id: 'editor', type: 'section', props: { title: editing ? 'Edit transaction' : 'Add a transaction' }, children: ['e-kind', 'e-figures', 'e-description', 'e-categories', ...(s.notice ? ['e-note'] : []), s.confirmDelete ? 'e-confirm' : 'e-actions'] },
    { id: 'e-kind', type: 'select', props: { label: 'Type', bind: '/entry/kind', options: KINDS } },
    bar('e-figures', ['e-amount', 'e-date']),
    { id: 'e-amount', type: 'input', props: { label: 'Amount · INR', bind: '/entry/amount', kind: 'number', min: 0, step: 0.01, placeholder: '250.00', maxWidth: 'sm' } },
    { id: 'e-date', type: 'date', props: { label: 'Date', bind: '/entry/date', maxWidth: 'sm' } },
    { id: 'e-description', type: 'input', props: { label: 'Description', bind: '/entry/description', placeholder: 'Groceries' } },
    bar('e-categories', ['e-category', 'e-new']),
    { id: 'e-category', type: 'select', props: { label: 'Category', bind: '/entry/category', options: '{/categoryOptions}', presentation: 'dropdown', maxWidth: 'sm' } },
    { id: 'e-new', type: 'input', props: { label: 'Or a new category', bind: '/entry/newCategory', maxWidth: 'sm' } },
    ...(s.notice ? [caption('e-note', '{/notice}')] : []),
    ...(s.confirmDelete ? [
      { id: 'e-confirm', type: 'card', props: { title: 'Delete this transaction?', body: 'It is removed from the ledger for good.', tone: 'danger' }, children: ['e-confirm-bar'] } as Node,
      bar('e-confirm-bar', ['e-delete-yes', 'e-delete-no']), button('e-delete-yes', 'Delete', 'delete_entry', 'danger'), button('e-delete-no', 'Keep it', 'cancel_delete', 'secondary'),
    ] : [
      bar('e-actions', ['e-save', ...(editing ? ['e-cancel', 'e-delete'] : ['e-chat'])]), button('e-save', editing ? 'Save changes' : 'Add', 'save_entry', 'primary'),
      ...(editing ? [] : [button('e-chat', 'Add by chat', 'assistant.compose', 'link', { path: 'assistantRequest', workflowPath: 'assistantWorkflow' })]),
      ...(editing ? [button('e-cancel', 'Cancel', 'cancel_edit', 'secondary'), button('e-delete', 'Delete', 'ask_delete', 'link')] : []),
    ]),
    ...(has ? [
      { id: 'list', type: 'grid', props: { columns: 1, gap: 'sm', searchable: true, pageSize: 10 }, children: { each: '/transactions', template: 'row' } } as Node,
      { id: 'row', type: 'card', props: { title: '{description}', subtitle: '{meta}', badge: '{amount}', tone: '{tone}', layout: 'row', action: 'open_entry', payload: { id: '{id}' }, actionLabel: 'Edit' } } as Node,
    ] : [caption('list-empty', l.total ? 'Nothing recorded in this month yet.' : 'Your transactions are listed here, newest first, with search. Choose one to change or delete it.')]),
  ];
  const data = {
    entry, assistantRequest, assistantWorkflow, categoryOptions: [...new Set([...f.categories, ...(entry.category ? [entry.category] : [])])].sort((a, b) => a.localeCompare(b)),
    summary: has ? `${monthName(f.month)} · ${plural(l.rows.length, 'transaction')} · ${money(f.income)} in · ${money(f.spent)} out` : l.total ? `No transactions in ${monthName(f.month)}.` : 'Record money in and money out as it happens. Amounts are exact to the paisa and stay on this computer.',
    ...(s.notice ? { notice: s.notice } : {}),
    ...(l.total ? { month: s.month, monthOptions: f.monthOptions } : {}),
    ...(has ? {
      transactions: l.rows.map((r) => ({ id: r.id, description: r.description, meta: `${dayName(r.date)} · ${r.category}`, amount: flow(r.paise), tone: r.paise > 0 ? 'success' : 'neutral' })),
      exportCsv: toCsv(l.rows),
    } : {}),
  };
  return { surface: 'ledger', nodes, data: replaceAll(data) };
}

function budgetsSurface(s: State, l: Ledger, f: Figures): Update {
  const spentBy = new Map(l.categories.map((c) => [c.label, toPaise(c.amount)])), { budget, spent } = f;
  const limits = Object.entries(s.budgets!).map(([label, limit]) => {
    const used = spentBy.get(label) ?? 0;
    return { label, spent: used / 100, limit: limit / 100, tone: tone(used, limit), over: used > limit, note: used > limit ? `${money(used - limit)} over ${money(limit)}` : `${money(limit - used)} left of ${money(limit)}` };
  }).sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  const free = l.categories.filter((c) => !(c.label in s.budgets!)), selected = s.limit!.category;
  const saved = selected === ALL ? budget !== null : selected in s.budgets!, any = budget !== null || limits.length > 0;
  const nodes: Node[] = [
    root(['cap', ...(l.total ? ['bar'] : []), 'work']),
    caption('cap', '{/summary}'),
    ...(l.total ? [bar('bar', ['month', 'add']), monthPick, open('add', 'Add transaction', 'ledger')] : []),
    { id: 'work', type: 'split', props: { ratio: '1:2', gap: 'md' }, children: ['limit-form', 'limit-pane'] },
    { id: 'limit-form', type: 'section', props: { title: 'Set a monthly limit' }, children: ['l-category', 'l-amount', ...(s.notice ? ['l-note'] : []), 'l-actions'] },
    { id: 'l-category', type: 'select', props: { label: 'Applies to', bind: '/limit/category', options: '{/limitOptions}', presentation: 'dropdown' } },
    { id: 'l-amount', type: 'input', props: { label: 'Limit per month · INR', bind: '/limit/amount', kind: 'number', min: 0, step: 0.01, placeholder: '40000', maxWidth: 'sm' } },
    ...(s.notice ? [caption('l-note', '{/notice}')] : []),
    bar('l-actions', ['l-save', ...(saved ? ['l-remove'] : [])]), button('l-save', saved ? 'Change limit' : 'Set limit', 'save_limit', 'primary'),
    ...(saved ? [button('l-remove', 'Remove limit', 'remove_limit', 'link')] : []),
    { id: 'limit-pane', type: 'stack', props: { gap: 'md' }, children: any ? [...(budget ? ['all-progress'] : []), ...(limits.length ? ['limits'] : []), ...(free.length ? ['unlimited'] : [])] : ['limits-empty'] },
    ...(budget ? [{ id: 'all-progress', type: 'progress', props: { label: 'All spending', value: '{/allSpent}', max: '{/allLimit}', unit: '₹', tone: '{/allTone}', note: '{/allNote}' } } as Node] : []),
    ...(limits.length ? [
      { id: 'limits', type: 'grid', props: { columns: 2, minItemWidth: 'md', gap: 'md' }, children: { each: '/limits', template: 'limit' } } as Node,
      { id: 'limit', type: 'progress', props: { label: '{label}', value: '{spent}', max: '{limit}', unit: '₹', tone: '{tone}', note: '{note}' } } as Node,
    ] : []),
    ...(any && free.length ? [caption('unlimited', '{/unlimited}')] : []),
    ...(any ? [] : [caption('limits-empty', 'A limit is a monthly ceiling for all spending or for one category. Each one is measured against the selected month, and turns amber past 80% and red once it is passed.')]),
  ];
  const over = limits.filter((x) => x.over).length + (budget !== null && spent > budget ? 1 : 0);
  const data = {
    limit: s.limit, limitOptions: [{ label: 'All spending', value: ALL }, ...[...new Set([...f.categories, ...(selected === ALL ? [] : [selected])])].sort((a, b) => a.localeCompare(b)).map((c) => ({ label: c, value: c }))],
    summary: any
      ? `${l.total ? `${monthName(f.month)} · ` : ''}${plural(limits.length + (budget ? 1 : 0), 'limit')} · ${over ? `${over} passed` : 'all within their limit'}`
      : 'No limits yet. Set one for all spending, or for a category you want to keep an eye on.',
    ...(s.notice ? { notice: s.notice } : {}),
    ...(l.total ? { month: s.month, monthOptions: f.monthOptions } : {}),
    ...(budget ? { allSpent: spent / 100, allLimit: budget / 100, allTone: tone(spent, budget), allNote: spent > budget ? `${money(spent - budget)} over ${money(budget)}` : `${money(budget - spent)} left of ${money(budget)}` } : {}),
    ...(limits.length ? { limits } : {}),
    ...(any && free.length ? { unlimited: `Without a limit: ${free.slice(0, 8).map((c) => `${c.label} ${money(toPaise(c.amount))}`).join(' · ')}${free.length > 8 ? ` and ${free.length - 8} more` : ''}.` } : {}),
  };
  return { surface: 'budgets', nodes, data: replaceAll(data) };
}

function insightsSurface(s: State, l: Ledger, f: Figures): Update {
  if (!l.rows.length) return { surface: 'insights', data: replaceAll(l.total ? { month: s.month, monthOptions: f.monthOptions } : {}), nodes: [
    root([...(l.total ? ['bar'] : []), 'none']),
    ...(l.total ? [bar('bar', ['month', 'add']), monthPick, open('add', 'Add transaction', 'ledger')] : []),
    caption('none', l.total ? 'No transactions in this month to analyse. Choose another month.' : 'Comparisons, trends and your largest expenses appear here once the ledger has transactions.'),
  ] };
  const { income, spent, previousSpent } = f, beforeName = monthName(f.before), change = spent - previousSpent;
  const expenses = l.rows.filter((r) => r.paise < 0).sort((a, b) => a.paise - b.paise), largest = expenses[0];
  const names = [...new Set([...l.categories, ...l.previous].map((c) => c.label))];
  const now = new Map(l.categories.map((c) => [c.label, c.amount])), then = new Map(l.previous.map((c) => [c.label, c.amount]));
  const compare = names.map((label) => ({ label, current: now.get(label) ?? 0, previous: then.get(label) ?? 0 })).sort((a, b) => b.current - a.current || b.previous - a.previous);
  // The six latest months, stacked by the five largest categories and the rest.
  const stackMonths = [...new Set(l.stack.map((x) => x.month))].sort(), byCategory = new Map<string, number>();
  for (const x of l.stack) byCategory.set(x.category, (byCategory.get(x.category) ?? 0) + x.amount);
  const top = [...byCategory].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c), rest = byCategory.size > top.length;
  const stacked = stackMonths.map((m) => {
    const record: Record<string, string | number> = { label: monthShort(m) };
    top.forEach((c, i) => { record[`c${i}`] = l.stack.find((x) => x.month === m && x.category === c)?.amount ?? 0; });
    if (rest) record.rest = Math.round(sum(l.stack.filter((x) => x.month === m && !top.includes(x.category)).map((x) => x.amount)) * 100) / 100;
    return record;
  });
  const trend = l.monthly.length > 1, compared = l.previous.length > 0;
  const stats = [
    { label: 'Share of income saved', value: income > 0 ? percent(income - spent, income) : 'No income recorded', tone: income > 0 && income < spent ? 'danger' : 'neutral' },
    ...(compared ? [{ label: `Spending against ${beforeName}`, value: flow(change), tone: change > 0 ? 'warning' : 'success' }] : []),
    ...(largest ? [{ label: `Largest expense · ${largest.description.slice(0, 40)}`, value: money(-largest.paise), tone: 'neutral' }] : []),
  ];
  const panels: [string, string[]][] = [
    ...(expenses.length ? [['Largest expenses', ['top-split']] as [string, string[]]] : []),
    ...(compared ? [[`Against ${beforeName}`, ['compare-chart', 'compare-table']] as [string, string[]]] : []),
    ...(trend ? [['Trend', ['trend-chart', ...(stacked.length > 1 && top.length ? ['stack-chart'] : [])]] as [string, string[]], ['Months', ['months-table']] as [string, string[]]] : []),
  ];
  const nodes: Node[] = [
    root(['cap', 'bar', 'stats', ...(panels.length ? ['tabs'] : [])]),
    caption('cap', '{/summary}'),
    bar('bar', ['month', 'add']), monthPick, open('add', 'Add transaction', 'ledger'),
    { id: 'stats', type: 'grid', props: { columns: 4, minItemWidth: 'sm', gap: 'sm' }, children: { each: '/stats', template: 'stat' } },
    { id: 'stat', type: 'stat', props: { label: '{label}', value: '{value}', tone: '{tone}' } },
    ...(panels.length ? tabs('tabs', panels) : []),
    ...(expenses.length ? [
      { id: 'top-split', type: 'split', props: { ratio: '1:1', gap: 'md' }, children: ['top-table', 'payee-table'] },
      { id: 'top-table', type: 'table', props: { rows: '{/largest}', columns: [{ key: 'date', label: 'Date' }, { key: 'description', label: 'Largest expenses' }, { key: 'category', label: 'Category' }, { key: 'amount', label: 'Amount', align: 'end' }], searchable: false, sortable: false, pageSize: 10 } },
      { id: 'payee-table', type: 'table', props: { rows: '{/payees}', columns: [{ key: 'description', label: 'Where it went' }, { key: 'count', label: 'Times', align: 'end' }, { key: 'amount', label: 'Total', align: 'end' }], searchable: false, sortable: false, pageSize: 10 } },
    ] as Node[] : []),
    ...(compared ? [
      { id: 'compare-chart', type: 'chart', props: { kind: 'bar', orientation: 'horizontal', title: 'Spending by category · INR', series: { records: '{/compare}', label: 'label', fields: ['current', 'previous'], names: [monthName(f.month), beforeName] }, height: 'md' } },
      { id: 'compare-table', type: 'table', props: { rows: '{/compareRows}', columns: [{ key: 'label', label: 'Category' }, { key: 'current', label: monthName(f.month), align: 'end' }, { key: 'previous', label: beforeName, align: 'end' }, { key: 'change', label: 'Change', align: 'end' }], searchable: false, pageSize: 12 } },
    ] as Node[] : []),
    ...(trend ? [
      { id: 'trend-chart', type: 'chart', props: { kind: 'bar', title: 'Money in and out by month · INR', series: { records: '{/monthly}', label: 'label', fields: ['moneyIn', 'moneyOut'], names: ['Money in', 'Money out'] }, height: 'md' } },
      ...(stacked.length > 1 && top.length ? [{ id: 'stack-chart', type: 'chart', props: { kind: 'stacked', title: 'Spending by category and month · INR', series: { records: '{/stacked}', label: 'label', fields: [...top.map((_, i) => `c${i}`), ...(rest ? ['rest'] : [])], names: [...top, ...(rest ? ['Other categories'] : [])] }, height: 'md' } }] : []),
      { id: 'months-table', type: 'table', props: { rows: '{/months}', columns: [{ key: 'month', label: 'Month' }, { key: 'in', label: 'Money in', align: 'end' }, { key: 'out', label: 'Money out', align: 'end' }, { key: 'saved', label: 'Saved', align: 'end' }, { key: 'rate', label: 'Share saved', align: 'end' }], searchable: false, sortable: false, pageSize: 12 } },
    ] as Node[] : []),
  ];
  const data = {
    month: s.month, monthOptions: f.monthOptions, stats,
    summary: `${monthName(f.month)} · ${money(spent)} spent across ${l.categories.length === 1 ? '1 category' : `${l.categories.length} categories`}${compared ? ` · ${change === 0 ? 'the same as' : `${money(Math.abs(change))} ${change > 0 ? 'more' : 'less'} than`} ${beforeName}` : ''}`,
    ...(expenses.length ? {
      largest: expenses.slice(0, 10).map((r) => ({ date: dayName(r.date), description: r.description, category: r.category, amount: money(-r.paise) })),
      payees: l.payees.map((p) => ({ description: p.description, count: p.count, amount: money(toPaise(p.amount)) })),
    } : {}),
    ...(compared ? { compare: compare.slice(0, 12), compareRows: compare.map((c) => ({ label: c.label, current: money(toPaise(c.current)), previous: money(toPaise(c.previous)), change: flow(toPaise(c.current) - toPaise(c.previous)) })) } : {}),
    ...(trend ? {
      monthly: l.monthly.map((m) => ({ ...m, label: monthShort(m.label) })),
      ...(stacked.length > 1 && top.length ? { stacked } : {}),
      months: [...l.monthly].reverse().map((m) => ({ month: monthName(m.label), in: money(toPaise(m.moneyIn)), out: money(toPaise(m.moneyOut)), saved: flow(toPaise(m.moneyIn) - toPaise(m.moneyOut)), rate: m.moneyIn > 0 ? percent(m.moneyIn - m.moneyOut, m.moneyIn) : '' })),
    } : {}),
  };
  return { surface: 'insights', nodes, data: replaceAll(data) };
}

function recurringSurface(s: State, f: Figures): Update {
  const editing = Boolean(s.recId), items = s.recurring!, out = -sum(items.filter((r) => r.paise < 0).map((r) => r.paise)), into = sum(items.filter((r) => r.paise > 0).map((r) => r.paise));
  const nodes: Node[] = [
    root(['cap', 'work']),
    caption('cap', '{/summary}'),
    { id: 'work', type: 'split', props: { ratio: '1:2', gap: 'md' }, children: ['rec-form', 'rec-pane'] },
    { id: 'rec-form', type: 'section', props: { title: editing ? 'Edit recurring item' : 'Add a recurring item' }, children: ['r-kind', 'r-figures', 'r-description', 'r-categories', ...(s.notice ? ['r-note'] : []), 'r-actions'] },
    { id: 'r-kind', type: 'select', props: { label: 'Type', bind: '/rec/kind', options: KINDS } },
    bar('r-figures', ['r-amount', 'r-day']),
    { id: 'r-amount', type: 'input', props: { label: 'Amount · INR', bind: '/rec/amount', kind: 'number', min: 0, step: 0.01, placeholder: '25000', maxWidth: 'sm' } },
    { id: 'r-day', type: 'input', props: { label: 'Day of the month', bind: '/rec/day', kind: 'number', min: 1, max: 31, step: 1, maxWidth: 'sm' } },
    { id: 'r-description', type: 'input', props: { label: 'Description', bind: '/rec/description', placeholder: 'Rent' } },
    bar('r-categories', ['r-category', 'r-new']),
    { id: 'r-category', type: 'select', props: { label: 'Category', bind: '/rec/category', options: '{/categoryOptions}', presentation: 'dropdown', maxWidth: 'sm' } },
    { id: 'r-new', type: 'input', props: { label: 'Or a new category', bind: '/rec/newCategory', maxWidth: 'sm' } },
    ...(s.notice ? [caption('r-note', '{/notice}')] : []),
    bar('r-actions', ['r-save', ...(editing ? ['r-cancel', 'r-delete'] : [])]), button('r-save', editing ? 'Save changes' : 'Add', 'save_rec', 'primary'),
    ...(editing ? [button('r-cancel', 'Cancel', 'cancel_rec', 'secondary'), button('r-delete', 'Remove', 'delete_rec', 'link')] : []),
    { id: 'rec-pane', type: 'stack', props: { gap: 'md' }, children: items.length ? [...(f.due.length ? ['rec-due'] : []), ...(f.added.length ? ['rec-added'] : [])] : ['rec-empty'] },
    ...(f.due.length ? [
      { id: 'rec-due', type: 'section', props: { title: '{/dueTitle}' }, children: [...(f.due.length > 1 ? ['rec-all'] : []), 'rd-list'] } as Node,
      ...(f.due.length > 1 ? [button('rec-all', 'Add all to ledger', 'post_due', 'primary')] : []), ...dueCards('rd', true),
    ] : []),
    ...(f.added.length ? [
      { id: 'rec-added', type: 'section', props: { title: 'Already in the ledger this month' }, children: ['ra-list'] } as Node,
      { id: 'ra-list', type: 'grid', props: { columns: 1, gap: 'sm' }, children: { each: '/added', template: 'ra-card' } } as Node,
      { id: 'ra-card', type: 'card', props: { title: '{description}', subtitle: '{meta}', badge: '{amount}', tone: '{tone}', layout: 'row', action: 'open_rec', payload: { id: '{id}' }, actionLabel: 'Edit' } } as Node,
    ] : []),
    ...(items.length ? [] : [caption('rec-empty', 'Rent, salary, subscriptions and other amounts that repeat every month go here. Each month you add them to the ledger with one press; nothing is added on its own, and an item is never added twice in a month.')]),
  ];
  const data = {
    rec: s.rec, categoryOptions: [...new Set([...f.categories, ...(s.rec!.category ? [s.rec!.category] : [])])].sort((a, b) => a.localeCompare(b)),
    summary: items.length
      ? `${plural(items.length, 'recurring item')} · ${money(out)} out and ${money(into)} in each month · ${f.due.length ? `${f.due.length} still to add for ${monthName(f.thisMonth)}` : `all added for ${monthName(f.thisMonth)}`}`
      : 'Keep the amounts that repeat every month in one place.',
    ...(s.notice ? { notice: s.notice } : {}),
    ...(f.due.length ? { due: f.due, dueTitle: `To add for ${monthName(f.thisMonth)}` } : {}),
    ...(f.added.length ? { added: f.added } : {}),
  };
  return { surface: 'recurring', nodes, data: replaceAll(data) };
}

function importSurface(s: State, l: Ledger): Update {
  const nodes: Node[] = [
    root(['import-section', 'format-section', ...(l.total ? ['manage-section'] : [])]),
    { id: 'import-section', type: 'section', props: { title: 'Import transactions', description: '{/receipt}' }, children: ['import-text', 'import-bar'] },
    { id: 'import-text', type: 'textarea', props: { label: 'Paste CSV or JSON', bind: '/importText', placeholder: EXAMPLE, rows: 10 } },
    bar('import-bar', ['import']), button('import', 'Import', 'import_records', 'primary'),
    { id: 'format-section', type: 'section', props: { title: 'Format' }, children: ['format', 'format-example', 'privacy'] },
    { id: 'format', type: 'text', props: { content: 'One row per transaction with **id, date, description, category, amount**. Amounts are INR decimals with up to two places: positive for money in, negative for money out. IDs must be unique and stay fixed, so importing the same file twice adds nothing. Up to 200 rows per import and 5,000 in the ledger; a batch is added whole or not at all. **Export CSV** on Transactions writes this same format.' } },
    { id: 'format-example', type: 'text', props: { content: EXAMPLE, variant: 'code' } },
    caption('privacy', 'Records stay in this app’s local database. No bank login, sync or network access. Money in less money out is not an account balance; classify transfers and refunds yourself.'),
    ...(l.total ? [
      { id: 'manage-section', type: 'section', props: { title: 'Ledger', description: '{/ledgerSize}' }, children: [s.confirmClear ? 'confirm-clear' : 'ask-clear'] } as Node,
      ...(s.confirmClear ? [
        { id: 'confirm-clear', type: 'card', props: { title: 'Delete every transaction?', body: 'The whole ledger is removed from this app for good. Limits and recurring items stay. Your original files are not touched.', tone: 'danger' }, children: ['confirm-bar'] } as Node,
        bar('confirm-bar', ['clear-yes', 'clear-no']), button('clear-yes', 'Delete all', 'clear_ledger', 'danger'), button('clear-no', 'Keep them', 'cancel_clear', 'secondary'),
      ] : [button('ask-clear', 'Delete all transactions', 'ask_clear', 'link')]),
    ] : []),
  ];
  const data = {
    importText: s.importText,
    receipt: s.lastImport ? `Last import: ${plural(s.lastImport.count, 'transaction')} on ${s.lastImport.at.slice(0, 10)} at ${s.lastImport.at.slice(11, 16)} UTC.` : 'Bring in records you already keep elsewhere. No sample data is supplied.',
    ...(l.total ? { ledgerSize: `${plural(l.total, 'transaction')} across ${plural(l.months.length, 'month')}.` } : {}),
  };
  return { surface: 'import', nodes, data: replaceAll(data) };
}
