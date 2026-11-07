import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyState, handleAction, normalize, view, type State } from "../apps/clinic-desk/server.ts";

const now = () => new Date("2026-11-02T04:00:00Z");
const doctor = { id: "doc-1", name: "Dr. Asha Rao", specialty: "", days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: "09:00", end: "17:00", slot: 15, breakStart: "13:00", breakEnd: "14:00", active: true, room: "" };
const seeded = (): State => normalize({
  ...emptyState(), clinic: { name: "Test Clinic", timezone: "UTC", tagline: "", phone: "", address: "" }, doctors: [doctor],
  patients: [{ id: "pat-1", name: "Meera Iyer", phone: "9845011111", dob: "", notes: "", created: "2026-10-01T00:00:00Z", email: "", allergies: "", emergency: "" }],
  appts: [{ id: "apt-1", doctorId: "doc-1", patientId: "pat-1", date: "2026-11-20", time: "10:00", minutes: 15, reason: "Check-in", kind: "Consultation", status: "booked", created: "2026-11-01T00:00:00Z", updated: "2026-11-01T00:00:00Z" }],
});

test("Clinic Desk routes people to the relevant tab and keeps calendar navigation local", async () => {
  const context = { state: seeded(), now };
  await handleAction("open_doctor", { id: "doc-1", to: "doctors" }, context, "open_doctor");
  assert.equal(context.state.ui!.go.doctor!.tab, "week");
  const profile = view(context.state, now(), ["doctors"])[0]!;
  assert.match(String(profile.nodes.find((node) => node.id === "p-tabs")?.props?.active), /^week#\d+$/);

  await handleAction("/view", "month", context);
  const month = view(context.state, now(), ["today"])[0]!;
  assert.ok(month.nodes.some((node) => node.id === "cal-month"));
  assert.ok((month.data[0]!.value as { events: unknown[] }).events.length > 0);

  await handleAction("open_day", { date: "2026-11-20" }, context, "open_day");
  assert.equal(context.state.ui!.go.schedule!.tab, "appts");
  assert.equal(context.state.ui!.date, "2026-11-20");
  assert.equal(context.state.ui!.view, "list");
  const schedule = view(context.state, now(), ["today"])[0]!;
  assert.match(String(schedule.nodes.find((node) => node.id === "tabs")?.props?.active), /^appts#\d+$/);
});

test("Today's filters have an action of their own in every state and view", () => {
  // The surface lint rejects inputs nothing submits; a quiet clinic in week or month view shows
  // no booking card or tab action that could cover them (an update then failed outright).
  const quiet = normalize({ ...emptyState(), clinic: { name: "Test Clinic", timezone: "UTC", tagline: "", phone: "", address: "" }, doctors: [doctor] });
  for (const shown of ["list", "week", "month"] as const) {
    const state = normalize({ ...quiet, ui: { ...quiet.ui!, view: shown } });
    const nodes = view(state, now(), ["today"])[0]!.nodes as { id: string; type: string; children?: string[]; props: Record<string, unknown> }[];
    const filters = nodes.find((n) => n.id === "filters")!;
    assert.deepEqual(filters.children!.slice(0, 2), ["filter", "view"]);
    const always = filters.children!.map((id) => nodes.find((n) => n.id === id)!).filter((n) => n.type === "button" && n.props.action && !n.props.visibleIf);
    assert.ok(always.length, `no action beside the filters in ${shown}`);
  }
});
