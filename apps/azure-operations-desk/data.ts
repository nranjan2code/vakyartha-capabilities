export const SOURCES = ["inventory", "alerts", "health"] as const;
export type Source = typeof SOURCES[number];
export const LABELS: Record<Source, string> = { inventory: "Resource Graph", alerts: "Azure Monitor alerts", health: "Azure Service Health" };
export const LIMITS: Record<Source, number> = { inventory: 1200, alerts: 200, health: 100 };
export const MAX_CAPTURE = 768 * 1024;
export const MAX_SCOPES = 32;
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type Scope = { tenant: string; subscription: string; customer: string; label: string; owner: string };
export type Asset = { id: string; name: string; type: string; location: string; group: string };
export type Signal = { id: string; title: string; level: number; condition: string; occurred: string; target: string };
type Rows = { inventory: Asset[]; alerts: Signal[]; health: Signal[] };
export type Result<K extends Source> = { at: string; status: "complete"; rows: Rows[K] } | { at: string; status: "unavailable"; reason: string };
export type Sources = { [K in Source]?: Result<K> };
export type Capture = { schema: 1; tenant: string; subscription: string; at: string; sources: Required<Sources> };
export const STATUSES = ["New", "Investigating", "Waiting", "Done"] as const;
export type Triage = { status: typeof STATUSES[number]; owner: string; note: string; at: string };

export function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function field(value: unknown, max: number, label: string, required = false): string {
  if (typeof value !== "string" || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw Error(`Invalid ${label}.`);
  }
  const clean = value.trim();
  if (required && !clean) throw Error(`Enter ${label}.`);
  return clean;
}

export function guid(value: unknown, label: string): string {
  const id = field(value, 36, label, true).toLowerCase();
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw Error(`Enter a valid ${label}.`);
  return id;
}

export function stamp(value: unknown, label: string): string {
  const time = field(value, 40, label, true);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(time) || !Number.isFinite(Date.parse(time))) {
    throw Error(`Invalid ${label}. Use a UTC date and time.`);
  }
  const normalized = new Date(time).toISOString();
  if (normalized.slice(0, 19) !== time.slice(0, 19)) throw Error(`Invalid ${label}.`);
  return normalized;
}

export function scopedId(value: unknown, subscription: string): string {
  const id = field(value, 750, "resource ID", true);
  if (!id.toLowerCase().startsWith(`/subscriptions/${subscription}/`) ||
      !/^\/(?:[^/?#\\%\s]+\/)*[^/?#\\%\s]+$/.test(id) ||
      id.split("/").some(part => part === "." || part === "..")) {
    throw Error("A resource ID is invalid or belongs to a different subscription.");
  }
  return id;
}

export function parseScope(value: unknown): Scope {
  const v = obj(value);
  return {
    tenant: guid(v.tenant, "tenant ID"), subscription: guid(v.subscription, "subscription ID"),
    customer: field(v.customer, 100, "customer name", true), label: field(v.label, 110, "subscription name", true),
    owner: field(v.owner ?? "", 100, "default owner"),
  };
}

export function parseTriage(value: unknown): Triage {
  const v = obj(value);
  const status = STATUSES.find(s => s === v.status);
  if (!status) throw Error("Select a triage status.");
  return { status, owner: field(v.owner, 100, "owner"), note: field(v.note, 1500, "triage note"), at: stamp(v.at, "triage time") };
}

function parseRows<K extends Source>(value: unknown, kind: K, subscription: string): Rows[K] {
  if (!Array.isArray(value) || value.length > LIMITS[kind]) throw Error(`Invalid or oversized ${LABELS[kind]} results.`);
  const seen = new Set<string>();
  const rows = value.map(raw => {
    const row = obj(raw);
    const id = scopedId(row.id, subscription);
    const key = id.toLowerCase();
    if (seen.has(key)) throw Error(`Duplicate record in ${LABELS[kind]} results.`);
    seen.add(key);
    if (kind === "inventory") {
      return {
        id, name: field(row.name, 180, "resource name", true), type: field(row.type, 180, "resource type", true),
        location: field(row.location, 80, "location"), group: field(row.group, 100, "resource group"),
      };
    }
    const provider = kind === "alerts" ? "microsoft.alertsmanagement/alerts" : "microsoft.resourcehealth/events";
    if (!key.startsWith(`/subscriptions/${subscription}/providers/${provider}/`)) throw Error("Unexpected signal resource type.");
    const level = row.level;
    if (typeof level !== "number" || !Number.isInteger(level) || level < 0 || level > 5) throw Error("Invalid signal severity.");
    const condition = field(row.condition, 80, "source condition", true);
    if (kind === "alerts" && condition !== "Fired") throw Error("Alert results must contain fired alerts.");
    return {
      id, title: field(row.title, 300, "signal title", true), level, condition,
      occurred: row.occurred === "" ? "" : stamp(row.occurred, "signal time"),
      target: row.target === "" ? "" : scopedId(row.target, subscription),
    };
  });
  return rows as Rows[K];
}

export function parseResult<K extends Source>(value: unknown, kind: K, subscription: string): Result<K> {
  const v = obj(value);
  const at = stamp(v.at, "source capture time");
  if (v.status === "unavailable") return { at, status: "unavailable", reason: field(v.reason, 180, "source error", true) };
  if (v.status !== "complete") throw Error(`Invalid coverage status for ${LABELS[kind]}.`);
  return { at, status: "complete", rows: parseRows(v.rows, kind, subscription) };
}

export function parseCapture(text: unknown, scope: Scope, now: number): Capture {
  if (typeof text !== "string" || !text.trim() || Buffer.byteLength(text) > MAX_CAPTURE) {
    throw Error("Paste a capture up to 768 KiB.");
  }
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw Error("Paste valid capture JSON."); }
  const v = obj(raw);
  if (v.schema !== 1) throw Error("This capture format is unsupported.");
  const tenant = guid(v.tenant, "capture tenant ID");
  const subscription = guid(v.subscription, "capture subscription ID");
  if (tenant !== scope.tenant || subscription !== scope.subscription) throw Error("The capture belongs to a different tenant or subscription.");
  const at = stamp(v.at, "capture time");
  const sources = obj(v.sources);
  const result = {
    inventory: parseResult(sources.inventory, "inventory", subscription),
    alerts: parseResult(sources.alerts, "alerts", subscription),
    health: parseResult(sources.health, "health", subscription),
  };
  if (Date.parse(at) > now + 5 * 60_000 || SOURCES.some(kind => result[kind].at > at)) {
    throw Error("The capture has inconsistent times. Check the collector clock.");
  }
  return { schema: 1, tenant, subscription, at, sources: result };
}

export function coverage(result: Result<Source> | undefined, now: number): string {
  if (!result) return "Missing";
  if (result.status === "unavailable") return "Unavailable";
  return now - Date.parse(result.at) > MAX_AGE_MS ? "Stale" : "Captured";
}

export function utc(at: string): string {
  return at ? at.replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "Unknown";
}

export function csv(rows: (string | number)[][]): string {
  return rows.map(row => row.map(value => {
    let cell = String(value);
    if (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(cell)) cell = "'" + cell;
    return '"' + cell.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n") + "\r\n";
}
