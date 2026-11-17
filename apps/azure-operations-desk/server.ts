import { randomUUID } from "node:crypto";
import { invoiceFromCsv, readInvoices, variance, type Invoice } from "./billing.ts";
import { blankWork, workRecord, WORK_KINDS, WORK_STATES, type Work } from "./work.ts";
import {
  coverage, csv, field, guid, LABELS, MAX_SCOPES, obj, parseCapture, parseResult, parseScope, parseTriage,
  SOURCES, STATUSES, stamp, utc,
  type Capture, type Scope, type Signal, type Sources, type Triage,
} from "./data.ts";

const TITLES = { queue: "Needs attention", customers: "Customers", inventory: "Inventory", captures: "Captures", service: "Service review" } as const;
type ViewId = keyof typeof TITLES;
type Node = { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } };
type State = {
  scopes: Scope[];
  snapshots: Record<string, { at: string; sources: Sources }>;
  triage: Record<string, Triage>;
  queueScope: string;
  queueStatus: string;
  inventoryScope: string;
  captureScope: string;
  selected: string;
  issueDraft: { status: string; owner: string; note: string };
  scopeDraft: Scope;
  editingScope: string;
  staged: Capture | null;
  serviceScope: string;
  work: Work[];
  workDraft: Work;
  invoices: Invoice[];
  invoiceExpected: string;
  stagedInvoice: Invoice | null;
  selectedInvoice: string;
};
type Context = { state: Record<string, unknown> };
type Issue = Signal & { key: string; scope: Scope; kind: "alerts" | "health"; at: string; freshness: string; triage: Triage };
const blankScope = (): Scope => ({ customer: "", label: "", tenant: "", subscription: "", owner: "" });
const blankIssue = () => ({ status: "New", owner: "", note: "" });
const maxCheckpoint = 2 * 1024 * 1024;
const maxTriage = 1600;

export function normalize(raw: unknown): State {
  const v = obj(raw);
  const scopes = Array.isArray(v.scopes) ? v.scopes.map(parseScope) : [];
  if (scopes.length > MAX_SCOPES || new Set(scopes.map(s => s.subscription)).size !== scopes.length) throw Error("Invalid saved subscriptions.");
  const snapshots: State["snapshots"] = Object.create(null);
  const triage: State["triage"] = Object.create(null);
  for (const scope of scopes) {
    const rawSnapshot = obj(obj(v.snapshots)[scope.subscription]);
    if (rawSnapshot.at === undefined) continue;
    const s = obj(rawSnapshot.sources);
    snapshots[scope.subscription] = {
      at: stamp(rawSnapshot.at, "saved capture time"),
      sources: {
        ...(s.inventory === undefined ? {} : { inventory: parseResult(s.inventory, "inventory", scope.subscription) }),
        ...(s.alerts === undefined ? {} : { alerts: parseResult(s.alerts, "alerts", scope.subscription) }),
        ...(s.health === undefined ? {} : { health: parseResult(s.health, "health", scope.subscription) }),
      },
    };
  }
  const entries = Object.entries(obj(v.triage));
  if (entries.length > maxTriage) throw Error("Too many saved triage records.");
  for (const [key, value] of entries) triage[field(key, 850, "saved issue key", true)] = parseTriage(value);
  const scopeId = (value: unknown, fallback: string) => scopes.some(s => s.subscription === value) ? String(value) : fallback;
  const captureScope = scopeId(v.captureScope, scopes[0]?.subscription ?? "");
  const rawIssue = obj(v.issueDraft), rawScope = obj(v.scopeDraft);
  const work = Array.isArray(v.work) ? v.work.map(workRecord) : [];
  if (work.length > 320 || work.some(item => !scopes.some(scope => scope.subscription === item.subscription))) throw Error("Invalid retained service work.");
  const workDraft = Object.fromEntries(Object.entries(blankWork()).map(([k, fallback]) => [k, field(obj(v.workDraft)[k] ?? fallback, 1000, "work draft")])) as Work;
  const invoices = readInvoices(v.invoices);

  return {
    scopes, snapshots, triage, captureScope,
    queueScope: scopeId(v.queueScope, "all"),
    queueStatus: v.queueStatus === "Done" || v.queueStatus === "All" ? v.queueStatus : "Open",
    inventoryScope: scopeId(v.inventoryScope, scopes[0]?.subscription ?? ""),
    selected: field(v.selected ?? "", 850, "issue key"),
    issueDraft: {
      status: field(rawIssue.status ?? "New", 20, "triage status"), owner: field(rawIssue.owner ?? "", 100, "owner"),
      note: field(rawIssue.note ?? "", 1500, "triage note"),
    },
    scopeDraft: Object.fromEntries(Object.keys(blankScope()).map(k => [k, field(rawScope[k] ?? "", 110, "subscription draft")])) as Scope,
    editingScope: scopeId(v.editingScope, ""),
    serviceScope: scopeId(v.serviceScope, scopes[0]?.subscription ?? ""),
    work, workDraft, invoices,
    invoiceExpected: field(v.invoiceExpected ?? "", 40, "invoiced charges total"),
    stagedInvoice: v.stagedInvoice ? readInvoices([v.stagedInvoice])[0]! : null,
    selectedInvoice: field(v.selectedInvoice ?? "", 110, "invoice key"),
    staged: v.staged && captureScope
      ? parseCapture(JSON.stringify(v.staged), scopes.find(s => s.subscription === captureScope)!, Date.now())
      : null,
  };
}

function issues(s: State, now: number): Issue[] {
  return s.scopes.flatMap(scope => {
    const sources = s.snapshots[scope.subscription]?.sources;
    return (["alerts", "health"] as const).flatMap(kind => {
      const source = sources?.[kind];
      if (source?.status !== "complete") return [];
      return source.rows.map(row => {
        const key = row.id.toLowerCase();
        return { ...row, key, scope, kind, at: source.at, freshness: coverage(source, now),
          triage: s.triage[key] ?? { status: "New", owner: scope.owner, note: "", at: "" } };
      });
    });
  }).sort((a, b) => a.level - b.level || b.occurred.localeCompare(a.occurred) || a.key.localeCompare(b.key));
}

const node = (id: string, type: string, props: Record<string, unknown> = {}, children?: Node["children"]): Node =>
  ({ id, type, props, ...(children ? { children } : {}) });
const caption = (id: string, content: string) => node(id, "text", { content, variant: "caption" });
const button = (id: string, label: string, action: string, payload?: Record<string, unknown>, style = "secondary") =>
  node(id, "button", { label, action, style, ...(payload ? { payload } : {}) });
const select = (id: string, label: string, bind: string, options: {label: string; value: string}[]) =>
  node(id, "select", { label, bind, options, presentation: "dropdown", maxWidth: "sm" });
const options = (choices: readonly string[]) => choices.map(value => ({ value, label: value }));
const scopedOptions = (s: State) => s.scopes.map(scope => ({ value: scope.subscription, label: `${scope.customer} / ${scope.label}` }));
const empty = (id: string, title: string, body: string) => node(id, "alert", { title, body, tone: "info" });
const table = (id: string, rows: string, columns: [string, string][], search = true) =>
  node(id, "table", { rows, columns: columns.map(([key, label]) => ({ key, label })), pageSize: 12, searchable: search, sortable: true });
const root = (children: string[]) => node("root", "stack", { gap: "md", density: "compact" }, children);

const plain = (str: string) => str.replace(/[\\`*_{}\[\]()#+\-.!<>~|]/g, "\\$&");

function queue(s: State, now: number) {
  const all = issues(s, now);
  const scoped = s.queueScope !== "all" ? all.filter(i => i.scope.subscription === s.queueScope) : all;
  const open = scoped.filter(i => i.triage.status !== "Done");
  const shown = s.queueStatus === "Open" ? open : s.queueStatus === "Done" ? scoped.filter(i => i.triage.status === "Done") : scoped;
  const scopes = s.queueScope !== "all" ? s.scopes.filter(i => i.subscription === s.queueScope) : s.scopes;
  const gaps = scopes.reduce((n, scope) => n + (["alerts", "health"] as const).filter(k =>
    coverage(s.snapshots[scope.subscription]?.sources[k], now) !== "Captured").length, 0);
  const selected = shown.find(i => i.key === s.selected);
  const lead = !selected && s.queueStatus === "Open" ? open[0] : undefined;
  const listed = lead ? shown.filter(i => i.key !== lead.key) : shown;
  const listId = listed.length ? "queue-list" : "queue-empty-results";
  const urgent = open.filter(i => i.level < 2).length;
  const data = {
    queueScope: s.queueScope, queueStatus: s.queueStatus, issueDraft: s.issueDraft,
    summary: `${open.length} open of ${scoped.length} captured signals. ${gaps} alert or health ${gaps === 1 ? "source" : "sources"} missing, stale, or unavailable.`,
    leadTitle: lead?.title ?? "",
    leadContext: lead ? plain(`${lead.scope.customer} / ${lead.scope.label} · ${LABELS[lead.kind]} · ${lead.freshness} · ${lead.triage.owner || "Unassigned"}`) : "",
    leadKey: lead?.key ?? "",
    headline: urgent ? `${urgent} high or critical ${urgent === 1 ? "signal" : "signals"}` :
      open.length ? `${open.length} open ${open.length === 1 ? "signal" : "signals"}` :
      gaps ? "Coverage needs review" : "No open signals in this capture",
    spoken: s.scopes.length
      ? `Azure Operations Desk has ${open.length} open signals in this scope. ${open.filter(i => i.level < 2).length} have high or critical source severity. ${gaps} alert or health sources are missing, stale, or unavailable. These figures are based on imported captures.`
      : "No subscriptions are registered. Add a customer subscription to start tracking captures.",
    rows: listed.map(i => ({
      key: i.key, title: i.title, subtitle: `${i.scope.customer} / ${i.scope.label}`,
      body: plain(`${LABELS[i.kind]} · ${i.condition} · ${i.triage.owner || "Unassigned"} · ${i.freshness}`),
      badge: i.triage.status, tone: i.level < 2 ? "danger" : i.level < 4 ? "warning" : "neutral",
    })),
    detail: selected ? [
      `${selected.scope.customer} / ${selected.scope.label}`,
      `${LABELS[selected.kind]} · ${selected.condition} · ${selected.freshness}`,
      `Event time: ${utc(selected.occurred)}. Capture time: ${utc(selected.at)}.`,
      ...(selected.triage.at ? [`Local triage updated: ${utc(selected.triage.at)}.`] : []),
    ].map(plain).join("\n\n") : "",
    sourceId: selected?.id ?? "",
    targetId: selected?.target ?? "",
    export: csv([
      ["Customer", "Tenant ID", "Subscription ID", "Title", "Source", "Source ID", "Target ID", "Source condition", "Severity rank (0 highest, 5 unknown)", "Occurred UTC", "Captured UTC", "Coverage", "Triage status", "Owner"],
      ...shown.map(i => [i.scope.customer, i.scope.tenant, i.scope.subscription, i.title, LABELS[i.kind], i.id, i.target, i.condition, i.level, i.occurred, i.at, i.freshness, i.triage.status, i.triage.owner]),
    ]),
  };
  const nodes = s.scopes.length ? [
    root(selected ? ["issue-heading", "issue-back", "issue-evidence", "issue-form", "issue-source"] : [
      "queue-headline", "queue-caption", ...(lead ? ["queue-lead"] : []), "queue-tools", ...(lead && !listed.length ? [] : [listId]),
    ]),
    ...(!selected ? [
      node("queue-headline", "text", { variant: "heading", content: "{/headline}" }),
      caption("queue-caption", "{/summary}"),
      ...(lead ? [
        node("queue-lead", "card", { layout: "row", title: "{/leadTitle}", body: "{/leadContext}",
          badge: "Top priority", tone: lead.level < 2 ? "danger" : "info" }, ["queue-open-priority"]),
        button("queue-open-priority", "Review signal", "open_issue", { key: "{/leadKey}" }, "primary"),
      ] : []),
      node("queue-tools", "stack", { direction: "horizontal", align: "end", wrap: true }, [
        "queue-scope", "queue-status", ...(gaps ? ["queue-captures"] : []), ...(shown.length ? ["queue-export"] : []),
      ]),
      select("queue-scope", "Subscription", "/queueScope", [{ value: "all", label: "All subscriptions" }, ...scopedOptions(s)]),
      select("queue-status", "Triage status", "/queueStatus", options(["Open", "Done", "All"])),
      ...(gaps ? [button("queue-captures", "Review coverage", "view.open", { surface: "captures" }, "link")] : []),
      ...(shown.length ? [button("queue-export", "Export queue CSV", "file.save", { name: "azure-operations-queue", text: "/export" }, "link")] : []),
      ...(listed.length ? [
        node("queue-list", "grid", { columns: 1, pageSize: 12, searchable: true }, { each: "/rows", template: "queue-row" }),
        node("queue-row", "card", { layout: "row", title: "{title}", subtitle: "{subtitle}", body: "{body}", badge: "{badge}", tone: "{tone}", action: "open_issue", payload: { key: "{key}" } }),
      ] : lead ? [] : [empty("queue-empty-results", "No signals in this view", gaps ? "Review the outstanding capture gaps before drawing a conclusion." : "No imported signals match these filters.")]),
    ] : []),
    ...(selected ? [
      node("issue-heading", "text", { variant: "heading", content: plain(selected.title) }),
      button("issue-back", "Back to signals", "close_issue", undefined, "link"),
      node("issue-source", "section", { title: "Azure references" }, ["source-label", "source-id", ...(selected.target ? ["target-label", "target-id"] : [])]),
      node("issue-evidence", "text", { content: "{/detail}" }),
      caption("source-label", "Source resource ID"),
      node("source-id", "text", { content: "{/sourceId}", variant: "code" }),
      ...(selected.target ? [
        caption("target-label", "Affected resource ID"),
        node("target-id", "text", { content: "{/targetId}", variant: "code" }),
      ] : []),
      node("issue-form", "form", { submit: "save_triage", submitLabel: "Save triage" }, ["issue-status", "issue-owner", "issue-note"]),
      select("issue-status", "Local status", "/issueDraft/status", options(STATUSES)),
      node("issue-owner", "input", { label: "Local owner", bind: "/issueDraft/owner" }),
      node("issue-note", "textarea", { label: "Local follow-up note", bind: "/issueDraft/note", rows: 3 }),
    ] : []),
  ] : [
    root(["queue-empty", "queue-add"]),
    empty("queue-empty", "Add your first customer subscription", "Register its scope, then import a capture to build the queue."),
    button("queue-add", "Set up customers", "view.open", { surface: "customers" }, "primary"),
  ];
  return { nodes, data };
}

function customers(s: State, now: number) {
  const data = {
    scopeDraft: s.scopeDraft,
    rows: s.scopes.map(scope => ({
      subscription: scope.subscription, customer: scope.customer, label: scope.label,
      detail: SOURCES.map(k => `${LABELS[k]}: ${coverage(s.snapshots[scope.subscription]?.sources[k], now)}`).join(" · "),
    })),
    identity: s.editingScope ? `Tenant ID: ${s.scopeDraft.tenant}. Subscription ID: ${s.scopeDraft.subscription}.` : "",
  };
  const identity = s.editingScope ? ["customer-identity"] : ["customer-tenant", "customer-subscription"];
  return { data, nodes: [
    root(["customer-caption", ...(s.scopes.length ? ["customer-split"] : ["customer-editor"])]),
    caption("customer-caption", "Register each subscription under its customer and tenant."),
    ...(s.scopes.length ? [
      node("customer-split", "split", { ratio: "1:2" }, ["customer-list-box", "customer-editor"]),
      node("customer-list-box", "stack", { gap: "sm" }, ["customer-list", "customer-add"]),
      node("customer-list", "grid", { columns: 1, pageSize: 12, searchable: true }, { each: "/rows", template: "customer-row" }),
      node("customer-row", "card", { layout: "row", title: "{customer}", subtitle: "{label}", body: "{detail}", action: "edit_scope", payload: { subscription: "{subscription}" } }),
      button("customer-add", "Add subscription", "new_scope"),
    ] : []),
    node("customer-editor", "section", { title: s.editingScope ? "Edit subscription details" : "Register subscription" }, ["customer-form"]),
    node("customer-form", "form", { submit: "save_scope", submitLabel: "Save subscription" }, ["customer-name", "customer-label", ...identity, "customer-owner"]),
    node("customer-name", "input", { label: "Customer name", bind: "/scopeDraft/customer" }),
    node("customer-label", "input", { label: "Subscription name", bind: "/scopeDraft/label" }),
    ...(s.editingScope ? [caption("customer-identity", "{/identity}")] : [
      node("customer-tenant", "input", { label: "Tenant ID", bind: "/scopeDraft/tenant" }),
      node("customer-subscription", "input", { label: "Subscription ID", bind: "/scopeDraft/subscription" }),
    ]),
    node("customer-owner", "input", { label: "Default owner", bind: "/scopeDraft/owner" }),
  ] };
}

function inventory(s: State, now: number) {
  const scope = s.scopes.find(i => i.subscription === s.inventoryScope);
  const source = scope && s.snapshots[scope.subscription]?.sources.inventory;
  const rows = source?.status === "complete" ? source.rows : [];
  const data = { inventoryScope: s.inventoryScope, rows,
    summary: source ? `${coverage(source, now)} · ${utc(source.at)} · ${source.status === "complete" ? `${rows.length} resources` : source.reason}` : "No inventory capture for this subscription.",
    export: csv([
      ["Tenant ID", "Subscription ID", "Resource ID", "Name", "Type", "Region", "Resource group", "Captured UTC", "Coverage"],
      ...rows.map(r => [scope!.tenant, scope!.subscription, r.id, r.name, r.type, r.location, r.group, source!.at, coverage(source, now)]),
    ]),
  };
  return { data, nodes: scope ? [
    root(["inventory-caption", "inventory-bar", rows.length ? "inventory-results" : "inventory-empty-results"]),
    caption("inventory-caption", "{/summary}"),
    node("inventory-bar", "stack", { direction: "horizontal", wrap: true }, ["inventory-scope", "inventory-captures", ...(rows.length ? ["inventory-export"] : [])]),
    select("inventory-scope", "Subscription", "/inventoryScope", scopedOptions(s)),
    button("inventory-captures", "Review captures", "view.open", { surface: "captures" }),
    ...(rows.length ? [
      button("inventory-export", "Export inventory CSV", "file.save", { name: "azure-operations-inventory", text: "/export" }),
      table("inventory-results", "{/rows}", [["name", "Name"], ["type", "Type"], ["location", "Region"], ["group", "Resource group"], ["id", "Resource ID"]]),
    ] : [empty("inventory-empty-results", "No resources to show", source?.status === "complete" ? "This scoped capture returned zero resources." : "Import a successful Resource Graph capture to see this inventory.")]),
  ] : [root(["inventory-empty"]), empty("inventory-empty", "Add a subscription first", "The Customers view holds subscription scopes.")] };
}

function captures(s: State, now: number) {
  const scope = s.scopes.find(i => i.subscription === s.captureScope);
  const snapshot = scope && s.snapshots[scope.subscription];
  const data = {
    captureScope: s.captureScope, captureText: s.staged ? JSON.stringify(s.staged) : "",
    command: scope ? `node capture.ts ${scope.tenant} ${scope.subscription}` : "",
    rows: SOURCES.map(kind => {
      const source = snapshot?.sources[kind];
      return { source: LABELS[kind], status: coverage(source, now), observed: source ? utc(source.at) : "None",
        count: source?.status === "complete" ? String(source.rows.length) : "Unknown",
        detail: source?.status === "unavailable" ? source.reason : "" };
    }),
  };
  return { data, nodes: scope ? [
    root(["captures-caption", "capture-form", "captures-status"]),
    caption("captures-caption", "Run the package collector in your signed-in terminal and paste the JSON for the selected subscription."),
    node("capture-form", "form", { submit: "import_capture", submitLabel: "Import capture" }, ["capture-scope", "capture-command", "capture-text"]),
    select("capture-scope", "Subscription", "/captureScope", scopedOptions(s)),
    node("capture-command", "text", { content: "{/command}", variant: "code" }),
    node("capture-text", "textarea", { label: "Capture JSON", bind: "/captureText", rows: 5, placeholder: "Paste the collector output" }),
    table("captures-status", "{/rows}", [["source", "Source"], ["status", "Coverage"], ["observed", "Captured UTC"], ["count", "Rows"], ["detail", "Detail"]], false),
  ] : [root(["captures-empty"]), empty("captures-empty", "Register a subscription first", "Go to Customers to set up the tenant and subscription IDs.")] };
}

function invoiceKey(invoice: Invoice) { return `${invoice.currency}:${invoice.id}`; }

function service(s: State, now: number) {
  const scope = s.scopes.find(x => x.subscription === s.serviceScope);
  const snapshot = scope && s.snapshots[scope.subscription];
  const work = s.work.filter(w => w.subscription === scope?.subscription);
  const open = work.filter(w => w.status !== "Closed");
  const signalRows = issues(s, now).filter(i => i.scope.subscription === scope?.subscription);
  const severityLabels = ["Sev 0", "Sev 1", "Sev 2", "Sev 3", "Sev 4", "Unknown"];
  const alertSeverity = severityLabels.map((label, level) => ({
    label, count: signalRows.filter(row => row.kind === "alerts" && row.triage.status !== "Done" && row.level === level).length,
  })).filter(row => row.count > 0);
  const byWorkType = WORK_KINDS.map(label => ({ label, count: open.filter(item => item.kind === label).length })).filter(row => row.count > 0);
  const counts = SOURCES.map(k => {
    const source = snapshot?.sources[k];
    return { source: LABELS[k], coverage: coverage(source, now), at: source ? utc(source.at) : "None", rows: source?.status === "complete" ? String(source.rows.length) : "Unknown" };
  });
  const invoice = s.invoices.find(x => invoiceKey(x) === s.selectedInvoice);
  const billing = invoice?.groups.map(g => ({
    ...g, customer: [...new Set(s.scopes.filter(x => x.tenant === g.tenant).map(x => x.customer))].join(" / ") || "Unmapped",
  })) ?? [];
  const data = {
    serviceScope: s.serviceScope, workDraft: s.workDraft, invoiceExpected: s.invoiceExpected, invoiceCsv: "", selectedInvoice: s.selectedInvoice,
    counts, workRows: work.map(item => ({ ...item, subtitle: `${item.kind} · ${item.owner || "Unassigned"}${item.due ? " · Due " + item.due : ""}` })),
    summary: `${signalRows.filter(x => x.triage.status !== "Done").length} open captured signals · ${open.length} open work items · ${work.length - open.length} closed`,
    alertSeverity, byWorkType, billing,
    oneSeverity: alertSeverity.length === 1 ? `${alertSeverity[0]!.count} open monitor ${alertSeverity[0]!.count === 1 ? "alert" : "alerts"} at ${alertSeverity[0]!.label}.` : "",
    oneWorkType: byWorkType.length === 1 ? `${byWorkType[0]!.count} open ${byWorkType[0]!.label.toLowerCase()} ${byWorkType[0]!.count === 1 ? "item" : "items"}.` : "",
    staged: s.stagedInvoice ? plain(`${s.stagedInvoice.id} · ${s.stagedInvoice.currency} ${s.stagedInvoice.total} from CSV · variance ${variance(s.stagedInvoice)}`) : "",
    billingSummary: invoice ? plain(`${invoice.id} · ${invoice.currency} · reconciliation ${invoice.total} · invoice ${invoice.recorded} · variance ${variance(invoice)} · imported ${utc(invoice.importedAt)}`) : "",
    serviceExport: csv([
      ["Customer", "Tenant ID", "Subscription ID", "Record type", "Name", "Status or coverage", "Observed UTC", "Detail", "Owner", "Ticket reference", "Due date"],
      ...counts.map(r => [scope?.customer ?? "", scope?.tenant ?? "", scope?.subscription ?? "", "Capture", r.source, r.coverage, r.at, r.rows, "", "", ""]),
      ...signalRows.map(r => [r.scope.customer, r.scope.tenant, r.scope.subscription, LABELS[r.kind], r.title, r.triage.status, r.at, r.id, r.triage.owner, "", ""]),
      ...work.map(r => [scope!.customer, scope!.tenant, scope!.subscription, r.kind, r.title, r.status, r.updatedAt, r.evidence, r.owner, r.ticket, r.due]),
    ]),
    billingExport: invoice ? csv([
      ["Invoice", "Currency", "Customer tenant ID", "Customer", "Lines", "Subtotal", "Tax", "Total", "Invoice total", "Variance", "Imported UTC"],
      ...billing.map(g => [invoice.id, invoice.currency, g.tenant, g.customer, g.count, g.subtotal, g.tax, g.total, invoice.recorded, variance(invoice), invoice.importedAt]),
    ]) : "",
  };
  return { data, nodes: [
    root(["service-caption", ...(scope ? ["service-bar"] : []), "service-tabs"]),
    caption("service-caption", "Review captured evidence, manage follow-up, and reconcile customer invoice totals."),
    ...(scope ? [
      node("service-bar", "stack", { direction: "horizontal", align: "end", wrap: true }, ["service-scope", "service-export"]),
      select("service-scope", "Customer subscription", "/serviceScope", scopedOptions(s)),
      button("service-export", "Export service review", "file.save", { name: "azure-service-review", text: "/serviceExport" }),
    ] : []),
    node("service-tabs", "tabs", {}, ["service-review", "service-work", "service-billing"]),
    node("service-review", "section", { title: "Handover" }, scope ? ["service-summary", ...(alertSeverity.length > 1 ? ["service-alert-chart"] : alertSeverity.length ? ["service-one-severity"] : []), "service-coverage"] : ["service-empty"]),
    node("service-work", "section", { title: "Work log" }, scope ? [...(byWorkType.length > 1 ? ["service-work-chart"] : byWorkType.length ? ["service-one-work-type"] : []), "work-layout"] : ["service-empty"]),
    ...(!scope ? [empty("service-empty", "Register a customer subscription", "The handover and work log use the customer scopes from Customers.")] : [
      caption("service-summary", "{/summary}"),
      ...(alertSeverity.length > 1 ? [node("service-alert-chart", "chart", {
        kind: "pie", title: "Open monitor alerts by severity", maxWidth: "sm",
        series: { records: "{/alertSeverity}", label: "label", fields: ["count"] },
      })] : alertSeverity.length ? [caption("service-one-severity", "{/oneSeverity}")] : []),
      ...(byWorkType.length > 1 ? [node("service-work-chart", "chart", {
        kind: "pie", title: "Open follow-up by work type", maxWidth: "sm",
        series: { records: "{/byWorkType}", label: "label", fields: ["count"] },
      })] : byWorkType.length ? [caption("service-one-work-type", "{/oneWorkType}")] : []),
      table("service-coverage", "{/counts}", [["source", "Source"], ["coverage", "Coverage"], ["at", "Observed UTC"], ["rows", "Rows"]], false),
      node("work-layout", "split", { ratio: "1:2" }, ["work-queue", "work-editor"]),
      node("work-queue", "stack", { gap: "sm" }, ["work-add", work.length ? "work-grid" : "work-empty"]),
      button("work-add", "New work item", "new_work"),
      ...(work.length ? [
        node("work-grid", "grid", { columns: 1, searchable: true, pageSize: 10 }, { each: "/workRows", template: "work-row" }),
        node("work-row", "card", { layout: "row", title: "{title}", subtitle: "{subtitle}", badge: "{status}", action: "edit_work", payload: { id: "{id}" } }),
      ] : [empty("work-empty", "No service work recorded", "Add maintenance, incidents, or follow-up for this subscription.")]),
      node("work-editor", "section", { title: s.workDraft.id ? "Edit work item" : "Record work item" }, ["work-form"]),
      node("work-form", "form", { submit: "save_work", submitLabel: "Save work item" }, ["work-title", "work-kind", "work-status", "work-owner", "work-due", "work-ticket", "work-evidence"]),
      node("work-title", "input", { label: "Work title", bind: "/workDraft/title" }),
      select("work-kind", "Type", "/workDraft/kind", options(WORK_KINDS)),
      select("work-status", "Status", "/workDraft/status", options(WORK_STATES)),
      node("work-owner", "input", { label: "Owner", bind: "/workDraft/owner" }),
      node("work-due", "date", { label: "Due date", bind: "/workDraft/due" }),
      node("work-ticket", "input", { label: "Ticket reference", bind: "/workDraft/ticket" }),
      node("work-evidence", "textarea", { label: "Follow-up or closure evidence", bind: "/workDraft/evidence", rows: 3 }),
    ]),
    node("service-billing", "section", { title: "Billing" }, ["billing-caption", "billing-form", ...(invoice ? ["billing-tools", "billing-summary", "billing-table"] : [])]),
    caption("billing-caption", "Use a complete reconciliation CSV for one invoice. Enter the matching invoiced charges total before pasting the CSV."),
    node("billing-form", "form", { submit: "save_invoice", submitLabel: "Save reconciliation" }, ["billing-expected", "billing-paste", ...(s.stagedInvoice ? ["billing-staged"] : [])]),
    node("billing-expected", "input", { label: "Invoiced charges total", bind: "/invoiceExpected", placeholder: "Before payments and balance adjustments" }),
    node("billing-paste", "textarea", { label: "Invoice reconciliation CSV", bind: "/invoiceCsv", rows: 3, placeholder: "Paste the CSV exported for this invoice" }),
    ...(s.stagedInvoice ? [caption("billing-staged", "{/staged}")] : []),
    ...(invoice ? [
      node("billing-tools", "stack", { direction: "horizontal", align: "end", wrap: true }, ["billing-invoice", "billing-export"]),
      select("billing-invoice", "Saved invoice", "/selectedInvoice", s.invoices.map(i => ({ label: `${i.id} · ${i.currency}`, value: invoiceKey(i) }))),
      button("billing-export", "Export reconciliation CSV", "file.save", { name: "azure-invoice-reconciliation", text: "/billingExport" }),
      caption("billing-summary", "{/billingSummary}"),
      table("billing-table", "{/billing}", [["customer", "Customer"], ["tenant", "Customer tenant ID"], ["count", "Lines"], ["subtotal", "Subtotal"], ["tax", "Tax"], ["total", "Total"]]),
    ] : []),
  ] };
}

const views = { queue, customers, inventory, captures, service };
const ids = Object.keys(views) as ViewId[];
function view(s: State, now: number, selected = ids) {
  return selected.map(surface => {
    const { nodes, data } = views[surface](s, now);
    return { surface, nodes, data: [{ op: "replace" as const, path: "/", value: data }] };
  });
}

export const renderApp = (context: Context) => ({ updates: view(normalize(context.state), Date.now()) });
export const surfaceFile = () => view(normalize({}), 0).map(u => ({ id: u.surface, title: TITLES[u.surface], nodes: u.nodes, data: u.data[0]!.value }));

function edit(s: State, path: string, value: unknown, now: number): ViewId[] {
  const subscription = (value: unknown) => {
    const id = guid(value, "subscription ID");
    if (!s.scopes.some(scope => scope.subscription === id)) throw Error("Select a registered subscription.");
    return id;
  };
  switch (path) {
    case "/serviceScope": {
      const id = subscription(value);
      if (id !== s.serviceScope) s.workDraft = blankWork();
      s.serviceScope = id;
      return ["service"];
    }
    case "/invoiceExpected":
      s.invoiceExpected = field(value, 40, "invoiced charges total");
      s.stagedInvoice = null;
      return ["service"];
    case "/invoiceCsv":
      s.stagedInvoice = value === "" ? null : invoiceFromCsv(value, s.invoiceExpected, now);
      return ["service"];
    case "/selectedInvoice":
      if (!s.invoices.some(invoice => invoiceKey(invoice) === value)) throw Error("Choose a retained invoice.");
      s.selectedInvoice = String(value);
      return ["service"];
    case "/workDraft/title":
    case "/workDraft/kind":
    case "/workDraft/status":
    case "/workDraft/owner":
    case "/workDraft/due":
    case "/workDraft/ticket":
    case "/workDraft/evidence": {
      const key = path.slice("/workDraft/".length) as keyof Work;
      s.workDraft[key] = field(value, key === "evidence" ? 1000 : 150, key);
      return ["service"];
    }
    case "/queueScope": s.queueScope = value === "all" ? "all" : subscription(value); s.selected = ""; return ["queue"];
    case "/queueStatus":
      if (value !== "Open" && value !== "Done" && value !== "All") throw Error("Select a valid triage filter.");
      s.queueStatus = value; s.selected = ""; return ["queue"];
    case "/inventoryScope": s.inventoryScope = subscription(value); return ["inventory"];
    case "/captureScope": {
      const id = subscription(value);
      if (id !== s.captureScope) s.staged = null;
      s.captureScope = id;
      return ["captures"];
    }
    case "/captureText": {
      const scope = s.scopes.find(x => x.subscription === s.captureScope);
      if (!scope) throw Error("Select a registered subscription.");
      s.staged = value === "" ? null : parseCapture(value, scope, now);
      return ["captures"];
    }
    case "/issueDraft/status": s.issueDraft.status = field(value, 20, "triage status"); return ["queue"];
    case "/issueDraft/owner": s.issueDraft.owner = field(value, 100, "owner"); return ["queue"];
    case "/issueDraft/note": s.issueDraft.note = field(value, 1500, "triage note"); return ["queue"];
    case "/scopeDraft/customer": s.scopeDraft.customer = field(value, 100, "customer name"); return ["customers"];
    case "/scopeDraft/label": s.scopeDraft.label = field(value, 110, "subscription name"); return ["customers"];
    case "/scopeDraft/owner": s.scopeDraft.owner = field(value, 100, "default owner"); return ["customers"];
    case "/scopeDraft/tenant":
      if (s.editingScope) throw Error("The registered tenant ID is fixed.");
      s.scopeDraft.tenant = field(value, 36, "tenant ID"); return ["customers"];
    case "/scopeDraft/subscription":
      if (s.editingScope) throw Error("The registered subscription ID is fixed.");
      s.scopeDraft.subscription = field(value, 36, "subscription ID"); return ["customers"];
    default: throw Error("Unknown field.");
  }
}

export function handleAction(controlId: string, value: unknown, context: Context, action?: string) {
  const now = Date.now();
  const s = normalize(context.state);
  let changed: ViewId[] = ids;
  let focusSurface: ViewId | undefined;
  if (!action) changed = edit(s, controlId, value, now);
  else switch (action) {
    case "new_work": s.workDraft = blankWork(); changed = ["service"]; break;
    case "edit_work": {
      const item = s.work.find(w => w.id === obj(value).id && w.subscription === s.serviceScope);
      if (!item) throw Error("This work item is outside the selected scope.");
      s.workDraft = { ...item }; changed = ["service"]; break;
    }
    case "save_work": {
      if (!s.serviceScope) throw Error("Select a registered subscription.");
      const existing = s.workDraft.id ? s.work.findIndex(w => w.id === s.workDraft.id && w.subscription === s.serviceScope) : -1;
      if (s.workDraft.id && existing < 0) throw Error("This work item is outside the selected scope.");
      const row = workRecord({ ...s.workDraft, id: s.workDraft.id || randomUUID(), subscription: s.serviceScope, updatedAt: new Date(now).toISOString() });
      if (existing >= 0) s.work[existing] = row;
      else {
        if (s.work.length >= 320) throw Error("The desk supports up to 320 service work items.");
        s.work.unshift(row);
      }
      s.workDraft = { ...row }; changed = ["service"]; break;
    }
    case "save_invoice": {
      const invoice = s.stagedInvoice;
      if (!invoice) throw Error("Enter the invoiced total, then paste the reconciliation CSV.");
      const key = invoiceKey(invoice);
      const index = s.invoices.findIndex(saved => invoiceKey(saved) === key);
      if (index >= 0) throw Error("This invoice and currency are already recorded.");
      if (s.invoices.length >= 30) throw Error("The desk supports up to 30 invoice reconciliations.");
      s.invoices.unshift(invoice); s.selectedInvoice = key; s.stagedInvoice = null; s.invoiceExpected = "";
      changed = ["service"]; break;
    }
    case "new_scope": s.editingScope = ""; s.scopeDraft = blankScope(); changed = ["customers"]; break;
    case "edit_scope": {
      const scope = s.scopes.find(x => x.subscription === obj(value).subscription);
      if (!scope) throw Error("This subscription is unavailable.");
      s.editingScope = scope.subscription; s.scopeDraft = { ...scope }; changed = ["customers"]; break;
    }
    case "save_scope": {
      const scope = parseScope(s.scopeDraft);
      const existing = s.scopes.findIndex(x => x.subscription === scope.subscription);
      if (s.editingScope) {
        if (existing < 0 || s.editingScope !== scope.subscription || s.scopes[existing]!.tenant !== scope.tenant) throw Error("The registered scope cannot change.");
        s.scopes[existing] = scope;
      } else {
        if (existing >= 0) throw Error("That subscription is already registered.");
        if (s.scopes.length >= MAX_SCOPES) throw Error(`This desk supports up to ${MAX_SCOPES} subscriptions.`);
        s.scopes.push(scope);
        s.captureScope = scope.subscription;
        s.staged = null;
        if (!s.inventoryScope) s.inventoryScope = scope.subscription;
        if (!s.serviceScope) s.serviceScope = scope.subscription;
        focusSurface = "captures";
      }
      s.editingScope = scope.subscription; s.scopeDraft = { ...scope };
      break;
    }
    case "import_capture": {
      if (!s.staged) throw Error("Paste a valid capture first.");
      const { subscription, at, sources } = s.staged;
      const previous = s.snapshots[subscription];
      if (previous && at <= previous.at) throw Error("A capture at least this recent is already saved for this subscription.");
      if (previous && SOURCES.some(k => previous.sources[k] && sources[k].at <= previous.sources[k]!.at)) {
        throw Error("A source in this capture is older than or equal to its saved observation.");
      }
      s.snapshots[subscription] = { at, sources };
      s.staged = null;
      break;
    }
    case "open_issue": {
      const issue = issues(s, now).find(i => i.key === obj(value).key && (s.queueScope === "all" || i.scope.subscription === s.queueScope));
      if (!issue) throw Error("This signal is unavailable.");
      s.selected = issue.key; s.issueDraft = { status: issue.triage.status, owner: issue.triage.owner, note: issue.triage.note };
      changed = ["queue"]; break;
    }
    case "close_issue": s.selected = ""; s.issueDraft = blankIssue(); changed = ["queue"]; break;
    case "save_triage": {
      if (!issues(s, now).some(i => i.key === s.selected)) throw Error("Open a captured signal before saving triage.");
      if (!s.triage[s.selected] && Object.keys(s.triage).length >= maxTriage) throw Error("The desk reached its saved triage limit.");
      s.triage[s.selected] = parseTriage({ ...s.issueDraft, at: new Date(now).toISOString() });
      if ((s.queueStatus === "Open" && s.issueDraft.status === "Done") || (s.queueStatus === "Done" && s.issueDraft.status !== "Done")) {
        s.selected = ""; s.issueDraft = blankIssue();
      }
      changed = ["queue", "service"]; break;
    }
    default: throw Error("Unknown desk action.");
  }
  if (Buffer.byteLength(JSON.stringify({ ...s, staged: null, stagedInvoice: null })) > maxCheckpoint) throw Error("This desk reached its local record limit.");
  Object.assign(context.state, s);
  return { updates: view(s, now, changed), ...(focusSurface ? { focusSurface } : {}) };
}

export function handleQuery(name: string, params: unknown, { state }: Context) {
  const s = normalize(state);
  if (name === "list_scopes") return { scopes: s.scopes.map(({ tenant, subscription, customer, label }) => ({
    tenant, subscription, customer, label, capturedAt: s.snapshots[subscription]?.at ?? "",
  })) };
  if (name !== "read_scope") throw Error("Unknown desk query.");
  const args = obj(params);
  const tenant = guid(args.tenant, "tenant ID"), subscription = guid(args.subscription, "subscription ID");
  const scope = s.scopes.find(x => x.tenant === tenant && x.subscription === subscription);
  if (!scope) throw Error("The requested customer scope is unavailable.");
  const snapshot = s.snapshots[subscription];
  return { scope: { tenant, subscription, customer: scope.customer, label: scope.label }, snapshot: snapshot ?? null };
}
