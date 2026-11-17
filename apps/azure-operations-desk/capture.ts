// Run explicitly in the engineer's terminal. The sandbox backend never imports this file.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { guid, LIMITS, MAX_CAPTURE, obj, parseResult, type Source } from "./data.ts";

const arm = "https://management.azure.com";
const graph = arm + "/providers/Microsoft.ResourceGraph/resources?api-version=2024-04-01";
const run = promisify(execFile);
type Az = (args: string[]) => Promise<unknown>;

class CaptureError extends Error {}

const az: Az = async args => {
  try {
    const { stdout } = await run("az", [...args, "--only-show-errors", "--output", "json"], { timeout: 35_000, maxBuffer: 4 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) {
    const err = error as { code?: string; stderr?: string };
    if (err.code === "ENOENT") throw new CaptureError("Azure CLI is unavailable.");
    if (/AuthorizationFailed|Forbidden|AccessDenied|Authorization_RequestDenied/i.test(err.stderr ?? "")) {
      throw new CaptureError("Azure denied this read. Check the role and delegated scope.");
    }
    throw new CaptureError("The Azure CLI read failed. Check sign-in, scope, and connectivity.");
  }
};

const sourceTime = (value: unknown) => {
  if (typeof value !== "string" || !value) return "";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new CaptureError("The source returned an invalid event time.");
  return new Date(time).toISOString();
};

const queries = {
  inventory: "Resources | project id, name, type, location, group=resourceGroup | order by id asc",
  health: "ServiceHealthResources | where type =~ 'microsoft.resourcehealth/events' | extend eventType=tostring(properties.EventType), status=tostring(properties.Status), impactEnd=todatetime(properties.ImpactMitigationTime) | where status =~ 'Active' or (eventType in~ ('HealthAdvisory','SecurityAdvisory','PlannedMaintenance') and impactEnd > now()) | project id, title=tostring(properties.Title), eventType, status, severity=tostring(properties.Severity), occurred=tostring(properties.ImpactStartTime) | order by id asc",
};

async function queryGraph(call: Az, subscription: string, kind: keyof typeof queries): Promise<unknown[]> {
  const rows: unknown[] = [];
  const tokens = new Set<string>();
  let skip: string | undefined;
  let total: number | undefined;
  do {
    const response = obj(await call(["rest", "--subscription", subscription, "--method", "post", "--url", graph, "--body", JSON.stringify({
      subscriptions: [subscription], query: queries[kind], options: { resultFormat: "objectArray", "\$top": Math.min(1000, LIMITS[kind]), ...(skip ? { "\$skipToken": skip } : {}) },
    })]));
    if (!Array.isArray(response.data) || response.count !== response.data.length ||
        typeof response.totalRecords !== "number" || !Number.isSafeInteger(response.totalRecords) || response.totalRecords < 0 ||
        (total !== undefined && total !== response.totalRecords)) {
      throw new CaptureError("Resource Graph returned an inconsistent result. Capture again.");
    }
    total = response.totalRecords;
    rows.push(...response.data);
    if (total > LIMITS[kind] || rows.length > LIMITS[kind]) throw new CaptureError("This source exceeds the capture limit.");
    skip = typeof response["\$skipToken"] === "string" ? response["\$skipToken"] : undefined;
    if (skip) {
      if (!response.data.length || tokens.has(skip) || tokens.size >= 12) throw new CaptureError("Resource Graph pagination did not finish.");
      tokens.add(skip);
    } else if (response.resultTruncated !== false && response.resultTruncated !== "false") {
      throw new CaptureError("Resource Graph reported an incomplete result.");
    }
  } while (skip);
  if (rows.length !== total) throw new CaptureError("Resource Graph returned fewer rows than reported.");
  return rows;
}

async function readAlerts(call: Az, subscription: string): Promise<unknown[]> {
  const route = `/subscriptions/${subscription}/providers/Microsoft.AlertsManagement/alerts`;
  let url = `${arm}${route}?api-version=2019-03-01&monitorCondition=Fired&timeRange=30d&includeContext=false&includeEgressConfig=false`;
  const links = new Set<string>();
  const rows: unknown[] = [];
  while (url) {
    if (links.has(url) || links.size >= 20) throw new CaptureError("Alerts pagination did not finish.");
    links.add(url);
    const response = obj(await call(["rest", "--subscription", subscription, "--method", "get", "--url", url]));
    if (!Array.isArray(response.value)) throw new CaptureError("Azure Monitor returned an invalid page.");
    rows.push(...response.value);
    if (rows.length > LIMITS.alerts) throw new CaptureError("Fired alerts exceed the capture limit.");
    if (response.nextLink == null || response.nextLink === "") { url = ""; continue; }
    if (typeof response.nextLink !== "string") throw new CaptureError("Azure Monitor returned an invalid continuation.");
    const next = new URL(response.nextLink);
    if (next.origin !== arm || next.pathname.toLowerCase() !== route.toLowerCase() || next.username || next.password || next.hash) {
      throw new CaptureError("Azure Monitor returned a continuation outside the requested scope.");
    }
    url = next.href;
  }
  return rows.map(item => {
    const alert = obj(item);
    const e = obj(obj(alert.properties).essentials);
    return {
      id: alert.id, title: alert.name, level: /^Sev[0-4]$/.test(String(e.severity)) ? Number(String(e.severity).at(-1)) : 5,
      condition: e.monitorCondition, occurred: sourceTime(e.startDateTime), target: e.targetResource ?? "",
    };
  });
}

const healthLevel = (severity: unknown) => {
  switch (String(severity).toLowerCase()) {
    case "critical": return 0;
    case "error": return 1;
    case "warning": return 2;
    case "informational": return 4;
    default: return 5;
  }
};

export async function capture(tenant: string, subscription: string, call: Az = az) {
  tenant = guid(tenant, "tenant ID");
  subscription = guid(subscription, "subscription ID");
  const account = obj(await call(["account", "show", "--subscription", subscription]));
  if (guid(account.id, "account subscription ID") !== subscription ||
      ![account.tenantId, account.homeTenantId].some(id => typeof id === "string" && id.toLowerCase() === tenant)) {
    throw new CaptureError("The signed-in subscription does not match the requested tenant and subscription.");
  }

  // Probe ARM first so an inaccessible subscription cannot become a successful empty Graph result.
  let blocked = "";
  try {
    const response = obj(await call(["rest", "--subscription", subscription, "--method", "get", "--url", `${arm}/subscriptions/${subscription}?api-version=2022-12-01`]));
    if (guid(response.subscriptionId, "Azure subscription ID") !== subscription || guid(response.tenantId, "Azure tenant ID") !== tenant) {
      throw new CaptureError("Azure returned a different tenant or subscription.");
    }
  } catch (error) {
    blocked = error instanceof CaptureError ? error.message : "The subscription scope could not be verified in Azure.";
  }

  async function read<K extends Source>(kind: K, get: () => Promise<unknown[]>) {
    try {
      if (blocked) throw new CaptureError(blocked);
      const rows = await get();
      return parseResult({ at: new Date().toISOString(), status: "complete", rows }, kind, subscription);
    } catch (error) {
      const reason = error instanceof CaptureError ? error.message : "Source data failed validation. Capture again or review source permissions.";
      return parseResult({ at: new Date().toISOString(), status: "unavailable", reason }, kind, subscription);
    }
  }

  const [inventory, alerts, health] = await Promise.all([
    read("inventory", () => queryGraph(call, subscription, "inventory")),
    read("alerts", () => readAlerts(call, subscription)),
    read("health", async () => (await queryGraph(call, subscription, "health")).map(item => {
      const row = obj(item);
      return {
        id: row.id, title: row.title, level: healthLevel(row.severity), condition: `${row.eventType} · ${row.status}`,
        occurred: sourceTime(row.occurred), target: "",
      };
    })),
  ]);
  return { schema: 1, tenant, subscription, at: new Date().toISOString(), sources: { inventory, alerts, health } };
}

if (import.meta.main) {
  try {
    if (process.argv.length !== 4) throw new CaptureError("Usage: node capture.ts TENANT_ID SUBSCRIPTION_ID");
    const output = JSON.stringify(await capture(process.argv[2]!, process.argv[3]!));
    if (Buffer.byteLength(output) > MAX_CAPTURE) throw new CaptureError("The capture exceeds 768 KiB.");
    process.stdout.write(output + "\n");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Capture failed.");
    process.exitCode = 1;
  }
}
