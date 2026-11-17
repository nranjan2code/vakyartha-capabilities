import { field, guid, obj, stamp } from "./data.ts";

export const WORK_KINDS = ["Incident", "Maintenance", "Backup", "Patching", "Security", "Access", "Cost", "Change"] as const;
export const WORK_STATES = ["Planned", "In progress", "Waiting", "Closed"] as const;
export type Work = {
  id: string; subscription: string; title: string; kind: string; status: string;
  owner: string; due: string; ticket: string; evidence: string; updatedAt: string;
};
export const blankWork = (): Work => ({ id: "", subscription: "", title: "", kind: "Maintenance", status: "Planned", owner: "", due: "", ticket: "", evidence: "", updatedAt: "" });

export function workRecord(raw: unknown): Work {
  const r = obj(raw);
  const kind = WORK_KINDS.find(k => k === r.kind);
  const status = WORK_STATES.find(k => k === r.status);
  if (!kind || !status) throw Error("Select a valid work type and status.");
  const due = field(r.due, 10, "due date");
  if (due && (!/^\d{4}-\d\d-\d\d$/.test(due) || stamp(due + "T00:00:00Z", "due date").slice(0, 10) !== due)) throw Error("Enter a valid due date.");
  const evidence = field(r.evidence, 1000, "follow-up or evidence");
  if (status === "Closed" && !evidence) throw Error("Record the outcome or evidence before closing this work.");
  return {
    id: guid(r.id, "work ID"),
    subscription: guid(r.subscription, "work subscription"),
    title: field(r.title, 150, "work title", true), kind, status,
    owner: field(r.owner, 100, "owner"), due, ticket: field(r.ticket, 150, "ticket reference"), evidence,
    updatedAt: stamp(r.updatedAt, "work update time"),
  };
}
