import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { handleAction, normalize, paise, records, renderApp, surfaceFile, view } from "../apps/finance-workbench/server.ts";
import { decimal, toCsv, typedPaise } from "../apps/finance-workbench/model.ts";
import type { Ledger } from "../apps/finance-workbench/model.ts";

const fixed = () => new Date(2026, 10, 17, 12);
const dataOf = (updates: { surface: string; data: { value: Record<string, unknown> }[] }[], surface: string): any => updates.find((u) => u.surface === surface)!.data[0]!.value;
const ids = (updates: { surface: string; nodes: { id: string }[] }[], surface: string) => updates.find((u) => u.surface === surface)!.nodes.map((n) => n.id);

test("amounts stay exact and typed amounts are positive", () => {
  assert.equal(paise("-12.50"), -1250);
  assert.equal(decimal(-1250), "-12.50");
  assert.equal(decimal(5), "0.05");
  assert.equal(typedPaise("₹ 85,000"), 8500000);
  for (const bad of ["", "0", "-5", "1.234", "1e3"]) assert.throws(() => typedPaise(bad), /above zero/);
});

test("an export is a valid import", () => {
  const rows = [{ id: "a", date: "2026-11-02", description: 'Lunch, "team"', category: "Food", paise: -15050 }];
  assert.deepEqual(records(toCsv(rows))[0], { id: "a", date: "2026-11-02", description: 'Lunch, "team"', category: "Food", amount: "-150.50" });
});

test("normalization bounds untrusted state and keeps valid limits and recurring items", () => {
  const s = normalize({ budgets: { Food: 5000, Bad: -1, "": 9 } as never, recurring: [{ id: "r1", description: "Rent", category: "Housing", paise: -2500000, day: 3 }, { id: "x", description: "", category: "", paise: 0, day: 40 }] as never, editId: "", confirmDelete: true, draft: { date: "2026-02-30" } as never }, fixed());
  assert.deepEqual(s.budgets, { Food: 5000 });
  assert.equal(s.recurring!.length, 1);
  assert.equal(s.confirmDelete, false);
  assert.equal(s.draft!.date, "2026-11-17");
  assert.equal(s.month, "2026-11");
});

test("the shipped surface.json is the empty app and names no date", () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL("../apps/finance-workbench/surface.json", import.meta.url), "utf8")), surfaceFile());
  assert.deepEqual(surfaceFile().map((s) => s.id), ["overview", "ledger", "budgets", "insights", "recurring", "import"]);
  assert.ok(!JSON.stringify(surfaceFile()).includes("2000"));
});

test("views derive limits, comparisons and recurring status from one ledger read", () => {
  const ledger: Ledger = {
    total: 4, months: ["2026-11", "2026-10"], allCategories: ["Food", "Housing", "Income"], posted: ["rec-r1-2026-11"],
    rows: [{ id: "c", date: "2026-11-12", description: "Dinner", category: "Food", paise: -90000 }, { id: "b", date: "2026-11-03", description: "Rent", category: "Housing", paise: -2500000 }, { id: "a", date: "2026-11-01", description: "Salary", category: "Income", paise: 8500000 }],
    categories: [{ label: "Housing", amount: 25000 }, { label: "Food", amount: 900 }], daily: [],
    monthly: [{ label: "2026-10", moneyIn: 80000, moneyOut: 26000 }, { label: "2026-11", moneyIn: 85000, moneyOut: 25900 }],
    previous: [{ label: "Housing", amount: 25000 }, { label: "Food", amount: 1000 }], previousIn: 80000,
    payees: [{ description: "Rent", count: 1, amount: 25000 }], stack: [{ month: "2026-10", category: "Food", amount: 1000 }, { month: "2026-11", category: "Food", amount: 900 }],
  };
  const state = { month: "2026-11", budget: "30000", budgets: { Food: 80000 }, recurring: [{ id: "r1", description: "Rent", category: "Housing", paise: -2500000, day: 3 }, { id: "r2", description: "Gym", category: "Health", paise: -150000, day: 31 }] };
  const updates = view(state, ledger, fixed());
  const overview = dataOf(updates, "overview"), budgets = dataOf(updates, "budgets"), insights = dataOf(updates, "insights"), recurring = dataOf(updates, "recurring");
  assert.equal(overview.summary, "November 2026 · 3 transactions · ₹4,100.00 left of ₹30,000.00");
  assert.equal(overview.totals[2].value, "₹59,100.00");
  assert.deepEqual(overview.spendRun, [{ date: "2026-11-03", spent: 25000 }, { date: "2026-11-12", spent: 25900 }]);
  assert.deepEqual(overview.due.map((d: any) => d.id), ["r2"]);
  assert.equal(overview.due[0].meta, "Due 30 Nov · Health");
  assert.equal(budgets.limits[0].tone, "danger");
  assert.equal(budgets.limits[0].note, "₹100.00 over ₹800.00");
  assert.equal(budgets.allTone, "warning");
  assert.match(insights.summary, /₹100\.00 less than October 2026/);
  assert.equal(insights.compareRows[1].change, "-₹100.00");
  assert.deepEqual(recurring.added.map((d: any) => d.id), ["r1"]);
  const past = view({ ...state, month: "2026-10" }, { ...ledger, rows: [] }, fixed());
  assert.ok(!ids(past, "overview").includes("due"), "recurring items are due only in the calendar month");
  assert.ok(ids(past, "insights").includes("none"));
});

// A small in-memory stand-in for the app's DuckDB session: only the statements the actions issue.
function memory() {
  const rows = new Map<string, { id: string; date: string; description: string; category: string; paise: number }>();
  return {
    rows,
    async run(sql: string, v: (string | number | null)[] = []) {
      if (sql.startsWith("INSERT")) { if (rows.has(String(v[0]))) throw new Error("duplicate"); rows.set(String(v[0]), { id: String(v[0]), date: String(v[1]), description: String(v[2]), category: String(v[3]), paise: Number(v[4]) }); }
      else if (sql.startsWith("UPDATE")) Object.assign(rows.get(String(v[4]))!, { date: v[0], description: v[1], category: v[2], paise: v[3] });
      else if (sql === "DELETE FROM ledger") rows.clear();
      else if (sql.startsWith("DELETE")) rows.delete(String(v[0]));
    },
    async query(sql: string, v: (string | number | null)[] = []) {
      if (sql.includes("count(*)::INTEGER AS n FROM ledger")) return [{ n: rows.size }];
      if (sql.includes("WHERE id=?")) return rows.has(String(v[0])) ? [{ ...rows.get(String(v[0]))! }] : [];
      if (sql.includes("LIKE")) return [...rows.keys()].filter((id) => id.startsWith("rec-") && id.endsWith(String(v[0]).slice(-7))).map((id) => ({ id }));
      if (sql.includes(" IN (")) return v.filter((id) => rows.has(String(id))).map((id) => ({ id }));
      if (sql.includes("coalesce(")) return [{ i: 0 }];
      if (sql.includes("LIMIT 12")) return [{ m: "2026-11", i: 0, o: 0 }];
      return [];
    },
  };
}

test("add, edit, delete, limits and recurring items keep one ledger and one state", async () => {
  const db = memory(), c: any = { state: {}, database: db, now: fixed };
  // The stand-in answers no analytic query, so views here show no rows; state and stored rows are what is checked.
  await handleAction("/entry/amount", 250.5, c);
  await handleAction("/entry/description", " Lunch ", c);
  await assert.rejects(handleAction("save_entry", null, c, "save_entry"), /category/);
  await handleAction("/entry/newCategory", "Food", c);
  await handleAction("save_entry", null, c, "save_entry");
  assert.deepEqual(db.rows.get("entry-1"), { id: "entry-1", date: "2026-11-17", description: "Lunch", category: "Food", paise: -25050 });
  assert.equal(c.state.notice, "Added Lunch · -₹250.50.");
  assert.deepEqual([c.state.draft.amount, c.state.draft.description, c.state.draft.category], ["", "", "Food"]);

  let r = await handleAction("open_entry", { id: "entry-1" }, c, "open_entry");
  assert.equal((r as { focusSurface?: string }).focusSurface, "ledger");
  assert.equal(dataOf(r.updates, "ledger").entry.amount, "250.50");
  await handleAction("/entry/kind", "in", c);
  await handleAction("/entry/date", "2026-10-31", c);
  await handleAction("save_entry", null, c, "save_entry");
  assert.deepEqual([db.rows.get("entry-1")!.paise, db.rows.get("entry-1")!.date, c.state.month, c.state.editId], [25050, "2026-10-31", "2026-10", ""]);

  await handleAction("open_entry", { id: "entry-1" }, c, "open_entry");
  r = await handleAction("ask_delete", null, c, "ask_delete");
  assert.ok(ids(r.updates, "ledger").includes("e-confirm"));
  await handleAction("delete_entry", null, c, "delete_entry");
  assert.equal(db.rows.size, 0);
  await assert.rejects(handleAction("open_entry", { id: "entry-1" }, c, "open_entry"), /no longer/);

  await handleAction("/limit/amount", "40,000", c);
  await handleAction("save_limit", null, c, "save_limit");
  await handleAction("/limit/category", "Food", c);
  assert.equal(c.state.limit.amount, "");
  await handleAction("/limit/amount", 6000, c);
  await handleAction("save_limit", null, c, "save_limit");
  assert.deepEqual([c.state.budget, c.state.budgets], ["40000.00", { Food: 600000 }]);
  await handleAction("/limit/category", "*", c);
  assert.equal(c.state.limit.amount, "40000.00");
  await handleAction("remove_limit", null, c, "remove_limit");
  assert.equal(c.state.budget, "");

  await handleAction("/rec/amount", 25000, c);
  await handleAction("/rec/description", "Rent", c);
  await handleAction("/rec/category", "Housing", c);
  await handleAction("/rec/day", 31, c);
  await handleAction("save_rec", null, c, "save_rec");
  const rec = c.state.recurring[0];
  assert.deepEqual([rec.description, rec.paise, rec.day], ["Rent", -2500000, 31]);
  await handleAction("post_due", null, c, "post_due");
  assert.deepEqual(db.rows.get(`rec-${rec.id}-2026-11`), { id: `rec-${rec.id}-2026-11`, date: "2026-11-30", description: "Rent", category: "Housing", paise: -2500000 });
  await assert.rejects(handleAction("post_recurring", { id: rec.id }, c, "post_recurring"), /Nothing left/);
  await handleAction("open_rec", { id: rec.id }, c, "open_rec");
  await handleAction("delete_rec", null, c, "delete_rec");
  assert.deepEqual([c.state.recurring.length, db.rows.size], [0, 1]);
  assert.equal((await renderApp(c)).updates.length, 6);
});

test("a draft edit returns only its own view and keeps retained figures", async () => {
  const retained = { summary: "kept", transactions: [{ id: "a" }], entry: {} };
  const c: any = { state: {}, database: memory(), now: fixed, surfaces: { ledger: { data: retained } } };
  const r = await handleAction("/entry/description", "Tea", c);
  assert.equal(r.updates.length, 1);
  assert.deepEqual(r.updates[0]!.nodes, []);
  assert.equal(dataOf(r.updates, "ledger").summary, "kept");
  assert.equal(dataOf(r.updates, "ledger").entry.description, "Tea");
  await assert.rejects(handleAction("/unknown", 1, c), /Unknown/);
});
