import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { handleAction, renderApp, surfaceFile } from "../server.ts";
import { landing, landingBlank, saveWorkload, workloadBlank } from "../plan.ts";

const a = { tenant: "00000000-1000-4000-8000-000000000001", subscription: "00000000-2000-4000-8000-000000000001", customer: "North", label: "Production" };
const b = { tenant: "00000000-1000-4000-8000-000000000002", subscription: "00000000-2000-4000-8000-000000000002", customer: "South", label: "Sandbox" };
const at = "2026-11-16T12:00:00.000Z";
const later = "2026-11-17T12:00:00.000Z";
const asset = (sub: string, name: string) => ({ id: `/subscriptions/${sub}/resourceGroups/ops/providers/Microsoft.Network/virtualNetworks/${name}`, name, type: "microsoft.network/virtualnetworks", location: "centralindia", group: "ops" });
const bundle = (scope: typeof a, date: string, names: string[]) => ({
  scope, snapshot: { at: date, sources: { inventory: { at: date, status: "complete", rows: names.map(n => asset(scope.subscription, n)) },
    alerts: { at: date, status: "unavailable", reason: "Missing alert read role." }, health: { at: date, status: "complete", rows: [] } } },
});

test("empty surfaces match the generated package", () => {
  assert.deepEqual(surfaceFile(), JSON.parse(readFileSync(new URL("../surface.json", import.meta.url), "utf8")));
});

test("explicit app reads require matching tenant and subscription and compare only retained same-scope evidence", async () => {
  let response = bundle(a, at, ["old"]);
  const calls: string[] = [];
  const context = { state: {} as Record<string, unknown>, callTool: async (tool: string, args: Record<string, unknown>) => {
    calls.push(tool);
    if (tool.endsWith("__list_scopes")) return { scopes: [{ ...a, capturedAt: at }, { ...b, capturedAt: "" }] };
    assert.deepEqual(args, { tenant: a.tenant, subscription: a.subscription });
    return JSON.stringify(response);
  } };
  const action = (kind: string) => handleAction(kind, null, context, kind);
  const estateView = () => renderApp(context).updates[0]!;
  const estate = () => estateView().data[0]!.value as Record<string, any>;
  const hasScopePicker = () => estateView().nodes.some(node => node.id === "estate-scope");
  await action("load_scopes");
  assert.ok(hasScopePicker());
  await action("load_capture");
  assert.equal(hasScopePicker(), false);
  await action("toggle_source_controls");
  assert.ok(hasScopePicker());
  assert.equal(estate().receipts[1].coverage, "Unavailable");
  response = bundle(b, later, ["private"]);
  await assert.rejects(action("load_capture"), /another customer scope/);
  assert.equal(estate().assets[0].name, "old");
  response = bundle(a, later, ["new"]);
  await action("load_capture");
  assert.equal(hasScopePicker(), false);
  assert.deepEqual(estate().changes.map((r: any) => r.change), ["Added to capture", "Absent from newer capture"]);
  await handleAction("/selected", b.subscription, context);
  assert.deepEqual(estate().assets, []);
  assert.equal(calls.length, 4);
});

test("landing inputs validate the network address and essential pipeline fields", () => {
  const ready = { ...landingBlank(), name: "Production", region: "centralindia", managementGroup: "corp", owner: "Platform", change: "CHG-5", cidr: "10.20.0.0/16" };
  assert.equal(landing(ready, true).change, "CHG-5");
  assert.throws(() => landing({ ...ready, cidr: "10.20.1.0/16" }, true), /network address/);
});

test("migration gates enforce wave ordering, prerequisites, approved inputs and closure evidence", () => {
  const workload = (key: string, wave: string, dependencies = "") => ({ ...workloadBlank(), key, name: key, owner: "Engineer", source: "Assessment 12", target: "Azure VM", dependencies, wave });
  let list = saveWorkload(workload("db", "1"), [], "");
  list = saveWorkload(workload("api", "2", "db"), list, "");
  const update = (key: string, patch: Record<string, string>) => saveWorkload({ ...list.find(w => w.key === key)!, ...patch }, list, key);
  assert.throws(() => update("db", { wave: "3" }), /prerequisite after/);
  assert.throws(() => update("api", { stage: "Approved" }), /stage available/);
  list = update("api", { stage: "Assessed" });
  assert.throws(() => update("api", { stage: "Tested" }), /test result and rollback/);
  list = update("api", { stage: "Tested", test: "Run 3 passed", rollback: "Restore before 22:00 UTC" });
  list = update("api", { stage: "Approved", approval: "CHG-5" });
  assert.throws(() => update("api", { target: "Different VM" }), /approved inputs/);
  assert.throws(() => update("api", { stage: "Cut over" }), /prerequisite workload/);
  list = update("db", { stage: "Assessed" });
  list = update("db", { stage: "Tested", test: "Data check", rollback: "Restore replica" });
  list = update("db", { stage: "Approved", approval: "CHG-4" });
  list = update("db", { stage: "Cut over" });
  list = update("api", { stage: "Cut over" });
  assert.throws(() => update("api", { stage: "Verified" }), /validation or rollback evidence/);
  list = update("api", { stage: "Verified", outcome: "Customer smoke tests passed" });
  assert.equal(list.find(w => w.key === "api")?.stage, "Verified");
});

test("visual data reconciles to captured assets and draws only the selected workload's direct prerequisites", async () => {
  const { inventoryVisuals, dependencyVisual } = await import("../visuals.ts");
  const assets = Array.from({ length: 17 }, (_, i) => ({ ...asset(a.subscription, "app-" + i), location: "region-" + i }));
  const map = inventoryVisuals(assets, "group/ops", 1);
  assert.equal(map.byRegion.reduce((sum, bin) => sum + bin.count, 0), assets.length);
  assert.equal(map.byRegion.find(bin => bin.label === "Other regions")?.count, 11);
  assert.match(map.summary, /9–16 of 17/);
  assert.equal(map.edges.length, 8);
  assert.equal(map.nodes.length, 9);
  const db = { ...workloadBlank(), key: "db", name: "Database" };
  const api = { ...workloadBlank(), key: "api", name: "API", dependencies: "db" };
  const queue = { ...workloadBlank(), key: "queue", name: "Queue" };
  const graph = dependencyVisual([db, api, queue], "api");
  assert.deepEqual(graph.nodes.map(node => node.id), ["api", "db"]);
  assert.deepEqual(graph.edges, [{ from: "db", to: "api" }]);
  assert.deepEqual(dependencyVisual([db, api, queue], "queue").edges, []);
});
