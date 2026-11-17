import { dependencyVisual, inventoryVisuals } from "./visuals.ts";
import { coverage, csv, decode, delta, evidence, object, plain, scopes, text, utc, type Evidence, type ScopeRow, type Snapshot } from "./evidence.ts";
import { AREAS, availableStages, finding, landing, landingBlank, REVIEW, saveWorkload, STRATEGIES, workload, workloadBlank, type Finding, type Landing, type Workload } from "./plan.ts";

const titles = { estate: "Estate explorer", landing: "Landing zones", migration: "Migration waves" } as const;
type ViewId = keyof typeof titles;
const names = Object.keys(titles) as ViewId[];
type Node = { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } };
type Plan = { draft: Landing; saved: Landing | null; findings: Record<string, Finding>; workloads: Workload[] };
type State = {
  scopes: ScopeRow[]; selected: string; current: Evidence | null; previous: Snapshot | null;
  sourceControlsOpen: boolean;
  plans: Record<string, Plan>; area: string; reviewDraft: Finding; loadedArea: string;
  workloadDraft: Workload; editing: string; importText: string;
  resourceGroup: string; groupDraft: string; mapPage: number; dependencyTarget: string; dependencyDraft: string;
};
type Context = { state: Record<string, unknown>; callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown> };
const emptyPlan = (): Plan => ({ draft: landingBlank(), saved: null, findings: {}, workloads: [] });
const emptyFinding = (): Finding => ({ status: "Pending", evidence: "" });
const listTool = "app-azure-operations-desk__list_scopes";
const readTool = "app-azure-operations-desk__read_scope";
const fieldDraft = <T extends Record<string, string>>(base: T, raw: unknown) => {
  const entries = raw && typeof raw === "object" ? object(raw) : {};
  return Object.fromEntries(Object.entries(base).map(([key, v]) => [key, text(entries[key] ?? v, 750, key)])) as T;
};

export function normalize(raw: unknown): State {
  const r = object(raw);
  const available = scopes({ scopes: r.scopes ?? [] });
  const selected = available.find(x => x.subscription === r.selected)?.subscription ?? "";
  const current = r.current ? evidence(r.current) : null;
  const owner = available.find(x => x.subscription === selected);
  const retained = owner && current?.scope.subscription === selected && current.scope.tenant === owner.tenant ? current : null;
  const old = r.previous && retained ? evidence({ scope: retained.scope, snapshot: r.previous }).snapshot : null;
  const plans: State["plans"] = Object.create(null);
  const rawPlans = r.plans ? object(r.plans) : {};
  if (Object.keys(rawPlans).length > 32) throw Error("Too many retained project scopes.");
  for (const [key, rawPlan] of Object.entries(rawPlans)) {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key)) throw Error("Invalid project scope.");
    const p = object(rawPlan);
    if (!Array.isArray(p.workloads) || p.workloads.length > 150) throw Error("Invalid migration plan.");
    const workloads = p.workloads.map(workload);
    const keys = new Set(workloads.map(w => w.key));
    if (keys.size !== workloads.length || workloads.some(w => w.dependencies.split(",").map(x => x.trim()).filter(Boolean).some(k => !keys.has(k)))) {
      throw Error("Invalid retained workload dependencies.");
    }
    plans[key] = {
      draft: fieldDraft(landingBlank(), p.draft), saved: p.saved ? landing(p.saved, true) : null, workloads,
      findings: Object.fromEntries(Object.entries(object(p.findings)).filter(([area]) => AREAS.some(x => x[0] === area)).map(([area, state]) => [area, finding(state)])),
    };
  }
  return {
    scopes: available, selected, current: retained, previous: old, plans,
    sourceControlsOpen: !!retained?.snapshot && r.sourceControlsOpen === true,
    area: AREAS.find(x => x[0] === r.area)?.[0] ?? "billing",
    loadedArea: text(r.loadedArea ?? "", 30, "loaded design area"),
    reviewDraft: fieldDraft(emptyFinding(), r.reviewDraft), workloadDraft: fieldDraft(workloadBlank(), r.workloadDraft),
    editing: text(r.editing ?? "", 40, "workload key"), importText: text(r.importText ?? "", 16000, "assessment rows"),
    resourceGroup: text(r.resourceGroup ?? "", 110, "resource group"), groupDraft: text(r.groupDraft ?? "", 110, "resource group"),
    mapPage: typeof r.mapPage === "number" && Number.isInteger(r.mapPage) && r.mapPage >= 0 && r.mapPage <= 150 ? r.mapPage : 0,
    dependencyTarget: text(r.dependencyTarget ?? "", 40, "workload key"), dependencyDraft: text(r.dependencyDraft ?? "", 40, "workload key"),
  };
}

const selectedScope = (s: State) => s.scopes.find(x => x.subscription === s.selected);
const planKey = (s: ScopeRow) => s.tenant + "/" + s.subscription;
function plan(s: State): Plan {
  const scope = selectedScope(s);
  return scope ? s.plans[planKey(scope)] ?? emptyPlan() : emptyPlan();
}
function editPlan(s: State): Plan {
  const scope = selectedScope(s);
  if (!scope) throw Error("Load and select a customer subscription first.");
  return s.plans[planKey(scope)] ??= emptyPlan();
}
const node = (id: string, type: string, props: Record<string, unknown> = {}, children?: Node["children"]): Node =>
  ({ id, type, props, ...(children ? { children } : {}) });
const root = (ids: string[]) => node("root", "stack", { density: "compact", gap: "md" }, ids);
const caption = (id: string, content: string) => node(id, "text", { content, variant: "caption" });
const info = (id: string, title: string, body: string) => node(id, "alert", { title, body, tone: "info" });
const button = (id: string, label: string, action: string, payload?: Record<string, string>) => node(id, "button", { label, action, style: "secondary", ...(payload ? { payload } : {}) });
const input = (id: string, label: string, bind: string, placeholder?: string) => node(id, "input", { label, bind, ...(placeholder ? { placeholder } : {}) });
const textarea = (id: string, label: string, bind: string) => node(id, "textarea", { label, bind, rows: 3 });
const select = (id: string, label: string, bind: string, opts: {label: string; value: string}[]) => node(id, "select", { label, bind, options: opts, presentation: "dropdown", maxWidth: "sm" });
const options = (values: readonly string[]) => values.map(value => ({ value, label: value }));
const table = (id: string, rows: string, columns: [string, string][], searchable = true) => node(id, "table", { rows, columns: columns.map(([key, label]) => ({ key, label })), sortable: searchable, searchable, pageSize: 12 });
const form = (id: string, submit: string, submitLabel: string, children: string[]) => node(id, "form", { submit, submitLabel }, children);
const tab = (id: string, title: string, children: string[]) => node(id, "section", { title }, children);
const ring = (id: string, title: string, records: string) =>
  node(id, "chart", { kind: "pie", title, series: { records, label: "label", fields: ["count"] }, maxWidth: "sm" });
const map = (id: string, nodes: string, edges: string, directed: boolean) =>
  node(id, "diagram", { kind: "flow", nodes, edges, directed, maxWidth: "lg" });

function estate(s: State, now: number) {
  const current = s.current?.snapshot;
  const showTools = !current || s.sourceControlsOpen;
  const inventory = current?.sources.inventory;
  const assets = inventory?.status === "complete" ? inventory.rows : [];
  const visual = inventoryVisuals(assets, s.resourceGroup, s.mapPage);
  const groupCount = new Set(assets.map(a => a.group.toLowerCase()).filter(Boolean)).size;
  const events = [current?.sources.alerts, current?.sources.health].flatMap((source, i) =>
    source?.status === "complete" ? source.rows.map(r => ({ ...r, source: i ? "Service Health" : "Azure Monitor", captured: utc(source.at), eventTime: utc(r.occurred) })) : []
  ).sort((a, b) => b.occurred.localeCompare(a.occurred));
  const changes = delta(s.previous, current ?? null);
  const comparable = s.previous?.sources.inventory?.status === "complete" && inventory?.status === "complete" && s.previous.sources.inventory.at < inventory.at;
  const receiptRows = [
    { source: "Resource Graph", value: inventory },
    { source: "Azure Monitor alerts", value: current?.sources.alerts },
    { source: "Azure Service Health", value: current?.sources.health },
  ].map(({ source, value }) => ({ source, coverage: coverage(value, now), captured: value ? utc(value.at) : "None", detail: value?.status === "unavailable" ? value.reason : "" }));
  const owner = selectedScope(s);
  const coverageGaps = receiptRows.filter(row => row.coverage !== "Captured").length;
  const data = { selected: s.selected, assets, changes, events, receipts: receiptRows,
    byRegion: visual.byRegion, groupDraft: visual.options.some(o => o.value === s.groupDraft) ? s.groupDraft : visual.chosen,
    mapNodes: visual.nodes, mapEdges: visual.edges, mapSummary: plain(visual.summary),
    coverageLine: `${inventory?.status === "complete" ? assets.length + " resources · " + groupCount + " resource groups" : "Resource count unknown"} · ${events.length} captured ${events.length === 1 ? "signal" : "signals"}`,
    summary: owner ? plain(`${owner.customer} / ${owner.label} · ${current ? "Loaded capture " + utc(current.at) : "No capture loaded"}`) : "Load customer subscriptions from Operations Desk.",
    headline: !current ? "Explore a customer estate" : coverageGaps ? `${coverageGaps} ${coverageGaps === 1 ? "source needs" : "sources need"} review` :
      `${assets.length} captured ${assets.length === 1 ? "resource" : "resources"}`,
    compareSummary: plain(comparable ? `Inventory fields in ${utc(s.previous!.at)} compared with ${utc(current!.at)}.` : "Load two different complete inventory captures for this scope to compare them."),
    spoken: owner ? `${owner.customer}, ${owner.label}. Resource Graph coverage is ${coverage(inventory, now).toLowerCase()}. ${inventory?.status === "complete" ? assets.length + " resources in the loaded capture." : "The resource count is unknown."} There are ${events.length} captured signals. ${receiptRows.filter(r => r.coverage !== "Captured").length} sources need coverage review.` : "No customer subscription is selected.",
  };
  return { data, nodes: [
    root(["estate-headline", "estate-caption",
      ...(current ? ["estate-capture-meta", ...(showTools ? ["estate-tools"] : []), "estate-tabs"] :
        ["estate-tools", ...(owner ? ["estate-tabs"] : ["estate-empty"])]),
    ]),
    node("estate-headline", "text", { variant: "heading", content: "{/headline}" }),
    caption("estate-caption", "{/summary}"),
    ...(current ? [
      node("estate-capture-meta", "stack", { direction: "horizontal", align: "center", wrap: true }, ["estate-coverage-line", "estate-source-toggle"]),
      caption("estate-coverage-line", "{/coverageLine}"),
      node("estate-source-toggle", "button", {
        label: showTools ? "Hide source controls" : "Change subscription or reload", action: "toggle_source_controls", style: "link",
      }),
    ] : []),
    ...(showTools ? [
      node("estate-tools", "stack", { direction: "horizontal", align: "end", wrap: true }, [
        ...(owner ? ["estate-scope", "estate-load"] : []), "estate-list",
      ]),
      node("estate-list", "button", { label: "Load customer subscriptions", action: "load_scopes", style: owner ? "link" : "primary" }),
      ...(owner ? [
        select("estate-scope", "Subscription", "/selected", s.scopes.map(x => ({ value: x.subscription, label: `${x.customer} / ${x.label}` }))),
        node("estate-load", "button", { label: "Load latest capture", action: "load_capture", style: "primary" }),
      ] : []),
    ] : []),
    ...(owner ? [
      node("estate-tabs", "tabs", {}, ["estate-coverage", "estate-inventory", "estate-map", "estate-events", "estate-changes"]),
      tab("estate-coverage", "Overview", assets.length ? ["estate-overview"] : ["estate-source-table"]),
      ...(assets.length ? [
        node("estate-overview", "split", { ratio: "1:2", gap: "lg" }, ["estate-regions", "estate-source-evidence"]),
        tab("estate-source-evidence", "Capture coverage", ["estate-source-table"]),
      ] : []),
      table("estate-source-table", "{/receipts}", [["source", "Source"], ["coverage", "Coverage"], ["captured", "Observed UTC"], ["detail", "Detail"]], false),
      tab("estate-inventory", "Inventory", assets.length ? ["estate-asset-table"] : ["estate-no-inventory"]),
      ...(assets.length ? [
        table("estate-asset-table", "{/assets}", [["name", "Name"], ["type", "Type"], ["group", "Resource group"], ["location", "Region"], ["id", "Resource ID"]]),
      ] : [info("estate-no-inventory", "No inventory rows", "Review capture coverage in Overview.")]),
      tab("estate-map", "Resource map", assets.length
        ? ["estate-group-form", "estate-map-note", "estate-group-map", ...(visual.pages > 1 ? ["estate-map-controls"] : [])]
        : ["estate-map-empty"]),
      ...(assets.length ? [
        ring("estate-regions", "Captured resources by region", "{/byRegion}"),
        form("estate-group-form", "show_resource_group", "Show group", ["estate-group"]),
        select("estate-group", "Resource group", "/groupDraft", visual.options),
        caption("estate-map-note", "{/mapSummary}"),
        map("estate-group-map", "{/mapNodes}", "{/mapEdges}", false),
        ...(visual.pages > 1 ? [
          node("estate-map-controls", "stack", { direction: "horizontal", wrap: true }, [
            ...(visual.index > 0 ? ["estate-map-prev"] : []), ...(visual.index + 1 < visual.pages ? ["estate-map-next"] : []),
          ]),
          ...(visual.index > 0 ? [button("estate-map-prev", "Previous resources", "map_previous")] : []),
          ...(visual.index + 1 < visual.pages ? [button("estate-map-next", "Next resources", "map_next")] : []),
        ] : []),
      ] : [info("estate-map-empty", "No resource map yet", "Load a complete inventory capture with resources to explore their group membership.")]),
      tab("estate-events", "Timeline", events.length ? ["estate-event-table"] : ["estate-no-events"]),
      ...(events.length ? [table("estate-event-table", "{/events}", [["eventTime", "Event UTC"], ["source", "Source"], ["title", "Signal"], ["condition", "Condition"], ["captured", "Captured UTC"], ["target", "Affected resource"]])]
        : [info("estate-no-events", "No signals in this capture", "Check source coverage before using this result.")]),
      tab("estate-changes", "Changes", changes.length ? ["estate-comparison", "estate-change-table"] : ["estate-comparison"]),
      caption("estate-comparison", comparable && !changes.length ? "The two captures have the same retained inventory fields." : "{/compareSummary}"),
      ...(changes.length ? [table("estate-change-table", "{/changes}", [["change", "Observation"], ["name", "Resource"], ["type", "Type"], ["id", "Resource ID"]])] : []),
    ] : [info("estate-empty", "Choose an Operations Desk subscription", "Allow the local read tools in Access to load saved customer scopes and captures.")]),
  ] };
}

function nextArea(p: Plan) {
  return AREAS.find(([key]) => p.findings[key]?.status === "Gap") ??
    AREAS.find(([key]) => !p.findings[key] || p.findings[key]?.status === "Pending");
}

function landingView(s: State) {
  const owner = selectedScope(s);
  const p = plan(s);
  const inventory = s.current?.snapshot?.sources.inventory;
  const assets = inventory?.status === "complete" ? inventory.rows : [];
  const observed = (prefix: string) => inventory?.status === "complete" ? `${assets.filter(a => a.type.toLowerCase().startsWith(prefix)).length} visible` : "Unknown";
  const rows = AREAS.map(([key, name]) => ({ area: name, status: p.findings[key]?.status ?? "Pending", evidence: p.findings[key]?.evidence ?? "" }));
  const priority = nextArea(p);
  const pending = rows.filter(row => row.status === "Pending").length;
  const gaps = rows.filter(row => row.status === "Gap").length;
  const data = { area: s.area, reviewDraft: s.reviewDraft, draft: p.draft, rows,
    assessed: AREAS.length - pending, designAreas: AREAS.length,
    headline: priority ? plain(`${p.findings[priority[0]]?.status === "Gap" ? "Resolve" : "Review"} ${priority[1].charAt(0).toLowerCase() + priority[1].slice(1)}`) : "All design areas assessed",
    progress: `**${AREAS.length - pending} of ${AREAS.length}** areas assessed · ${pending} pending · ${gaps} gaps`,
    inventoryEvidence: `Virtual networks: ${observed("microsoft.network/virtualnetworks")} · Log workspaces: ${observed("microsoft.operationalinsights/workspaces")}. Counts describe the loaded capture.`,
    handoffSummary: p.saved ? plain(`${p.saved.name} · ${p.saved.region} · ${p.saved.change}`) : "",
    saved: p.saved ? JSON.stringify({ tenant: owner?.tenant, subscription: owner?.subscription, ...p.saved }, null, 2) : "",
    export: p.saved ? csv([
      ["Tenant ID", "Subscription ID", "Record type", "Field", "Value or status", "Evidence"],
      ...Object.entries(p.saved).map(([k, v]) => [owner!.tenant, owner!.subscription, "Input", k, v, ""]),
      ...rows.map(row => [owner!.tenant, owner!.subscription, "Review area", row.area, row.status, row.evidence]),
    ]) : "",
  };
  return { data, nodes: [
    root(owner ? ["landing-headline", "landing-caption", "landing-progress", ...(priority ? ["landing-next"] : []), "landing-tabs"] : ["landing-caption", "landing-empty"]),
    caption("landing-caption", owner ? plain(`${owner.customer} / ${owner.label} · Review the existing baseline or prepare pipeline inputs.`) : "Select a customer subscription in Estate explorer."),
    ...(!owner ? [info("landing-empty", "No subscription selected", "Load customer subscriptions from Operations Desk before starting a plan.")] : [
      node("landing-headline", "text", { content: "{/headline}", variant: "heading" }),
      node("landing-progress", "text", { content: "{/progress}", variant: "body" }),
      ...(priority ? [node("landing-next", "button", { label: "Review priority area", action: "review_next_area", style: "primary" })] : []),
      node("landing-tabs", "tabs", {}, ["landing-review", "landing-inputs", ...(p.saved ? ["landing-preview"] : [])]),
      tab("landing-review", "Readiness", ["landing-area-tools", ...(s.loadedArea === s.area ? ["landing-review-form"] : []), "landing-status-meter", "landing-coverage-caption", "landing-readiness"]),
      node("landing-status-meter", "progress", { kind: "bar", label: "Design review coverage",
        value: "{/assessed}", max: "{/designAreas}", maxWidth: "md" }),
      caption("landing-coverage-caption", "{/inventoryEvidence}"),
      table("landing-readiness", "{/rows}", [["area", "Design area"], ["status", "Status"], ["evidence", "Evidence"]], false),
      node("landing-area-tools", "stack", { direction: "horizontal", align: "end", wrap: true }, ["landing-area", "landing-open-area"]),
      select("landing-area", "Design area", "/area", AREAS.map(([value, label]) => ({ value, label }))),
      button("landing-open-area", "Open finding", "open_finding"),
      ...(s.loadedArea === s.area ? [
        form("landing-review-form", "save_finding", "Save finding", ["landing-status", "landing-evidence"]),
        select("landing-status", "Finding status", "/reviewDraft/status", options(REVIEW)),
        textarea("landing-evidence", "Evidence or exception reference", "/reviewDraft/evidence"),
      ] : []),
      tab("landing-inputs", "Pipeline handoff", ["landing-form", ...(p.saved ? ["landing-export"] : [])]),
      form("landing-form", "save_landing", "Save pipeline inputs", ["landing-placement", "landing-network-owner"]),
      node("landing-placement", "section", { title: "Plan and placement" }, ["landing-name", "landing-kind", "landing-region", "landing-mg"]),
      node("landing-network-owner", "section", { title: "Network and ownership" }, ["landing-topology", "landing-cidr", "landing-owner", "landing-change"]),
      input("landing-name", "Plan name", "/draft/name"),
      select("landing-kind", "Landing zone type", "/draft/kind", options(["Platform", "Application"])),
      input("landing-region", "Primary region", "/draft/region", "centralindia"),
      input("landing-mg", "Management group ID", "/draft/managementGroup"),
      select("landing-topology", "Network topology", "/draft/network", options(["Hub and spoke", "Virtual WAN", "Isolated"])),
      input("landing-cidr", "IPv4 network CIDR", "/draft/cidr", "10.10.0.0/16"),
      input("landing-owner", "Deployment owner", "/draft/owner"),
      input("landing-change", "Change reference", "/draft/change"),
      ...(p.saved ? [
        button("landing-export", "Export handoff CSV", "file.save", { name: "azure-landing-zone-handoff", text: "/export" }),
        tab("landing-preview", "Saved inputs", ["landing-saved-name", "landing-saved"]),
        caption("landing-saved-name", "{/handoffSummary}"),
        node("landing-saved", "text", { content: "{/saved}", variant: "code", maxWidth: "md" }),
      ] : []),
    ]),
  ] };
}

function migration(s: State) {
  const owner = selectedScope(s);
  const p = plan(s);
  const waves = new Map<number, { label: string; planning: number; tested: number; ready: number; cutover: number; verified: number; rolledBack: number }>();
  for (const w of p.workloads) {
    const wave = Number(w.wave);
    const row = waves.get(wave) ?? { label: `Wave ${wave}`, planning: 0, tested: 0, ready: 0, cutover: 0, verified: 0, rolledBack: 0 };
    const phase = w.stage === "Verified" ? "verified" : w.stage === "Rolled back" ? "rolledBack" :
      w.stage === "Cut over" ? "cutover" : w.stage === "Approved" ? "ready" : w.stage === "Tested" ? "tested" : "planning";
    row[phase]++;
    waves.set(wave, row);
  }
  const waveRows = [...waves.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
  const phaseLabels = { planning: "In preparation", tested: "Tested", ready: "Approved", cutover: "Cut over", verified: "Verified", rolledBack: "Rolled back" };
  const stageDistribution = (Object.keys(phaseLabels) as (keyof typeof phaseLabels)[])
    .map(key => ({ label: phaseLabels[key], count: waveRows.reduce((n, row) => n + row[key], 0) }))
    .filter(r => r.count > 0);
  const waveProgress = waveRows.map(row => {
    const total = row.planning + row.tested + row.ready + row.cutover + row.verified + row.rolledBack;
    return { label: row.label, verified: row.verified, total, note: `${row.verified} of ${total} workloads verified` };
  });
  const graph = dependencyVisual(p.workloads, s.dependencyTarget);
  const nextSteps: Record<string, string> = {
    "Cut over": "Verify", Approved: "Review cutover for", Tested: "Review approval for",
    Assessed: "Record test evidence for", Discovery: "Assess", "Rolled back": "Reassess",
  };
  const ordered = [...p.workloads].sort((a, b) => Number(a.wave) - Number(b.wave));
  const next = ordered.find(w => w.blocker && w.stage !== "Verified") ??
    Object.keys(nextSteps).map(stage => ordered.find(w => w.stage === stage)).find(w => w !== undefined);
  const savedStage = p.workloads.find(w => w.key === s.editing)?.stage ?? "Discovery";
  const stageOptions = availableStages(savedStage, s.workloadDraft.strategy);
  const stage = stageOptions.includes(s.workloadDraft.stage) ? s.workloadDraft.stage : savedStage;
  const moving = s.workloadDraft.strategy !== "Retain" && s.workloadDraft.strategy !== "Retire";
  const tests = moving && ["Tested", "Approved", "Cut over", "Verified", "Rolled back"].includes(stage);
  const approval = ["Approved", "Cut over", "Verified", "Rolled back"].includes(stage);
  const outcome = ["Verified", "Rolled back"].includes(stage);
  const data = { workloadDraft: { ...s.workloadDraft, stage }, importText: s.importText, rows: p.workloads,
    waveProgress, stageDistribution,
    singleStage: stageDistribution.length === 1 ? `All ${stageDistribution[0]!.count} recorded workloads share the same state: ${stageDistribution[0]!.label}.` : "",
    waveSummary: `${p.workloads.length} workloads · ${p.workloads.filter(w => w.blocker).length} with blockers`,
    dependencyDraft: p.workloads.some(w => w.key === s.dependencyDraft) ? s.dependencyDraft : graph.target,
    dependencyNodes: graph.nodes, dependencyEdges: graph.edges,
    nextKey: next?.key ?? "",
    headline: next ? plain(`${next.blocker ? "Resolve a blocker for" : next.stage === "Assessed" && (next.strategy === "Retain" || next.strategy === "Retire") ? "Review sign-off for" : nextSteps[next.stage]} ${next.name}`) :
      p.workloads.length ? "All recorded workloads verified" : "Plan the first migration wave",
    export: csv([
      ["Tenant ID", "Subscription ID", "Wave", "Workload key", "Workload", "Source reference", "Strategy", "Target", "Owner", "Dependencies", "Stage", "Blocker", "Test evidence", "Approval", "Rollback", "Outcome"],
      ...p.workloads.map(w => [owner!.tenant, owner!.subscription, w.wave, w.key, w.name, w.source, w.strategy, w.target, w.owner, w.dependencies, w.stage, w.blocker, w.test, w.approval, w.rollback, w.outcome]),
    ]),
  };
  return { data, nodes: [
    root(owner ? ["migration-headline", "migration-caption", "migration-tools", "migration-tabs"] : ["migration-caption", "migration-empty"]),
    caption("migration-caption", owner ? plain(`${owner.customer} / ${owner.label} · Track discovery, testing, cutover and validation.`) : "Select a customer subscription in Estate explorer."),
    ...(!owner ? [info("migration-empty", "No subscription selected", "Migration plans are saved under the selected tenant and subscription.")] : [
      node("migration-headline", "text", { content: "{/headline}", variant: "heading" }),
      node("migration-tools", "stack", { direction: "horizontal", align: "end", wrap: true }, [
        ...(next ? ["migration-next"] : []), "migration-new", ...(p.workloads.length ? ["migration-export"] : []),
      ]),
      ...(next ? [node("migration-next", "button", { label: "Review workload", action: "open_workload", payload: { key: "{/nextKey}" }, style: "primary" })] : []),
      button("migration-new", "New workload", "new_workload"),
      ...(p.workloads.length ? [button("migration-export", "Export migration plan", "file.save", { name: "azure-migration-plan", text: "/export" })] : []),
      node("migration-tabs", "tabs", {}, ["migration-wave-tab", "migration-dependency-tab", "migration-editor-tab", "migration-import-tab"]),
      tab("migration-wave-tab", "Waves", p.workloads.length ? ["migration-wave-summary", "migration-wave-overview", "migration-grid"] : ["migration-no-rows"]),
      ...(p.workloads.length ? [
        caption("migration-wave-summary", "{/waveSummary}"),
        node("migration-wave-overview", "split", { ratio: "2:1", gap: "lg" }, ["migration-wave-progress", "migration-stage-summary"]),
        tab("migration-wave-progress", "Wave readiness", ["migration-wave-rows"]),
        node("migration-wave-rows", "grid", { columns: 1, pageSize: 8, gap: "sm" }, { each: "/waveProgress", template: "migration-wave-progress-row" }),
        node("migration-wave-progress-row", "progress", { kind: "bar", label: "{label}", value: "{verified}", max: "{total}", note: "{note}" }),
        tab("migration-stage-summary", "Workload stages", stageDistribution.length > 1 ? ["migration-stage-ring"] : ["migration-single-stage"]),
        ...(stageDistribution.length > 1 ? [ring("migration-stage-ring", "Workloads by stage", "{/stageDistribution}")]
          : [caption("migration-single-stage", "{/singleStage}")]),
        node("migration-grid", "grid", { columns: 1, searchable: true, pageSize: 10 }, { each: "/rows", template: "migration-row" }),
        node("migration-row", "card", { layout: "row", title: "{name}", subtitle: "{key}", badge: "{stage}", action: "open_workload", payload: { key: "{key}" } }),
      ] : [info("migration-no-rows", "No workloads assessed", "Add a workload or import rows from a reviewed assessment.")]),
      tab("migration-dependency-tab", "Dependencies", p.workloads.length
        ? ["migration-dependency-form", ...(graph.edges.length ? ["migration-dependency-note", "migration-dependency-map"] : ["migration-dependency-empty"])]
        : ["migration-dependency-empty"]),
      ...(p.workloads.length ? [
        form("migration-dependency-form", "show_dependencies", "Show prerequisites", ["migration-dependency-target"]),
        select("migration-dependency-target", "Workload to inspect", "/dependencyDraft", p.workloads.map(w => ({ label: w.name, value: w.key }))),
      ] : []),
      ...(graph.edges.length ? [
        caption("migration-dependency-note", "Arrows run from a recorded prerequisite to the selected workload."),
        map("migration-dependency-map", "{/dependencyNodes}", "{/dependencyEdges}", true),
      ] : [info("migration-dependency-empty", "No prerequisites recorded", "Add prerequisite workload keys to show the dependencies for this plan.")]),
      tab("migration-editor-tab", "Workload", ["migration-edit-caption", "migration-form"]),
      caption("migration-edit-caption", s.editing ? plain(`Editing ${s.editing}. Stage changes require the applicable evidence.`) : "Enter the first discovery record. Save each review stage as evidence becomes available."),
      form("migration-form", "save_workload", "Save workload", [
        ...(!s.editing ? ["migration-key"] : []), "migration-name", "migration-source", "migration-owner", "migration-target", "migration-strategy", "migration-wave",
        "migration-deps", "migration-stage", "migration-blocker", ...(tests ? ["migration-test", "migration-rollback"] : []),
        ...(approval ? ["migration-approval"] : []), ...(outcome ? ["migration-outcome"] : []),
      ]),
      ...(!s.editing ? [input("migration-key", "Workload key", "/workloadDraft/key", "orders-api")] : []),
      input("migration-name", "Workload name", "/workloadDraft/name"),
      input("migration-source", "Assessment or source reference", "/workloadDraft/source"),
      input("migration-owner", "Workload owner", "/workloadDraft/owner"),
      input("migration-target", "Assessed target", "/workloadDraft/target"),
      select("migration-strategy", "Strategy", "/workloadDraft/strategy", options(STRATEGIES)),
      input("migration-wave", "Wave number", "/workloadDraft/wave"),
      input("migration-deps", "Prerequisite workload keys", "/workloadDraft/dependencies", "Comma-separated saved keys"),
      select("migration-stage", "Stage", "/workloadDraft/stage", options(stageOptions)),
      textarea("migration-blocker", "Open blocker", "/workloadDraft/blocker"),
      ...(tests ? [
        textarea("migration-test", "Test result or evidence reference", "/workloadDraft/test"),
        textarea("migration-rollback", "Rollback steps and decision deadline", "/workloadDraft/rollback"),
      ] : []),
      ...(approval ? [input("migration-approval", "Approval reference", "/workloadDraft/approval")] : []),
      ...(outcome ? [textarea("migration-outcome", "Validation or rollback outcome", "/workloadDraft/outcome")] : []),
      tab("migration-import-tab", "Import assessment", ["migration-import-guide", "migration-import-form"]),
      caption("migration-import-guide", "Paste tab-separated rows with these columns: workload key, name, source reference, owner, target, strategy, wave. Imported records start in Discovery."),
      form("migration-import-form", "import_assessment", "Import assessment rows", ["migration-paste"]),
      textarea("migration-paste", "Assessment rows", "/importText"),
    ]),
  ] };
}

const views = { estate, landing: landingView, migration };
function view(s: State, order = names, focusMigration?: string, focusLanding?: string) {
  const now = Date.now();
  return order.map(surface => {
    const { nodes, data } = views[surface](s, now);
    if (surface === "migration" && focusMigration) nodes.find(n => n.id === "migration-tabs")!.props!.active = focusMigration;
    if (surface === "landing" && focusLanding) nodes.find(n => n.id === "landing-tabs")!.props!.active = focusLanding;
    return { surface, nodes, data: [{ op: "replace" as const, path: "/", value: data }] };
  });
}
export const surfaceFile = () => view(normalize({})).map(u => ({ id: u.surface, title: titles[u.surface], nodes: u.nodes, data: u.data[0]!.value }));
export const renderApp = (context: Context) => ({ updates: view(normalize(context.state)) });

function resetFocus(s: State) {
  s.current = null; s.previous = null; s.loadedArea = ""; s.reviewDraft = emptyFinding();
  s.sourceControlsOpen = false;
  s.editing = ""; s.workloadDraft = workloadBlank(); s.importText = "";
  s.resourceGroup = ""; s.groupDraft = ""; s.mapPage = 0; s.dependencyTarget = ""; s.dependencyDraft = "";
}

async function read(context: Context, tool: string, args: Record<string, unknown>) {
  if (!context.callTool) throw Error("The Operations Desk read tools are unavailable. Open Access to review the connection.");
  return decode(await context.callTool(tool, args));
}

function editField(s: State, path: string, value: unknown): ViewId[] {
  if (path === "/selected") {
    const r = selectedScope({ ...s, selected: String(value) });
    if (!r) throw Error("Select a registered scope.");
    if (s.selected !== r.subscription) resetFocus(s);
    s.selected = r.subscription;
    return names;
  }
  if (path === "/area") {
    if (!AREAS.some(([a]) => a === value)) throw Error("Select a design area.");
    s.area = String(value); s.loadedArea = ""; s.reviewDraft = emptyFinding(); return ["landing"];
  }
  if (path === "/groupDraft") { s.groupDraft = text(value, 110, "resource group"); return ["estate"]; }
  if (path === "/dependencyDraft") { s.dependencyDraft = text(value, 40, "workload key"); return ["migration"]; }
  if (path === "/importText") { s.importText = text(value, 16000, "assessment rows"); return ["migration"]; }
  const set = (prefix: string, record: Record<string, string>, allowed: string[], max: number, surface: ViewId): ViewId[] | undefined => {
    const k = path.slice(prefix.length);
    if (!path.startsWith(prefix) || !allowed.includes(k)) return;
    record[k] = text(value, max, k);
    return [surface];
  };
  if (path.startsWith("/draft/")) {
    const draft = editPlan(s).draft;
    const result = set("/draft/", draft, Object.keys(draft), 150, "landing");
    if (result) return result;
  }
  if (path === "/workloadDraft/key" && s.editing) throw Error("The saved workload key is fixed.");
  if (path === "/workloadDraft/strategy") {
    const priorStage = plan(s).workloads.find(w => w.key === s.editing)?.stage ?? "Discovery";
    const strategy = text(value, 30, "strategy");
    if (!availableStages(priorStage, strategy).includes(s.workloadDraft.stage)) s.workloadDraft.stage = priorStage;
    s.workloadDraft.strategy = strategy;
    return ["migration"];
  }
  const result = set("/reviewDraft/", s.reviewDraft, ["status", "evidence"], 750, "landing")
    ?? set("/workloadDraft/", s.workloadDraft, Object.keys(s.workloadDraft), 750, "migration");
  if (!result) throw Error("Unknown Workbench field.");
  return result;
}

export async function handleAction(controlId: string, value: unknown, context: Context, action?: string) {
  const s = normalize(context.state);
  let changed = names;
  let migrationPanel: string | undefined;
  let landingPanel: string | undefined;
  if (!action) {
    const previousScope = s.selected;
    changed = editField(s, controlId, value);
    if (s.selected && s.selected !== previousScope) migrationPanel = "migration-wave-tab#" + Date.now();
  } else switch (action) {
    case "toggle_source_controls":
      s.sourceControlsOpen = !!s.current?.snapshot && !s.sourceControlsOpen;
      changed = ["estate"]; break;
    case "load_scopes": {
      const previousOwner = selectedScope(s);
      s.scopes = scopes(await read(context, listTool, {}));
      const preferred = selectedScope(s) ?? s.scopes[0];
      if (preferred?.tenant !== previousOwner?.tenant || preferred?.subscription !== previousOwner?.subscription) {
        resetFocus(s);
        if (preferred) migrationPanel = "migration-wave-tab#" + Date.now();
      }
      s.selected = preferred?.subscription ?? "";
      break;
    }
    case "load_capture": {
      const owner = selectedScope(s);
      if (!owner) throw Error("Select a registered scope.");
      const received = evidence(await read(context, readTool, { tenant: owner.tenant, subscription: owner.subscription }), owner);
      const old = s.current?.snapshot;
      if (received.snapshot && old && received.snapshot.at < old.at) throw Error("Operations Desk returned an older capture than the one retained.");
      if (!received.snapshot) s.previous = null;
      else if (old && received.snapshot.at > old.at) s.previous = old;
      s.current = received;
      s.sourceControlsOpen = false;
      const inventory = received.snapshot?.sources.inventory;
      const available = inventoryVisuals(inventory?.status === "complete" ? inventory.rows : [], s.resourceGroup, s.mapPage);
      if (available.chosen !== s.resourceGroup) s.mapPage = 0;
      s.resourceGroup = available.chosen;
      s.groupDraft = available.chosen;
      changed = ["estate", "landing"]; break;
    }
    case "show_resource_group":
    case "map_previous":
    case "map_next": {
      const inventory = s.current?.snapshot?.sources.inventory;
      if (inventory?.status !== "complete" || !inventory.rows.length) throw Error("Load an inventory capture first.");
      const visual = inventoryVisuals(inventory.rows, s.resourceGroup, s.mapPage);
      if (action === "show_resource_group") {
        const requested = s.groupDraft || visual.chosen;
        if (!visual.options.some(option => option.value === requested)) throw Error("Select a resource group in this capture.");
        s.resourceGroup = requested; s.mapPage = 0;
      } else {
        const next = visual.index + (action === "map_previous" ? -1 : 1);
        if (next >= 0 && next < visual.pages) s.mapPage = next;
      }
      changed = ["estate"]; break;
    }
    case "show_dependencies": {
      const workloads = plan(s).workloads;
      const key = s.dependencyDraft || dependencyVisual(workloads, s.dependencyTarget).target;
      if (!workloads.some(w => w.key === key)) throw Error("Select a workload in this subscription.");
      s.dependencyTarget = key; changed = ["migration"]; break;
    }
    case "review_next_area": {
      const area = nextArea(plan(s));
      if (!selectedScope(s) || !area) throw Error("There is no remaining priority review area.");
      s.area = area[0];
      s.reviewDraft = { ...(plan(s).findings[s.area] ?? emptyFinding()) };
      s.loadedArea = s.area;
      changed = ["landing"];
      landingPanel = "landing-review#" + Date.now(); break;
    }
    case "open_finding":
      s.reviewDraft = { ...(plan(s).findings[s.area] ?? emptyFinding()) };
      s.loadedArea = s.area; changed = ["landing"]; break;
    case "save_finding":
      if (s.area !== s.loadedArea) throw Error("Open the selected design area before saving its finding.");
      editPlan(s).findings[s.area] = finding(s.reviewDraft, true); changed = ["landing"]; break;
    case "save_landing":
      editPlan(s).saved = landing(plan(s).draft, true); changed = ["landing"]; break;
    case "new_workload":
      s.editing = ""; s.workloadDraft = workloadBlank(); changed = ["migration"];
      migrationPanel = "migration-editor-tab#" + Date.now(); break;
    case "open_workload": {
      const w = plan(s).workloads.find(w => w.key === object(value).key);
      if (!w) throw Error("This workload is unavailable in the selected scope.");
      s.editing = w.key; s.workloadDraft = { ...w }; changed = ["migration"];
      migrationPanel = "migration-editor-tab#" + Date.now(); break;
    }
    case "save_workload": {
      const p = editPlan(s);
      p.workloads = saveWorkload(s.workloadDraft, p.workloads, s.editing);
      s.editing = s.workloadDraft.key.trim();
      s.workloadDraft = { ...p.workloads.find(w => w.key === s.editing)! }; changed = ["migration"]; break;
    }
    case "import_assessment": {
      const p = editPlan(s);
      const rows = s.importText.split(/\r?\n/).filter(line => line.trim());
      if (rows.length === 0 || rows.length > 60) throw Error("Paste between 1 and 60 assessment rows.");
      let next = p.workloads;
      for (const [index, row] of rows.entries()) {
        const parts = row.split("\t");
        if (parts.length !== 7) throw Error(`Row ${index + 1} must have seven tab-separated columns.`);
        const [key, name, source, owner, target, strategy, wave] = parts as [string, string, string, string, string, string, string];
        next = saveWorkload({ ...workloadBlank(), key, name, source, owner, target, strategy, wave }, next, "");
      }
      p.workloads = next;
      s.importText = ""; changed = ["migration"]; migrationPanel = "migration-wave-tab#" + Date.now(); break;
    }
    default: throw Error("Unknown Workbench action.");
  }
  if (Buffer.byteLength(JSON.stringify(s)) > 2_500_000) throw Error("The Workbench reached its retained data limit.");
  const updates = view(s, changed, migrationPanel, landingPanel);
  Object.assign(context.state, s);
  return { updates };
}
