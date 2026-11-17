export type Scope = { tenant: string; subscription: string; customer: string; label: string };
export type ScopeRow = Scope & { capturedAt: string };
export type Asset = { id: string; name: string; type: string; location: string; group: string };
export type Event = { id: string; title: string; level: number; condition: string; occurred: string; target: string };
type Source<T> = { at: string; status: "complete"; rows: T[] } | { at: string; status: "unavailable"; reason: string };
export type Snapshot = { at: string; sources: { inventory?: Source<Asset>; alerts?: Source<Event>; health?: Source<Event> } };
export type Evidence = { scope: Scope; snapshot: Snapshot | null };

export function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw Error("Unexpected evidence record.");
  return v as Record<string, unknown>;
}

export function text(v: unknown, max: number, label: string, required = false): string {
  if (typeof v !== "string" || v.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)) throw Error(`Invalid ${label}.`);
  if (required && !v.trim()) throw Error(`Enter ${label}.`);
  return v;
}

export function uuid(v: unknown) {
  const id = text(v, 36, "scope ID").toLowerCase();
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw Error("Invalid scope ID.");
  return id;
}
export function timestamp(v: unknown): string {
  const raw = text(v, 28, "capture time", true);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(raw) || new Date(raw).toISOString() !== raw) throw Error("Invalid capture time.");
  return raw;
}

export function scope(v: unknown): Scope {
  const raw = object(v);
  return { tenant: uuid(raw.tenant), subscription: uuid(raw.subscription), customer: text(raw.customer, 100, "customer", true), label: text(raw.label, 110, "subscription name", true) };
}

export function scopes(v: unknown): ScopeRow[] {
  const raw = object(v).scopes;
  if (!Array.isArray(raw) || raw.length > 32) throw Error("The desk returned an invalid scope list.");
  const values = raw.map(item => ({ ...scope(item), capturedAt: object(item).capturedAt === "" ? "" : timestamp(object(item).capturedAt) }));
  if (new Set(values.map(item => item.subscription)).size !== values.length) throw Error("Duplicate subscriptions in the desk scope list.");
  return values;
}

function id(v: unknown, subscription: string) {
  const result = text(v, 750, "resource ID", true);
  if (!result.toLowerCase().startsWith(`/subscriptions/${subscription}/`)) throw Error("A source record belongs to another subscription.");
  return result;
}

function source<T extends { id: string }>(value: unknown, limit: number, row: (v: Record<string, unknown>) => T): Source<T> | undefined {
  if (value === undefined) return undefined;
  const r = object(value);
  const at = timestamp(r.at);
  if (r.status === "unavailable") return { at, status: "unavailable", reason: text(r.reason, 180, "source failure", true) };
  if (r.status !== "complete" || !Array.isArray(r.rows) || r.rows.length > limit) throw Error("Invalid source result.");
  const rows = r.rows.map(item => row(object(item)));
  if (new Set(rows.map(item => item.id.toLowerCase())).size !== rows.length) throw Error("Duplicate source records.");
  return { at, status: "complete", rows };
}

export function evidence(value: unknown, requested?: Scope): Evidence {
  const raw = object(value);
  const found = scope(raw.scope);
  if (requested && (found.tenant !== requested.tenant || found.subscription !== requested.subscription)) throw Error("Desk evidence belongs to another customer scope.");
  if (raw.snapshot === null) return { scope: found, snapshot: null };
  const input = object(raw.snapshot);
  const rawSources = object(input.sources);
  const asset = (v: Record<string, unknown>): Asset => ({
    id: id(v.id, found.subscription), name: text(v.name, 180, "resource name", true), type: text(v.type, 180, "resource type", true),
    location: text(v.location, 80, "region"), group: text(v.group, 100, "resource group"),
  });
  const event = (v: Record<string, unknown>): Event => {
    if (typeof v.level !== "number" || !Number.isInteger(v.level) || v.level < 0 || v.level > 5) throw Error("Invalid signal severity.");
    return {
      id: id(v.id, found.subscription), title: text(v.title, 300, "signal title", true), level: v.level,
      condition: text(v.condition, 80, "condition", true), occurred: v.occurred === "" ? "" : timestamp(v.occurred),
      target: v.target === "" ? "" : id(v.target, found.subscription),
    };
  };
  const at = timestamp(input.at);
  const result = { inventory: source(rawSources.inventory, 1200, asset), alerts: source(rawSources.alerts, 200, event), health: source(rawSources.health, 100, event) };
  if (Object.values(result).some(s => s && s.at > at)) throw Error("Source times exceed the capture time.");
  return { scope: found, snapshot: { at, sources: result } };
}

export function decode(value: unknown): unknown {
  if (typeof value === "string") return JSON.parse(value);
  if (Array.isArray(value) && value.length === 1) {
    const first = object(value[0]);
    if (first.type === "text" && typeof first.text === "string") return JSON.parse(first.text);
  }
  return value;
}

export function coverage(value: { at: string; status: string } | undefined, now: number) {
  if (!value) return "Missing";
  if (value.status === "unavailable") return "Unavailable";
  return now - Date.parse(value.at) > 86400000 ? "Stale" : "Captured";
}

export function delta(before: Snapshot | null, after: Snapshot | null) {
  const a = before?.sources.inventory, b = after?.sources.inventory;
  if (a?.status !== "complete" || b?.status !== "complete" || b.at <= a.at) return [];
  const old = new Map(a.rows.map(r => [r.id.toLowerCase(), r]));
  const result = b.rows.flatMap(row => {
    const key = row.id.toLowerCase();
    const prior = old.get(key);
    old.delete(key);
    if (!prior) return [{ ...row, change: "Added to capture" }];
    if (row.name !== prior.name || row.type !== prior.type || row.location !== prior.location || row.group !== prior.group) {
      return [{ ...row, change: "Inventory fields changed" }];
    }
    return [];
  });
  return [...result, ...[...old.values()].map(row => ({ ...row, change: "Absent from newer capture" }))];
}

export const utc = (at: string) => at ? at.replace("T", " ").replace(/\.\d{3}Z$/, " UTC") : "Unknown";
export const plain = (str: string) => str.replace(/[\\`*_{}\[\]()#+\-.!<>~|$]/g, "\\$&");
export const csv = (rows: (string | number)[][]) => rows.map(row => row.map(value => {
  const s = String(value);
  return '"' + (/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
}).join(",")).join("\r\n") + "\r\n";
