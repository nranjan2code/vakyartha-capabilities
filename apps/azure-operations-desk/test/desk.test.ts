import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { invoiceFromCsv, variance } from "../billing.ts";
import { capture } from "../capture.ts";
import { csv, parseCapture, type Scope } from "../data.ts";
import { handleAction, handleQuery, renderApp, surfaceFile } from "../server.ts";

const tenantA = "00000000-1000-4000-8000-000000000001";
const tenantB = "00000000-1000-4000-8000-000000000002";
const subA = "00000000-2000-4000-8000-000000000001";
const subB = "00000000-2000-4000-8000-000000000002";
const A: Scope = { tenant: tenantA, subscription: subA, customer: "North", label: "Production", owner: "NOC" };
const B: Scope = { tenant: tenantB, subscription: subB, customer: "South", label: "Sandbox", owner: "" };
const date = (ms: number) => new Date(ms).toISOString();
const resource = (sub: string, label: string) => ({
  id: `/subscriptions/${sub}/resourceGroups/ops/providers/Microsoft.Compute/virtualMachines/${label}`,
  name: label, type: "microsoft.compute/virtualmachines", location: "centralindia", group: "ops",
});
const alert = (sub: string, at: string) => ({
  id: `/subscriptions/${sub}/providers/Microsoft.AlertsManagement/alerts/abc`,
  title: "Availability low", condition: "Fired", level: 1, occurred: at, target: resource(sub, "api").id,
});
function bundle(scope: Scope, time: number, alerts = true) {
  const at = date(time);
  return {
    schema: 1, tenant: scope.tenant, subscription: scope.subscription, at,
    sources: {
      inventory: { at, status: "complete", rows: [resource(scope.subscription, scope.customer === "North" ? "api" : "db")] },
      alerts: alerts ? { at, status: "complete", rows: [alert(scope.subscription, at)] }
        : { at, status: "unavailable", reason: "Subscription access was revoked." },
      health: { at, status: "complete", rows: [] },
    },
  };
}
function desk() {
  const context = { state: {} as Record<string, unknown> };
  const edit = (id: string, value: unknown) => handleAction(id, value, context);
  const action = (id: string, value?: unknown) => handleAction(id, value, context, id);
  const add = (scope: Scope) => {
    action("new_scope");
    for (const [k, v] of Object.entries(scope)) edit(`/scopeDraft/${k}`, v);
    action("save_scope");
  };
  const view = (id: string) => renderApp(context).updates.find(u => u.surface === id)!.data[0]!.value as Record<string, any>;
  const stage = (scope: Scope, data: unknown) => {
    edit("/captureScope", scope.subscription);
    edit("/captureText", JSON.stringify(data));
  };
  return { context, action, add, edit, view, stage };
}

test("shipped initial projections match the tool-free renderer", () => {
  assert.deepEqual(surfaceFile(), JSON.parse(readFileSync(new URL("../surface.json", import.meta.url), "utf8")));
  assert.deepEqual(renderApp({ state: {} }).updates.map(u => u.surface), ["queue", "customers", "inventory", "captures", "service"]);
});

test("triage is scoped, survives a failed source and recapture, and excludes older observations", () => {
  const d = desk();
  const now = Date.now() - 1000;
  d.add(A);
  d.stage(A, bundle(A, now - 30_000));
  d.action("import_capture");
  const lead = d.view("queue");
  const key = lead.leadKey;
  assert.ok(key);
  assert.equal(lead.leadTitle, "Availability low");
  assert.equal(lead.rows.length, 0, "featured signal should not repeat in the queue");
  d.action("open_issue", { key });
  d.edit("/issueDraft/owner", "Asha");
  d.edit("/issueDraft/status", "Investigating");
  d.edit("/issueDraft/note", "Check the regional endpoint.");
  assert.deepEqual(d.action("save_triage").updates.map(u => u.surface), ["queue", "service"]);
  d.add(B);
  assert.throws(() => d.stage(B, bundle(A, now)), /different tenant or subscription/);
  d.stage(B, bundle(B, now - 20_000));
  d.action("import_capture");
  d.edit("/queueScope", B.subscription);
  assert.match(d.view("queue").leadContext, /South \/ Sandbox/);
  assert.notEqual(d.view("queue").leadKey, key);
  assert.throws(() => d.action("open_issue", { key }), /unavailable/);
  d.edit("/inventoryScope", B.subscription);
  assert.equal(d.view("inventory").rows[0].name, "db");

  d.stage(A, bundle(A, now - 10_000, false));
  d.action("import_capture");
  assert.equal(d.view("captures").rows[1].status, "Unavailable");
  assert.equal(d.view("captures").rows[1].count, "Unknown");
  assert.equal(d.view("captures").rows[2].count, "0");
  d.edit("/queueScope", A.subscription);
  assert.equal(d.view("queue").rows.length, 0);
  d.stage(A, bundle(A, now - 20_000));
  assert.throws(() => d.action("import_capture"), /already saved/);
  d.stage(A, bundle(A, now));
  d.action("import_capture");
  d.action("open_issue", { key });
  assert.equal(d.view("queue").issueDraft.owner, "Asha");
  assert.equal(d.view("queue").issueDraft.note, "Check the regional endpoint.");
  assert.match(d.view("queue").export, /North.*Asha/);
  assert.doesNotMatch(d.view("queue").export, /South|regional endpoint/);
  d.edit("/issueDraft/status", "Done");
  const completed = d.action("save_triage").updates[0]!;
  assert.ok(!completed.nodes.some(node => node.id === "issue-form"));
  assert.equal(d.view("queue").rows.length, 0);
  d.edit("/queueStatus", "Done");
  assert.equal(d.view("queue").rows[0].badge, "Done");
});

test("mislabeled rows, future timestamps and CSV formulas do not cross import and export boundaries", () => {
  const now = Date.now();
  const input = bundle(A, now);
  input.sources.inventory.rows.push(resource(subB, "other-tenant"));
  assert.throws(() => parseCapture(JSON.stringify(input), A, now), /different subscription/);
  assert.throws(() => parseCapture(JSON.stringify(bundle(A, now + 6 * 60_000)), A, now), /inconsistent times/);
  assert.match(csv([[" =cmd()", 'line "quoted"']]), /^"' =cmd\(\)","line ""quoted"""\r\n$/);
});

test("collector uses explicit scope, follows Graph continuation, and reports inconsistent coverage", async () => {
  const calls: string[][] = [];
  const result = await capture(A.tenant, A.subscription, async args => {
    calls.push(args);
    if (args[0] === "account") return { id: subA, tenantId: tenantB, homeTenantId: tenantA };
    const url = args[args.indexOf("--url") + 1]!;
    if (url.endsWith("2022-12-01")) return { tenantId: tenantA, subscriptionId: subA };
    if (url.includes("Microsoft.AlertsManagement")) return {
      value: [{ ...alert(subA, date(Date.now())), name: "Availability low", properties: {
        essentials: { severity: "Sev1", monitorCondition: "Fired", targetResource: resource(subA, "api").id },
      } }],
    };
    const body = JSON.parse(args[args.indexOf("--body") + 1]!);
    assert.deepEqual(body.subscriptions, [subA]);
    if (body.query.startsWith("ServiceHealthResources")) return { data: [], count: 0, totalRecords: 9, resultTruncated: "false" };
    if (body.options["$skipToken"]) return { data: [resource(subA, "db")], count: 1, totalRecords: 2, resultTruncated: "false" };
    return { data: [resource(subA, "api")], count: 1, totalRecords: 2, resultTruncated: "true", "$skipToken": "next" };
  });
  assert.equal(calls.length, 6);
  assert.ok(calls.every(args => args[args.indexOf("--subscription") + 1] === subA));
  const received = parseCapture(JSON.stringify(result), A, Date.now());
  assert.deepEqual(received.sources.inventory.status === "complete" && received.sources.inventory.rows.map(r => r.name), ["api", "db"]);
  assert.equal(received.sources.alerts.status, "complete");
  assert.equal(received.sources.health.status, "unavailable");
});

test("collector stops before source reads when ARM cannot verify the subscription", async () => {
  let calls = 0;
  const result = await capture(A.tenant, A.subscription, async args => {
    calls++;
    if (args[0] === "account") return { id: subA, tenantId: tenantA };
    throw new Error("AuthorizationFailed");
  });
  assert.equal(calls, 2);
  for (const item of Object.values(result.sources)) assert.equal(item.status, "unavailable");
});

test("service work closes with evidence and publishes only scoped handover rows", () => {
  const d = desk();
  d.add(A); d.add(B);
  d.edit("/serviceScope", A.subscription);
  d.edit("/workDraft/title", "Verify the backup restore");
  d.edit("/workDraft/kind", "Backup");
  d.edit("/workDraft/status", "Closed");
  assert.throws(() => d.action("save_work"), /outcome or evidence/);
  d.edit("/workDraft/evidence", "Restore 102 completed");
  d.action("save_work");
  assert.match(d.view("service").summary, /1 closed/);
  assert.match(d.view("service").serviceExport, /Restore 102 completed/);
  assert.doesNotMatch(d.view("service").serviceExport, /South/);
  assert.throws(() => handleQuery("read_scope", { tenant: tenantB, subscription: subA }, d.context), /unavailable/);
  assert.doesNotMatch(JSON.stringify(handleQuery("read_scope", { tenant: tenantA, subscription: subA }, d.context)), /Restore 102/);
});

test("invoice lines use exact amounts, retain credit adjustments, and reject mixed currencies", () => {
  const fields = "InvoiceNumber,CustomerId,Currency,Subtotal,TaxTotal,Total";
  const source = [fields, `INV-88,${tenantA},USD,0.1,0,0.1`, `INV-88,${tenantA},USD,0.2,0,0.2`, `INV-88,${tenantB},USD,-0.01,0,-0.01`].join("\r\n");
  const invoice = invoiceFromCsv(source, "0.30", Date.now());
  assert.equal(invoice.total, "0.29");
  assert.equal(invoice.groups[0]?.count, 2);
  assert.equal(variance(invoice), "-0.01");
  assert.throws(() => invoiceFromCsv(source.replace("USD,-0.01", "INR,-0.01"), "0.30", Date.now()), /one invoice and billing currency/);
});
