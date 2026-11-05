// Clinic Desk: front-desk appointment booking for one clinic. Doctors, leave,
// patients and appointments in `context.state` are the only data owner; `view()`
// derives every surface, and the spoken day brief, from them on each run. Free
// slots are computed from each doctor's weekly hours, leave and the appointments
// already held, never stored, so a slot cannot drift out of step with a booking.
// It runs in the sandbox like every app and calls no tools, with no network or
// database. Patient details
// stay on this computer. The assistant reaches it only through the declared
// exports (handleQuery reads; prepare_booking fills the Book form for a person to confirm).
// intel.ts estimates no-show risk and demand from the clinic's own records; show.ts
// turns the day into a programme for Listen and Watch.

import { programme } from "./show.ts";
import { attention, patientFacts, report, PERIODS } from "./insights.ts";
import { MIN_HISTORY, outlook, riskModel, riskNote, riskOf, type Outlook } from "./intel.ts";

export type Status = "booked" | "checked_in" | "completed" | "cancelled" | "no_show";
export interface Doctor { id: string; name: string; specialty: string; days: string[]; start: string; end: string; slot: number; breakStart: string; breakEnd: string; active: boolean; room: string }
export interface Leave { id: string; doctorId: string; from: string; to: string; note: string }
export interface Patient { id: string; name: string; phone: string; dob: string; notes: string; created: string; email: string; allergies: string; emergency: string }
export interface Appt { id: string; doctorId: string; patientId: string; date: string; time: string; minutes: number; reason: string; kind: string; status: Status; created: string; updated: string }
export interface Wait { id: string; patientId: string; doctorId: string; note: string; created: string }
export interface Draft { doctorId: string; date: string; time: string; name: string; phone: string; reason: string; kind: string; rescheduleId: string }
export interface Ui {
  date: string; filter: string; draft: Draft; openPatientId: string; confirmDelete: boolean; openDoctorId: string;
  newDoctor: string; leave: { from: string; to: string; note: string };
  view: "list" | "week" | "month"; insightDays: string; insightDoctor: string; newPatient: { name: string; phone: string; dob: string };
  /** Which tab an action asked each screen to show, with a counter so asking again is a new request. */
  go: Record<string, { tab: string; n: number }>;
}
export interface State { clinic?: { name: string; timezone: string; tagline: string; phone: string; address: string }; doctors?: Doctor[]; leave?: Leave[]; patients?: Patient[]; appts?: Appt[]; waitlist?: Wait[]; seq?: number; ui?: Ui }

interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
interface Update { surface: string; nodes: Node[]; data: { op: "replace"; path: "/"; value: Record<string, unknown> }[] }
export interface Context { state: State; surfaces?: Record<string, unknown>; now?: () => Date; appRevision?: number }

const MAX_DOCTORS = 40, MAX_PATIENTS = 3000, MAX_APPTS = 20_000, MAX_LEAVE = 400, MAX_WAIT = 300, MAX_DAYS_AHEAD = 120;
export const VISIT_TYPES = ["Consultation", "Follow-up", "Check-up", "Vaccination", "Procedure", "Test results"];
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const PRESETS: Record<string, string[]> = { weekdays: DAYS.slice(0, 5), "mon-sat": DAYS.slice(0, 6), "every-day": DAYS };
export const SLOT_MINUTES = [10, 15, 20, 30, 45, 60];
const HOLDING: Status[] = ["booked", "checked_in", "completed"];
const NEXT: Record<Status, Status[]> = { booked: ["checked_in", "cancelled", "no_show"], checked_in: ["completed", "cancelled", "booked"], completed: ["checked_in"], cancelled: ["booked"], no_show: ["booked"] };
const STATUS_LABEL: Record<Status, string> = { booked: "Booked", checked_in: "Checked in", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" };
const STATUS_TONE: Record<Status, string> = { booked: "info", checked_in: "warning", completed: "success", cancelled: "neutral", no_show: "danger" };
const TIMES = Array.from({ length: 33 }, (_, i) => `${String(6 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

// --- small helpers -----------------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").slice(0, max);
const line = (v: unknown, max = 200) => text(v, max).replace(/\s+/g, " ").trim();
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const replaceAll = (value: Record<string, unknown>) => [{ op: "replace" as const, path: "/" as const, value }];
const digits = (v: string) => v.replace(/\D/g, "");

export const isDate = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const dayName = (date: string) => DAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]!;
const longDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const spokenTime = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? "AM" : "PM"}`; };
const zoneOk = (z: string) => { try { new Intl.DateTimeFormat("en", { timeZone: z }); return true; } catch { return false; } };
const hostZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

/** The clinic's wall clock: its own date and time of day, whatever zone the engine runs in. */
export function wall(now: Date, zone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone || hostZone(), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

// --- canonical state ---------------------------------------------------------------

const blankDraft = (): Draft => ({ doctorId: "", date: "", time: "", name: "", phone: "", reason: "", kind: "Consultation", rescheduleId: "" });

/** State arrives as untrusted JSON: keep only well-formed records, and drop references to records that are gone. */
export function normalize(s: State): State {
  const zone = line(s.clinic?.timezone, 64);
  const clinic = { name: line(s.clinic?.name, 80) || "Our Clinic", timezone: zone && zoneOk(zone) ? zone : "", tagline: line(s.clinic?.tagline, 100), phone: line(s.clinic?.phone, 24), address: line(s.clinic?.address, 160) };
  const doctors = (Array.isArray(s.doctors) ? s.doctors : []).slice(0, MAX_DOCTORS).flatMap((raw): Doctor[] => {
    const d = (raw ?? {}) as Partial<Doctor>;
    if (typeof d.id !== "string" || !d.id || !line(d.name, 80)) return [];
    const start = isTime(d.start) ? d.start : "09:00";
    const end = isTime(d.end) && minutes(d.end) > minutes(start) ? d.end : clock(Math.max(minutes(start) + 60, 17 * 60));
    const breakOk = isTime(d.breakStart) && isTime(d.breakEnd) && minutes(d.breakEnd) > minutes(d.breakStart);
    return [{
      id: d.id, name: line(d.name, 80), specialty: line(d.specialty, 80),
      days: DAYS.filter((x) => (Array.isArray(d.days) ? d.days : ["Mon", "Tue", "Wed", "Thu", "Fri"]).includes(x)),
      start, end, slot: SLOT_MINUTES.includes(Number(d.slot)) ? Number(d.slot) : 15,
      breakStart: breakOk ? d.breakStart! : "", breakEnd: breakOk ? d.breakEnd! : "", active: d.active !== false, room: line(d.room, 40),
    }];
  });
  const doctorIds = new Set(doctors.map((d) => d.id));
  const leave = (Array.isArray(s.leave) ? s.leave : []).slice(0, MAX_LEAVE).flatMap((raw): Leave[] => {
    const l = (raw ?? {}) as Partial<Leave>;
    return typeof l.id === "string" && doctorIds.has(l.doctorId as string) && isDate(l.from) && isDate(l.to) && l.to >= l.from ? [{ id: l.id, doctorId: l.doctorId!, from: l.from, to: l.to, note: line(l.note, 120) }] : [];
  });
  const patients = (Array.isArray(s.patients) ? s.patients : []).slice(0, MAX_PATIENTS).flatMap((raw): Patient[] => {
    const p = (raw ?? {}) as Partial<Patient>;
    return typeof p.id === "string" && p.id && line(p.name, 100) ? [{ id: p.id, name: line(p.name, 100), phone: line(p.phone, 24), dob: isDate(p.dob) ? p.dob : "", notes: text(p.notes, 2000), created: typeof p.created === "string" ? p.created : new Date(0).toISOString(), email: line(p.email, 120), allergies: line(p.allergies, 200), emergency: line(p.emergency, 120) }] : [];
  });
  const patientIds = new Set(patients.map((p) => p.id));
  const appts = (Array.isArray(s.appts) ? s.appts : []).slice(0, MAX_APPTS).flatMap((raw): Appt[] => {
    const a = (raw ?? {}) as Partial<Appt>;
    if (typeof a.id !== "string" || !doctorIds.has(a.doctorId as string) || !patientIds.has(a.patientId as string) || !isDate(a.date) || !isTime(a.time)) return [];
    const stamp = typeof a.updated === "string" ? a.updated : new Date(0).toISOString();
    return [{ id: a.id, doctorId: a.doctorId!, patientId: a.patientId!, date: a.date, time: a.time, minutes: Math.min(Math.max(Math.trunc(Number(a.minutes)) || 15, 5), 240), reason: line(a.reason, 160), kind: VISIT_TYPES.includes(a.kind as string) ? a.kind! : "Consultation", status: a.status && a.status in NEXT ? a.status : "booked", created: typeof a.created === "string" ? a.created : stamp, updated: stamp }];
  });
  const waitlist = (Array.isArray(s.waitlist) ? s.waitlist : []).slice(0, MAX_WAIT).flatMap((raw): Wait[] => {
    const w = (raw ?? {}) as Partial<Wait>;
    return typeof w.id === "string" && patientIds.has(w.patientId as string) ? [{ id: w.id, patientId: w.patientId!, doctorId: doctorIds.has(w.doctorId as string) ? w.doctorId! : "", note: line(w.note, 160), created: typeof w.created === "string" ? w.created : new Date(0).toISOString() }] : [];
  });
  const u = (s.ui ?? {}) as Partial<Ui>;
  const d = (u.draft ?? {}) as Partial<Draft>;
  const activeDoctor = (id: unknown) => doctors.some((x) => x.id === id && x.active);
  const ui: Ui = {
    date: isDate(u.date) ? u.date : "",
    filter: doctorIds.has(u.filter as string) ? u.filter! : "",
    draft: {
      doctorId: activeDoctor(d.doctorId) ? d.doctorId! : "", date: isDate(d.date) ? d.date : "", time: isTime(d.time) ? d.time : "",
      name: line(d.name, 100), phone: line(d.phone, 24), reason: line(d.reason, 160), kind: VISIT_TYPES.includes(d.kind as string) ? d.kind! : "Consultation",
      rescheduleId: appts.some((a) => a.id === d.rescheduleId) ? d.rescheduleId! : "",
    },
    openPatientId: patientIds.has(u.openPatientId as string) ? u.openPatientId! : "",
    confirmDelete: u.confirmDelete === true && patientIds.has(u.openPatientId as string),
    openDoctorId: doctorIds.has(u.openDoctorId as string) ? u.openDoctorId! : doctors[0]?.id ?? "",
    newDoctor: line(u.newDoctor, 80),
    leave: { from: isDate(u.leave?.from) ? u.leave!.from : "", to: isDate(u.leave?.to) ? u.leave!.to : "", note: line(u.leave?.note, 120) },
    view: viewOf(u), insightDays: ["7", "30", "90"].includes(u.insightDays as string) ? u.insightDays! : "30", insightDoctor: doctorIds.has(u.insightDoctor as string) ? u.insightDoctor! : "",
    newPatient: { name: line(u.newPatient?.name, 100), phone: line(u.newPatient?.phone, 24), dob: isDate(u.newPatient?.dob) ? u.newPatient!.dob : "" },
    go: Object.fromEntries(Object.entries(u.go && typeof u.go === "object" ? u.go : {}).filter(([k, v]) => TAB_KEYS.includes(k) && typeof v?.tab === "string" && Number.isInteger(v.n)).map(([k, v]) => [k, { tab: line(v.tab, 20), n: v.n }])),
  };
  return { clinic, doctors, leave, patients, appts, waitlist, seq: Number.isInteger(s.seq) ? s.seq : appts.length + patients.length + waitlist.length, ui };
}

const TAB_KEYS = ["schedule", "patient", "doctor", "setup"];
/** Ask a screen to show one of its tabs. The counter makes a repeated request count; it follows the clock so it
 * never repeats an earlier value, even after the app's data is reset while a view still remembers the old one. */
let goClock = 0;
const go = (ui: Ui, key: string, tab: string) => { ui.go[key] = { tab, n: Math.max((ui.go[key]?.n ?? 0) + 1, goClock) }; };
const activeTab = (ui: Ui, key: string) => (ui.go[key] ? `${ui.go[key]!.tab}#${ui.go[key]!.n}` : undefined);
const nextId = (s: State, kind: string) => `${kind}-${(s.seq = (s.seq ?? 0) + 1)}`;
const viewOf = (v: unknown): "list" | "week" | "month" => { const x = (v as { view?: unknown } | null)?.view; return x === "week" || x === "month" ? x : "list"; };
const doctorOf = (s: State, id: string) => s.doctors!.find((d) => d.id === id);
const patientOf = (s: State, id: string) => s.patients!.find((p) => p.id === id);
const today = (s: State, now: Date) => wall(now, s.clinic!.timezone).date;
const effective = (date: string, s: State, now: Date) => date || today(s, now);

// --- availability ----------------------------------------------------------------------

export const onLeave = (s: State, doctorId: string, date: string) => s.leave!.find((l) => l.doctorId === doctorId && l.from <= date && date <= l.to);

/** Free start times for a doctor on a date. An appointment being rescheduled does not block its own slot. */
export function freeSlots(s: State, doctor: Doctor, date: string, now: Date, ignoreId = ""): string[] {
  if (!doctor.active || !doctor.days.includes(dayName(date)) || onLeave(s, doctor.id, date)) return [];
  const w = wall(now, s.clinic!.timezone);
  if (date < w.date) return [];
  const held = s.appts!.filter((a) => a.doctorId === doctor.id && a.date === date && a.id !== ignoreId && HOLDING.includes(a.status));
  const out: string[] = [];
  for (let t = minutes(doctor.start); t + doctor.slot <= minutes(doctor.end); t += doctor.slot) {
    const end = t + doctor.slot;
    if (date === w.date && t < w.minute) continue;
    if (doctor.breakStart && t < minutes(doctor.breakEnd) && end > minutes(doctor.breakStart)) continue;
    if (held.some((a) => t < minutes(a.time) + a.minutes && end > minutes(a.time))) continue;
    out.push(clock(t));
  }
  return out;
}

/** Why a day has no slots, in words the front desk can act on. */
function whyNone(s: State, doctor: Doctor | undefined, date: string, now: Date) {
  if (!doctor) return "Choose a doctor.";
  if (!doctor.days.includes(dayName(date))) return `${doctor.name} does not see patients on ${dayName(date)}s.`;
  const l = onLeave(s, doctor.id, date);
  if (l) return `${doctor.name} is away${l.note ? ` (${l.note})` : ""}.`;
  return date < today(s, now) ? "That date has passed." : "Every slot that day is taken or past.";
}

/** The day Book shows: the one picked, else the first day this doctor has a free slot, so the form never opens on an empty day. */
function bookDay(s: State, now: Date): string {
  const d = s.ui!.draft;
  if (d.date) return d.date;
  const doctor = doctorOf(s, d.doctorId) ?? s.doctors!.find((x) => x.active), start = today(s, now);
  if (doctor) for (let i = 0; i <= 30; i++) if (freeSlots(s, doctor, addDays(start, i), now, d.rescheduleId).length) return addDays(start, i);
  return start;
}

/** Appointments that still lie ahead and need the patient or doctor to show up. */
const upcoming = (s: State, now: Date) => {
  const w = wall(now, s.clinic!.timezone);
  return (a: Appt) => (a.status === "booked" || a.status === "checked_in") && (a.date > w.date || (a.date === w.date && minutes(a.time) + a.minutes > w.minute));
};

// --- actions -----------------------------------------------------------------------------

const SURFACES = ["today", "book", "patients", "doctors", "insights", "setup"] as const;
type Surface = (typeof SURFACES)[number];

export async function handleAction(controlId: string, value: unknown, context: Context, action?: string) {
  const s = (context.state = normalize(context.state));
  const nowDate = context.now?.() ?? new Date();
  const now = nowDate.toISOString();
  goClock = nowDate.getTime();
  const ui = s.ui!, draft = ui.draft;
  const payload = (value && typeof value === "object" ? value : {}) as { id?: unknown; time?: unknown; status?: unknown };
  const payloadId = typeof payload.id === "string" ? payload.id : "";
  let touched: Surface[] = [...SURFACES];
  let focusSurface: Surface | undefined;
  const openDoctor = () => doctorOf(s, ui.openDoctorId);
  const openPatient = () => patientOf(s, ui.openPatientId);
  const bookingDoctor = () => doctorOf(s, draft.doctorId) ?? s.doctors!.find((d) => d.active);
  // A returning patient is matched by phone and name, so a family sharing a number stays separate.
  const patientFor = (name: string, phone: string, dob = ""): Patient => {
    if (!name) throw new Error("Enter the patient's name");
    if (digits(phone).length < 6) throw new Error("Enter a phone number the clinic can call");
    const known = s.patients!.find((p) => digits(p.phone) === digits(phone) && p.name.toLowerCase() === name.toLowerCase());
    if (known) return known;
    if (s.patients!.length >= MAX_PATIENTS) throw new Error(`Clinic Desk keeps up to ${MAX_PATIENTS} patients`);
    const created: Patient = { id: nextId(s, "pat"), name, phone, dob, notes: "", created: now, email: "", allergies: "", emergency: "" };
    s.patients!.push(created);
    return created;
  };
  const holds = (doctor: Doctor, date: string, time: string, length: number, ignoreId: string) =>
    s.appts!.some((a) => a.id !== ignoreId && a.doctorId === doctor.id && a.date === date && HOLDING.includes(a.status) && minutes(time) < minutes(a.time) + a.minutes && minutes(time) + length > minutes(a.time));

  if (!action) {
    const doctorField = controlId.match(/^\/doctor\/(name|specialty|room|days|start|end|slot|breakStart|breakEnd)$/);
    if (controlId === "/date") { if (!isDate(value)) throw new Error("Pick a valid date"); ui.date = value; touched = ["today"]; }
    else if (controlId === "/view") { ui.view = viewOf({ view: value }); touched = ["today"]; }
    else if (controlId === "/filter") { ui.filter = doctorOf(s, String(value)) ? String(value) : ""; touched = ["today"]; }
    else if (/^\/draft\/(doctorId|date|name|phone|reason|kind|patientId)$/.test(controlId)) {
      const k = controlId.slice(7) as "doctorId" | "date" | "name" | "phone" | "reason" | "kind" | "patientId";
      if (k === "doctorId") {
        // A blank pick (a placeholder row) keeps the current doctor rather than failing.
        if (doctorOf(s, String(value))?.active && draft.doctorId !== value) { draft.doctorId = String(value); draft.time = ""; }
      }
      else if (k === "date") { if (!isDate(value)) throw new Error("Pick a valid date"); draft.date = value; draft.time = ""; }
      else if (k === "kind") draft.kind = VISIT_TYPES.includes(String(value)) ? String(value) : draft.kind;
      else if (k === "patientId") {
        const known = patientOf(s, String(value));
        if (known) { draft.name = known.name; draft.phone = known.phone; }
      }
      else draft[k] = line(value, k === "phone" ? 24 : k === "reason" ? 160 : 100);
      touched = ["book"];
    }
    else if (/^\/newPatient\/(name|phone|dob)$/.test(controlId)) {
      const k = controlId.slice(12) as "name" | "phone" | "dob";
      if (k === "dob") { if (value !== "" && !isDate(value)) throw new Error("Pick a valid date of birth"); ui.newPatient.dob = String(value); }
      else ui.newPatient[k] = line(value, k === "phone" ? 24 : 100);
      touched = ["patients"];
    }
    else if (controlId === "/patient/dob") {
      const p = openPatient();
      if (!p) throw new Error("Open a patient first");
      if (value !== "" && !isDate(value)) throw new Error("Pick a valid date of birth");
      p.dob = String(value); touched = ["patients"];
    }
    else if (controlId === "/patient/name" || controlId === "/patient/phone" || controlId === "/patient/notes" || controlId === "/patient/email" || controlId === "/patient/allergies" || controlId === "/patient/emergency") {
      const p = openPatient();
      if (!p) throw new Error("Open a patient first");
      if (controlId === "/patient/notes") p.notes = text(value, 2000);
      else if (controlId === "/patient/email" || controlId === "/patient/allergies" || controlId === "/patient/emergency") { const k = controlId.slice(9) as "email" | "allergies" | "emergency"; p[k] = line(value, k === "allergies" ? 200 : 120); }
      else if (controlId === "/patient/name") { const n = line(value, 100); if (!n) throw new Error("A patient needs a name"); p.name = n; }
      else p.phone = line(value, 24);
      touched = controlId === "/patient/notes" || controlId === "/patient/email" || controlId === "/patient/allergies" || controlId === "/patient/emergency" ? ["patients"] : ["today", "book", "patients"];
    }
    else if (doctorField) {
      const d = openDoctor();
      if (!d) throw new Error("Add or open a doctor first");
      const k = doctorField[1]!;
      if (k === "name") { const n = line(value, 80); if (!n) throw new Error("A doctor needs a name"); d.name = n; }
      else if (k === "specialty") d.specialty = line(value, 80);
      else if (k === "room") d.room = line(value, 40);
      else if (k === "days") d.days = DAYS.filter((x) => (Array.isArray(value) ? value : []).includes(x));
      else if (k === "slot") d.slot = SLOT_MINUTES.includes(Number(value)) ? Number(value) : d.slot;
      else if (k === "start" || k === "end") {
        if (!isTime(value)) throw new Error("Pick a time");
        if (k === "start" ? minutes(value) >= minutes(d.end) : minutes(value) <= minutes(d.start)) throw new Error("Working hours must end after they start");
        d[k] = value;
      } else if (value === "" || value === "none") { d.breakStart = ""; d.breakEnd = ""; }
      else if (!isTime(value)) throw new Error("Pick a time");
      else {
        // The break is a pair: picking one side of a new break proposes an hour for the other.
        if (k === "breakStart") d.breakStart = value; else d.breakEnd = value;
        if (!d.breakStart || !d.breakEnd || minutes(d.breakEnd) <= minutes(d.breakStart)) {
          if (k === "breakStart") d.breakEnd = clock(Math.min(minutes(value) + 60, 23 * 60 + 30));
          else d.breakStart = clock(Math.max(minutes(value) - 60, 0));
        }
      }
    }
    else if (controlId === "/insightDays") { ui.insightDays = ["7", "30", "90"].includes(String(value)) ? String(value) : ui.insightDays; touched = ["insights"]; }
    else if (controlId === "/insightDoctor") { ui.insightDoctor = doctorOf(s, String(value)) ? String(value) : ""; touched = ["insights"]; }
    else if (controlId === "/newDoctor") { ui.newDoctor = line(value, 80); touched = ["setup"]; }
    else if (controlId === "/leave/from" || controlId === "/leave/to") { if (!isDate(value)) throw new Error("Pick a valid date"); ui.leave[controlId === "/leave/from" ? "from" : "to"] = value; touched = ["setup"]; }
    else if (controlId === "/leave/note") { ui.leave.note = line(value, 120); touched = ["setup"]; }
    else if (controlId === "/clinic/tagline" || controlId === "/clinic/phone" || controlId === "/clinic/address") { const k = controlId.slice(8) as "tagline" | "phone" | "address"; s.clinic![k] = line(value, k === "address" ? 160 : k === "phone" ? 24 : 100); }
    else if (controlId === "/clinic/name") { s.clinic!.name = line(value, 80) || "Our Clinic"; }
    else if (controlId === "/clinic/timezone") {
      const z = line(value, 64);
      if (z && !zoneOk(z)) throw new Error("That is not a time zone name. Try Asia/Kolkata or Europe/London");
      s.clinic!.timezone = z;
    }
    else throw new Error(`Unknown Clinic Desk field: ${controlId}`);
  } else if (action === "prev_day" || action === "next_day" || action === "go_today") {
    ui.date = action === "go_today" ? "" : addDays(effective(ui.date, s, nowDate), action === "next_day" ? 1 : -1);
    touched = ["today"];
  } else if (action === "save_clinic") touched = ["setup"];
  else if (action === "pick_slot") {
    const doctor = bookingDoctor();
    if (!doctor || !isTime(payload.time) || !freeSlots(s, doctor, bookDay(s, nowDate), nowDate, draft.rescheduleId).includes(payload.time)) throw new Error("That time is no longer free. Pick another slot.");
    draft.doctorId = doctor.id; draft.date = bookDay(s, nowDate); draft.time = payload.time;
    touched = ["book"];
  } else if (action === "next_available") {
    const doctor = bookingDoctor();
    if (!doctor) throw new Error("Add a doctor in Setup first");
    const from = draft.date || today(s, nowDate);
    for (let i = 0; i <= MAX_DAYS_AHEAD; i++) {
      const date = addDays(from, i), first = freeSlots(s, doctor, date, nowDate, draft.rescheduleId)[0];
      if (first) { draft.doctorId = doctor.id; draft.date = date; draft.time = first; break; }
      if (i === MAX_DAYS_AHEAD) throw new Error(`${doctor.name} has no free slot in the next ${MAX_DAYS_AHEAD} days`);
    }
    touched = ["book"];
  } else if (action === "book") {
    const doctor = doctorOf(s, draft.doctorId);
    const date = bookDay(s, nowDate);
    if (!doctor?.active) throw new Error("Choose a doctor");
    if (!draft.time) throw new Error("Pick a time slot first");
    // Checked again here: the slot list on screen may be older than the records.
    if (!freeSlots(s, doctor, date, nowDate, draft.rescheduleId).includes(draft.time)) throw new Error("That time is no longer free. Pick another slot.");
    const moving = s.appts!.find((a) => a.id === draft.rescheduleId);
    if (moving) {
      Object.assign(moving, { doctorId: doctor.id, date, time: draft.time, minutes: doctor.slot, status: "booked", updated: now });
    } else {
      if (s.appts!.length >= MAX_APPTS) throw new Error(`Clinic Desk keeps up to ${MAX_APPTS} appointments`);
      const patient = patientFor(draft.name, draft.phone);
      s.appts!.push({ id: nextId(s, "apt"), doctorId: doctor.id, patientId: patient.id, date, time: draft.time, minutes: doctor.slot, reason: draft.reason, kind: draft.kind, status: "booked", created: now, updated: now });
      // Booked from the waiting list or by hand, this patient no longer waits.
      s.waitlist = s.waitlist!.filter((w) => w.patientId !== patient.id);
    }
    ui.draft = { ...blankDraft(), doctorId: doctor.id, date: draft.date };
    ui.date = date; ui.view = "list"; go(ui, "schedule", "appts");
    focusSurface = "today";
  } else if (action === "prepare_booking") {
    // The assistant only fills the Book form; a person still presses Book, so nothing is held until they do.
    const p = value as Record<string, unknown>;
    const doctor = doctorOf(s, String(p.doctorId ?? ""));
    if (!doctor?.active) throw new Error("Unknown or retired doctor; read the clinic context for doctor ids");
    if (!isDate(p.date) || !isTime(p.time)) throw new Error("Give the date as YYYY-MM-DD and the time as HH:MM");
    if (!freeSlots(s, doctor, p.date, nowDate).includes(p.time)) throw new Error("That time is not free; find free slots first");
    if (!line(p.name, 100)) throw new Error("A patient name is needed");
    ui.draft = { doctorId: doctor.id, date: p.date, time: p.time, name: line(p.name, 100), phone: line(p.phone, 24), reason: line(p.reason, 160), kind: "Consultation", rescheduleId: "" };
    focusSurface = "book"; touched = ["book"];
    return { updates: view(s, nowDate, touched), focusSurface, prepared: true, note: "The Book form is filled in. A person must review it and press Book." };
  } else if (action === "set_status") {
    const a = s.appts!.find((x) => x.id === payloadId);
    const target = payload.status as Status;
    if (!a) throw new Error("That appointment no longer exists");
    if (!NEXT[a.status].includes(target)) throw new Error(`A ${STATUS_LABEL[a.status].toLowerCase()} appointment cannot become ${STATUS_LABEL[target]?.toLowerCase() ?? "that"}`);
    // Reopening gives the slot back to this patient, so it must still be free.
    if (!HOLDING.includes(a.status) && HOLDING.includes(target) && holds(doctorOf(s, a.doctorId)!, a.date, a.time, a.minutes, a.id)) throw new Error("Someone else now holds that slot. Reschedule instead.");
    a.status = target; a.updated = now;
    touched = ["today", "book", "patients", "doctors", "insights"];
  } else if (action === "reschedule") {
    const a = s.appts!.find((x) => x.id === payloadId);
    if (!a || a.status !== "booked") throw new Error("Only a booked appointment can be rescheduled");
    ui.draft = { ...blankDraft(), doctorId: doctorOf(s, a.doctorId)?.active ? a.doctorId : "", date: a.date >= today(s, nowDate) ? a.date : "", rescheduleId: a.id };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "cancel_reschedule") {
    ui.draft = { ...blankDraft(), doctorId: draft.doctorId, date: draft.date };
    touched = ["book"];
  } else if (action === "open_patient") {
    if (!patientOf(s, payloadId)) throw new Error("That patient no longer exists");
    ui.openPatientId = payloadId; ui.confirmDelete = false; go(ui, "patient", "details");
    focusSurface = "patients"; touched = ["patients"];
  } else if (action === "book_for_patient") {
    const p = openPatient();
    if (!p) throw new Error("Open a patient first");
    ui.draft = { ...blankDraft(), doctorId: draft.doctorId, date: draft.date, name: p.name, phone: p.phone };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "ask_delete_patient") { ui.confirmDelete = Boolean(openPatient()); touched = ["patients"]; }
  else if (action === "cancel_delete_patient") { ui.confirmDelete = false; touched = ["patients"]; }
  else if (action === "delete_patient") {
    const p = openPatient();
    if (!p) throw new Error("Open a patient first");
    const live = upcoming(s, nowDate);
    if (s.appts!.some((a) => a.patientId === p.id && live(a))) throw new Error("Cancel this patient's upcoming appointments before deleting their record");
    s.patients = s.patients!.filter((x) => x.id !== p.id);
    s.appts = s.appts!.filter((a) => a.patientId !== p.id);
    ui.openPatientId = ""; ui.confirmDelete = false;
  } else if (action === "add_doctor") {
    if (!ui.newDoctor) throw new Error("Type the doctor's name first");
    if (s.doctors!.length >= MAX_DOCTORS) throw new Error(`Clinic Desk keeps up to ${MAX_DOCTORS} doctors`);
    const d: Doctor = { id: nextId(s, "doc"), name: ui.newDoctor, specialty: "", days: PRESETS["mon-sat"]!, start: "09:00", end: "17:00", slot: 15, breakStart: "13:00", breakEnd: "14:00", active: true, room: "" };
    s.doctors!.push(d);
    ui.openDoctorId = d.id; ui.newDoctor = ""; go(ui, "setup", "doctors");
  } else if (action === "open_doctor") {
    if (!doctorOf(s, payloadId)) throw new Error("That doctor no longer exists");
    ui.openDoctorId = payloadId; go(ui, (value as { to?: unknown })?.to === "doctors" ? "doctor" : "setup", (value as { to?: unknown })?.to === "doctors" ? "week" : "doctors");
    touched = ["setup", "doctors"];
  } else if (action === "setup_doctors") {
    // From a doctor's profile or the welcome card: Setup opens on its Doctors tab, on that doctor when one is chosen.
    if (payloadId && doctorOf(s, payloadId)) ui.openDoctorId = payloadId;
    go(ui, "setup", "doctors"); focusSurface = "setup"; touched = ["setup"];
  } else if (action === "book_with_doctor") {
    const d = openDoctor();
    if (!d?.active) throw new Error("Restore this doctor in Setup before booking with them");
    ui.draft = { ...blankDraft(), doctorId: d.id, date: draft.date };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "book_patient") {
    const p = patientOf(s, payloadId);
    if (!p) throw new Error("That patient no longer exists");
    ui.draft = { ...blankDraft(), doctorId: draft.doctorId, date: draft.date, name: p.name, phone: p.phone };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "waitlist_offer") {
    const q = (value ?? {}) as { id?: unknown; doctorId?: unknown; date?: unknown; time?: unknown };
    const w = s.waitlist!.find((x) => x.id === q.id), p = w && patientOf(s, w.patientId), doctor = doctorOf(s, String(q.doctorId ?? ""));
    if (!w || !p || !doctor?.active || !isDate(q.date) || !isTime(q.time) || !freeSlots(s, doctor, q.date, nowDate).includes(q.time)) throw new Error("That slot is no longer free. Open the waiting list to pick another.");
    ui.draft = { ...blankDraft(), doctorId: doctor.id, date: q.date, time: q.time, name: p.name, phone: p.phone, reason: w.note };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "toggle_doctor") {
    const d = openDoctor();
    if (!d) throw new Error("Open a doctor first");
    const live = upcoming(s, nowDate);
    if (d.active && s.appts!.some((a) => a.doctorId === d.id && live(a))) throw new Error(`${d.name} still has upcoming appointments. Reschedule or cancel them first.`);
    d.active = !d.active;
  } else if (action === "add_leave") {
    const d = openDoctor();
    if (!d) throw new Error("Open a doctor first");
    const from = ui.leave.from || ui.leave.to, to = ui.leave.to || ui.leave.from;
    if (!from) throw new Error("Pick the first day away");
    if (to < from) throw new Error("The last day away is before the first");
    if (s.leave!.length >= MAX_LEAVE) throw new Error(`Clinic Desk keeps up to ${MAX_LEAVE} leave periods; remove old ones`);
    const live = upcoming(s, nowDate);
    const clash = s.appts!.filter((a) => a.doctorId === d.id && a.date >= from && a.date <= to && live(a)).length;
    if (clash) throw new Error(`${plural(clash, "appointment")} fall in those days. Reschedule or cancel them first.`);
    s.leave!.push({ id: nextId(s, "leave"), doctorId: d.id, from, to, note: ui.leave.note });
    ui.leave = { from: "", to: "", note: "" };
  } else if (action === "remove_leave") {
    s.leave = s.leave!.filter((l) => l.id !== payloadId);
  } else if (action === "open_day") {
    if (!isDate((value as { date?: unknown })?.date)) throw new Error("Pick a valid date");
    ui.date = (value as { date: string }).date; ui.view = "list"; go(ui, "schedule", "appts"); focusSurface = "today"; touched = ["today"];
  } else if (action === "pick_day") {
    if (!isDate((value as { date?: unknown })?.date)) throw new Error("Pick a valid date");
    draft.date = (value as { date: string }).date; draft.time = ""; touched = ["book"];
  } else if (action === "quick_book") {
    const q = (value ?? {}) as { doctorId?: unknown; date?: unknown; time?: unknown };
    const doctor = doctorOf(s, String(q.doctorId ?? ""));
    if (!doctor?.active || !isDate(q.date) || !isTime(q.time) || !freeSlots(s, doctor, q.date, nowDate).includes(q.time)) throw new Error("That time is no longer free. Pick another slot.");
    ui.draft = { ...blankDraft(), doctorId: doctor.id, date: q.date, time: q.time };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "walk_in") {
    // The soonest free slot today across the doctors in view; the desk still confirms the patient on Book.
    const w = wall(nowDate, s.clinic!.timezone);
    const hits = s.doctors!.filter((d) => d.active && (!ui.filter || d.id === ui.filter)).map((d) => ({ d, t: freeSlots(s, d, w.date, nowDate)[0] })).filter((x) => x.t).sort((a, b) => a.t!.localeCompare(b.t!));
    if (!hits[0]) throw new Error("No free slot is left today. Use Book to pick another day.");
    ui.draft = { ...blankDraft(), doctorId: hits[0].d.id, date: w.date, time: hits[0].t!, reason: "Walk-in" };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "add_waitlist") {
    if (s.waitlist!.length >= MAX_WAIT) throw new Error(`Clinic Desk keeps up to ${MAX_WAIT} waiting-list entries`);
    const patient = patientFor(draft.name, draft.phone);
    if (s.waitlist!.some((x) => x.patientId === patient.id)) throw new Error(`${patient.name} is already on the waiting list`);
    s.waitlist!.push({ id: nextId(s, "wait"), patientId: patient.id, doctorId: doctorOf(s, draft.doctorId)?.active ? draft.doctorId : "", note: draft.reason, created: now });
    ui.draft = { ...blankDraft(), doctorId: draft.doctorId, date: draft.date }; go(ui, "schedule", "waiting");
    focusSurface = "today"; touched = ["today", "book", "patients"];
  } else if (action === "waitlist_book") {
    const w = s.waitlist!.find((x) => x.id === payloadId), p = w && patientOf(s, w.patientId);
    if (!w || !p) throw new Error("That waiting-list entry no longer exists");
    ui.draft = { ...blankDraft(), doctorId: doctorOf(s, w.doctorId)?.active ? w.doctorId : "", name: p.name, phone: p.phone, reason: w.note };
    focusSurface = "book"; touched = ["book"];
  } else if (action === "waitlist_remove") {
    s.waitlist = s.waitlist!.filter((x) => x.id !== payloadId); touched = ["today"];
  } else if (action === "add_patient") {
    const np = ui.newPatient, before = s.patients!.length;
    const patient = patientFor(np.name, np.phone, np.dob);
    ui.openPatientId = patient.id; ui.confirmDelete = false; ui.newPatient = { name: "", phone: "", dob: "" };
    if (s.patients!.length === before) touched = ["patients"];
  } else if (action === "close_patient") { ui.openPatientId = ""; ui.confirmDelete = false; touched = ["patients"]; }
  else if (action === "days_preset") {
    const d = openDoctor(), days = PRESETS[String((value as { preset?: unknown })?.preset)];
    if (!d || !days) throw new Error("Open a doctor and choose a preset");
    d.days = days;
  } else {
    throw new Error(`Unknown Clinic Desk action: ${action}`);
  }
  return { updates: view(s, nowDate, touched), ...(focusSurface ? { focusSurface } : {}) };
}

// --- assistant exports (read-only) ---------------------------------------------------------

/** What the assistant may read: schedule, free slots and risk, with patients by first name and initial. No phone numbers or notes leave the app. */
export async function handleQuery(name: string, params: unknown, context: Context) {
  const s = (context.state = normalize(context.state));
  const nowDate = context.now?.() ?? new Date();
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const open = () => s.doctors!.filter((d) => d.active);
  if (name === "get_clinic_context") {
    const date = isDate(p.date) ? p.date : today(s, nowDate), model = riskModel(s);
    return {
      expectedRevision: context.appRevision, clinic: s.clinic!.name, timezone: s.clinic!.timezone || hostZone(), today: today(s, nowDate), date,
      doctors: open().map((d) => ({ id: d.id, name: d.name, specialty: d.specialty, days: d.days, hours: `${d.start}-${d.end}`, visitMinutes: d.slot, freeToday: freeSlots(s, d, date, nowDate).length })),
      appointments: s.appts!.filter((a) => a.date === date).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 200).map((a) => {
        const r = riskOf(model, a);
        return { time: a.time, doctor: doctorOf(s, a.doctorId)!.name, patient: shortName(patientOf(s, a.patientId)!.name), reason: a.reason, status: STATUS_LABEL[a.status], ...(r ? { noShowRisk: Math.round(r.p * 100), riskReasons: r.reasons } : {}) };
      }),
      attendanceModel: model.history >= MIN_HISTORY ? "learned from this clinic's completed and missed visits" : `needs ${MIN_HISTORY} resolved visits; has ${model.history}`,
      week: weekOutlook(s, date < today(s, nowDate) ? today(s, nowDate) : date, nowDate, model).map((d) => ({ date: d.date, booked: d.booked, capacity: d.capacity, outlook: d.label })),
    };
  }
  if (name === "find_free_slots") {
    const from = isDate(p.from) ? p.from : today(s, nowDate), days = Math.min(14, Math.max(1, Math.trunc(Number(p.days) || 7)));
    const chosen = typeof p.doctorId === "string" && p.doctorId ? open().filter((d) => d.id === p.doctorId) : open();
    if (!chosen.length) throw new Error("Unknown or retired doctor; read the clinic context for doctor ids");
    return { doctors: chosen.map((d) => ({ id: d.id, name: d.name, days: Array.from({ length: days }, (_, i) => addDays(from, i)).map((date) => ({ date, slots: freeSlots(s, d, date, nowDate).slice(0, 24) })).filter((x) => x.slots.length) })) };
  }
  if (name === "get_attention_list") {
    const model = riskModel(s), w = today(s, nowDate);
    return { expectedRevision: context.appRevision, today: w, note: "Rule-based prompts over this clinic's records. Each is a call, an offer or a rebooking for a person to make; none is medical advice.", items: attention(s, nowDate, model, w).map((a) => ({ kind: a.kind, urgency: a.tone, what: a.title, why: a.body })) };
  }
  if (name === "get_insights") {
    const w = today(s, nowDate), days = [7, 30, 90].includes(Number(p.days)) ? Number(p.days) : 30;
    const r = report(s, addDays(w, -(days - 1)), w, w, typeof p.doctorId === "string" ? p.doctorId : "");
    return {
      period: `${r.from} to ${r.to}`, appointments: r.total, completed: r.completed, noShows: r.noShow, cancelled: r.cancelled, noShowRate: Math.round(r.noShowRate * 100), slotsUsedPercent: Math.round(r.utilisation * 100), averageDaysBookedAhead: Math.round(r.avgLead * 10) / 10,
      enoughHistory: r.enoughHistory, byDoctor: r.doctors.map((d) => ({ name: d.name, visits: d.total, noShows: d.noShow, slotsUsedPercent: Math.round(d.utilisation * 100) })),
      busiestHours: r.hours.filter((h) => h.count).sort((a, b) => b.count - a.count).slice(0, 3).map((h) => h.label), noShowByWeekday: r.weekdays.map((d) => ({ day: d.label, percent: Math.round(d.noShowRate * 100) })),
    };
  }
  throw new Error(`Unknown Clinic Desk query: ${name}`);
}

// --- derived views -----------------------------------------------------------------------

/** Every surface (or only the named ones) from the canonical records. */
export function view(input: State, nowDate = new Date(), only: readonly Surface[] = SURFACES): Update[] {
  const s = normalize(input);
  const builders: Record<Surface, () => Update> = { today: () => todaySurface(s, nowDate), book: () => bookSurface(s, nowDate), patients: () => patientsSurface(s, nowDate), doctors: () => doctorsSurface(s, nowDate), insights: () => insightsSurface(s, nowDate), setup: () => setupSurface(s) };
  return SURFACES.filter((x) => only.includes(x)).map((x) => builders[x]());
}

const row = (id: string, children: string[], extra: Record<string, unknown> = {}): Node => ({ id, type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm", align: "end", ...extra }, children });
const btn = (id: string, label: string, action: string, style = "secondary", payload?: unknown, extra: Record<string, unknown> = {}): Node => ({ id, type: "button", props: { label, action, style, ...(payload === undefined ? {} : { payload }), ...extra } });

/** Keeps only nodes the root can reach, so a branch the state does not show leaves no orphan behind. */
function reachable(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n])), seen = new Set<string>(), walk = (id: string) => {
    if (seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    const c = byId.get(id)!.children;
    if (Array.isArray(c)) c.forEach(walk); else if (c) walk(c.template);
  };
  walk("root");
  return nodes.filter((n) => seen.has(n.id));
}

const csvCell = (v: string) => {
  const safe = /^[=@\t\r]|^[+-](?!\d)/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const shortName = (n: string) => { const w = n.split(" ").filter(Boolean); return w.length > 1 ? `${w[0]} ${w.at(-1)![0]}.` : n; };
const weekOutlook = (s: State, from: string, now: Date, model: ReturnType<typeof riskModel>): Outlook[] =>
  outlook(s, from, 7, (d) => s.doctors!.filter((x) => x.active).reduce((n, x) => n + freeSlots(s, x, d, now).length, 0), addDays, model);
/** The earliest open slot across doctors within the next two weeks, in words. */
function nextFree(s: State, now: Date) {
  const start = today(s, now);
  for (let i = 0; i < 14; i++) {
    const date = addDays(start, i);
    const hits = s.doctors!.filter((d) => d.active).map((d) => ({ d, t: freeSlots(s, d, date, now)[0] })).filter((x) => x.t).sort((a, b) => a.t!.localeCompare(b.t!));
    if (hits[0]) return `${hits[0].d.name}, ${shortDate(date)} at ${spokenTime(hits[0].t!)}`;
  }
  return "";
}

const assistantRequest = (s: State, date: string) => `Help me with the front desk at ${s.clinic!.name} for ${date}. Read the clinic context first. I may ask about the day's schedule, free slots, or who is likely to miss their visit. To book, find a free slot and prepare the booking: that only fills in the Book form for me to review and confirm. Never invent patients, times or doctors, and do not state medical advice.`;
export const assistantWorkflow = {
  title: "Front desk assistant", brief: "Your request", boundary: "The assistant can read the schedule and fill in the Book form. Nothing is booked until you press Book.",
  saved: "The Book form is filled in. Check the details, then press Book.",
  steps: [
    { id: "day", label: "Summarise the day", mode: "send", message: "Read the clinic context and summarise the day: who is waiting, who is flagged as likely to miss, and where the gaps are. Use only what the context returned." },
    { id: "slots", label: "Find a slot", mode: "edit", message: "Find the earliest free slot for: " },
    { id: "book", label: "Prepare a booking", mode: "edit", message: "Prepare a booking for this patient (name, phone, reason and preferred doctor or day): " },
  ],
  review: { label: "Review the booking", surface: "book", tool: "prepare_booking" },
};

/** A phone number shown on screen never breaks across lines. */
const phoneText = (v: string) => v.replace(/ /g, "\u00a0");
const kindLine = (a: Appt) => [a.kind !== "Consultation" ? a.kind : "", a.reason].filter(Boolean).join(" · ");
const dayTag = (date: string) => `${dayName(date)} ${Number(date.slice(8))}`;
const surname = (n: string) => n.split(" ").filter(Boolean).at(-1) ?? n;
const age = (dob: string, on: string) => { const y = Number(on.slice(0, 4)) - Number(dob.slice(0, 4)) - (on.slice(5) < dob.slice(5) ? 1 : 0); return y >= 0 ? y : 0; };
const doctorOptions = (s: State) => s.doctors!.filter((d) => d.active).map((d) => ({ label: d.name, value: d.id }));

const caption = (id: string, content: string): Node => ({ id, type: "text", props: { content, variant: "caption" } });
const chips = (id: string, each: string, template: string): Node => ({ id, type: "stack", props: { direction: "horizontal", wrap: true, gap: "xs" }, children: { each, template } });
const rows = (id: string, each: string, template: string, extra: Record<string, unknown> = {}): Node => ({ id, type: "grid", props: { columns: 1, gap: "xs", ...extra }, children: { each, template } });
const panel = (id: string, title: string, children: string[], description?: string): Node => ({ id, type: "section", props: { title, ...(description ? { description } : {}) }, children });
const counted = (label: string, n: number) => (n ? `${label} (${n})` : label);

/** Schedule: the day at a glance, then one tab per job (the queue, follow-ups, the waiting list, reminders, the week ahead). */
function todaySurface(s: State, nowDate: Date): Update {
  const ui = s.ui!, date = effective(ui.date, s, nowDate), now0 = today(s, nowDate);
  const doctors = s.doctors!, active = doctors.filter((d) => d.active), inView = (id: string) => !ui.filter || id === ui.filter;
  const shown = s.appts!.filter((a) => a.date === date && inView(a.doctorId)).sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const count = (st: Status) => shown.filter((a) => a.status === st).length;
  const free = active.filter((d) => inView(d.id)).reduce((n, d) => n + freeSlots(s, d, date, nowDate).length, 0);
  const isToday = date === now0, isFuture = date >= now0;
  const when = isToday ? "Today" : date === addDays(now0, 1) ? "Tomorrow" : longDate(date);
  const live = shown.filter((a) => a.status !== "cancelled");
  const held = shown.filter((a) => HOLDING.includes(a.status)).length;
  const model = riskModel(s);
  const risks = new Map(shown.map((a) => [a.id, riskOf(model, a)]));
  const from = date < now0 ? now0 : date;
  const week = weekOutlook(s, from, nowDate, model);
  // The calendar pages on its own, so it gets the weeks around the chosen day, not only the visible one.
  const rangeFrom = addDays(`${date.slice(0, 7)}-01`, -42), rangeTo = addDays(`${date.slice(0, 7)}-01`, 75);
  const alerts = attention(s, nowDate, model, now0);
  const events = s.appts!.filter((a) => a.date >= rangeFrom && a.date <= rangeTo && a.status !== "cancelled" && inView(a.doctorId)).slice(0, 600)
    .map((a) => ({ title: `${shortName(patientOf(s, a.patientId)!.name)} · ${surname(doctorOf(s, a.doctorId)!.name)}`, date: a.date, start: a.time, end: clock(minutes(a.time) + a.minutes), note: kindLine(a), tone: STATUS_TONE[a.status] }));
  const quick = active.filter((d) => inView(d.id)).flatMap((d) => {
    const out: { doctorId: string; date: string; time: string; label: string }[] = [];
    for (let i = 0; i < 14 && out.length < 2; i++) {
      const day = addDays(now0, i);
      for (const t of freeSlots(s, d, day, nowDate)) {
        out.push({ doctorId: d.id, date: day, time: t, label: `${i === 0 ? "Today" : i === 1 ? "Tomorrow" : shortDate(day)} ${spokenTime(t)} · ${d.name}` });
        if (out.length >= 2) break;
      }
    }
    return out;
  }).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)).slice(0, 8);
  const tomorrow = addDays(now0, 1);
  const remind = s.appts!.filter((a) => a.date === tomorrow && a.status === "booked").sort((a, b) => a.time.localeCompare(b.time));
  const message = (a: Appt) => `Hello ${patientOf(s, a.patientId)!.name.split(" ")[0]}, this is ${s.clinic!.name}. A reminder of your appointment with ${doctorOf(s, a.doctorId)!.name} on ${longDate(a.date)} at ${spokenTime(a.time)}. Please call us${s.clinic!.phone ? ` on ${s.clinic!.phone}` : ""} if you need to change it.`;
  const waiting = s.waitlist!.map((w) => ({ w, p: patientOf(s, w.patientId)! }));

  const nodes: Node[] = [{ id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: [] }];
  const root = nodes[0]!;
  if (!doctors.length) {
    root.children = ["setup-alert"];
    nodes.push({ id: "setup-alert", type: "card", props: { title: "Welcome to Clinic Desk", body: "Add your first doctor and their weekly hours. Bookings, the day's schedule and the waiting list appear as soon as one is set up.", tone: "info" }, children: ["setup-go"] }, btn("setup-go", "Set up doctors", "setup_doctors", "primary"));
  } else {
    // Week and month are separate nodes: a calendar keeps its own view once shown, so one node could not switch.
    const queue = ui.view !== "list" ? [`cal-${ui.view}`] : shown.length ? ["list"] : ["empty"];
    root.children = ["head", "bar", "filters", "stats", "tabs"];
    nodes.push(
      { id: "head", type: "stack", props: { gap: "xs" }, children: ["title", "subtitle"] },
      { id: "title", type: "text", props: { content: "{/title}", variant: "heading" } },
      caption("subtitle", "{/subtitle}"),
      row("bar", ["prev", "date", "next", "now", "walkin", "book", "ask", "export"]),
      btn("prev", "Previous day", "prev_day"), { id: "date", type: "date", props: { label: "Day", bind: "/date", maxWidth: "sm" } }, btn("next", "Next day", "next_day"),
      btn("now", "Today", "go_today", "secondary", undefined, { visibleIf: "{/notToday}" }),
      btn("walkin", "Walk-in", "walk_in", "primary", undefined, { visibleIf: "{/isToday}" }),
      btn("book", "New booking", "view.open", isToday ? "secondary" : "primary", { surface: "book" }),
      btn("ask", "Ask assistant", "assistant.compose", "secondary", { path: "assistantRequest", workflowPath: "assistantWorkflow" }),
      btn("export", "Export CSV", "file.save", "link", { name: "/export/name", text: "/export/csv" }, { visibleIf: "{/hasAppts}" }),
      row("filters", ["filter", "view"]),
      { id: "filter", type: "select", props: { label: "Doctor", bind: "/filter", options: "{/doctorFilterOptions}" } },
      { id: "view", type: "select", props: { label: "Show", bind: "/view", options: [{ label: "Day list", value: "list" }, { label: "Week", value: "week" }, { label: "Month", value: "month" }] } },
      { id: "stats", type: "grid", props: { columns: 5, minItemWidth: "sm", gap: "sm" }, children: ["st-booked", "st-in", "st-done", "st-miss", "st-free"] },
      { id: "st-booked", type: "stat", props: { label: "To arrive", value: "{/stats/booked}", tone: "info" } },
      { id: "st-in", type: "stat", props: { label: "Checked in", value: "{/stats/checkedIn}", tone: "warning" } },
      { id: "st-done", type: "stat", props: { label: "Completed", value: "{/stats/completed}", tone: "success" } },
      { id: "st-miss", type: "stat", props: { label: "No-shows", value: "{/stats/missed}", tone: count("no_show") ? "danger" : "neutral" } },
      { id: "st-free", type: "stat", props: { label: "Free slots", value: "{/stats/free}" } },
      { id: "tabs", type: "tabs", props: { ...(activeTab(ui, "schedule") ? { active: activeTab(ui, "schedule") } : {}) }, children: ["appts", "attn", "waiting", "remind", "ahead"] },
      panel("appts", "{/tabTitles/appts}", queue, "{/insight}"),
      { id: "cal-week", type: "calendar", props: { events: "{/events}", view: "week", date: "{/date}" } },
      { id: "cal-month", type: "calendar", props: { events: "{/events}", view: "month", date: "{/date}" } },
      rows("list", "/appts", "appt"),
      { id: "appt", type: "card", props: { title: "{title}", subtitle: "{subtitle}", body: "{body}", badge: "{status}", tone: "{tone}", layout: "row", action: "open_patient", payload: { id: "{patientId}" }, actionLabel: "Open patient record" }, children: ["a-in", "a-done", "a-noshow", "a-resched", "a-cancel", "a-reopen"] },
      btn("a-in", "Check in", "set_status", "primary", { id: "{id}", status: "checked_in" }, { visibleIf: "{canCheckIn}" }),
      btn("a-done", "Complete", "set_status", "primary", { id: "{id}", status: "completed" }, { visibleIf: "{canComplete}" }),
      btn("a-noshow", "No-show", "set_status", "secondary", { id: "{id}", status: "no_show" }, { visibleIf: "{canNoShow}" }),
      btn("a-resched", "Reschedule", "reschedule", "secondary", { id: "{id}" }, { visibleIf: "{canReschedule}" }),
      btn("a-cancel", "Cancel", "set_status", "danger", { id: "{id}", status: "cancelled" }, { visibleIf: "{canCancel}" }),
      btn("a-reopen", "{reopenLabel}", "set_status", "secondary", { id: "{id}", status: "{reopenTo}" }, { visibleIf: "{canReopen}" }),
      { id: "empty", type: "card", props: { title: `Nothing booked ${when.toLowerCase()}`, body: "{/emptyText}", tone: "neutral" }, children: ["empty-bar"] },
      row("empty-bar", ["empty-book", "empty-walk"]),
      btn("empty-book", "Book an appointment", "view.open", "primary", { surface: "book" }, { visibleIf: "{/canBook}" }),
      btn("empty-walk", "Walk-in", "walk_in", "secondary", undefined, { visibleIf: "{/isToday}" }),
      panel("attn", "{/tabTitles/attn}", [alerts.length ? "attn-grid" : "attn-none"], "Prompts from this clinic's own records. Each is a call, an offer or a rebooking that a person makes."),
      caption("attn-none", "Nothing needs a call or an offer right now."),
      { id: "attn-grid", type: "grid", props: { columns: 2, minItemWidth: "md", gap: "sm" }, children: { each: "/attention", template: "attn-card" } },
      { id: "attn-card", type: "card", props: { title: "{title}", body: "{body}", tone: "{tone}" }, children: ["attn-open", "attn-offer", "attn-book", "attn-day"] },
      btn("attn-open", "{label}", "open_patient", "secondary", { id: "{pid}" }, { visibleIf: "{isCall}" }),
      btn("attn-offer", "{label}", "waitlist_offer", "primary", { id: "{id}", doctorId: "{doctorId}", date: "{date}", time: "{time}" }, { visibleIf: "{isOffer}" }),
      btn("attn-book", "{label}", "book_patient", "primary", { id: "{pid}" }, { visibleIf: "{isBook}" }),
      btn("attn-day", "{label}", "open_day", "secondary", { date: "{date}" }, { visibleIf: "{isDay}" }),
      panel("waiting", "{/tabTitles/waiting}", [waiting.length ? "wait-list" : "wait-none"], "{/waitText}"),
      caption("wait-none", "When no time suits a patient, add them to the waiting list from Book."),
      rows("wait-list", "/waitlist", "w-card"),
      { id: "w-card", type: "card", props: { title: "{name}", subtitle: "{who}", body: "{note}", layout: "row" }, children: ["w-book", "w-drop"] },
      btn("w-book", "Find a slot", "waitlist_book", "primary", { id: "{id}" }),
      btn("w-drop", "Remove", "waitlist_remove", "link", { id: "{id}" }),
      panel("remind", "{/tabTitles/remind}", remind.length ? ["remind-list", "remind-bar"] : ["remind-none"], "{/remindText}"),
      caption("remind-none", "Nobody is booked for tomorrow yet."),
      { id: "remind-list", type: "list", props: { items: "{/remindLines}", pageSize: 10 } },
      row("remind-bar", ["remind-export"]),
      btn("remind-export", "Export reminder messages", "file.save", "secondary", { name: "/remind/name", text: "/remind/csv" }),
      panel("ahead", "Week ahead", ["week", ...(isFuture && quick.length ? ["quick-t", "quick"] : [])], "Choose a day to open its list."),
      { id: "week", type: "grid", props: { columns: 7, minItemWidth: "sm", gap: "sm" }, children: { each: "/week", template: "week-day" } },
      { id: "week-day", type: "card", props: { title: "{label}", subtitle: "{summary}", badge: "{word}", tone: "{tone}", action: "open_day", payload: { date: "{date}" }, actionLabel: "Open day" } },
      { id: "quick-t", type: "text", props: { content: "Next open slots", variant: "subheading" } },
      chips("quick", "/quick", "q-slot"),
      btn("q-slot", "{label}", "quick_book", "secondary", { doctorId: "{doctorId}", date: "{date}", time: "{time}" }),
    );
  }

  const doctorStats = active.filter((d) => live.some((a) => a.doctorId === d.id)).map((d) => {
    const mine = live.filter((a) => a.doctorId === d.id);
    return { name: d.name, seen: mine.length, first: mine[0]!.time, last: mine.at(-1)!.time };
  });
  const asShow = (a: Appt) => ({ time: a.time, who: shortName(patientOf(s, a.patientId)!.name), doctor: doctorOf(s, a.doctorId)!.name, reason: a.reason, status: STATUS_LABEL[a.status], note: riskNote(risks.get(a.id)) });
  const waitingAppts = live.filter((a) => a.status === "booked");
  const brief = programme({
    clinic: s.clinic!.name, when, counts: { waiting: count("booked"), checkedIn: count("checked_in"), completed: count("completed"), free, missed: count("no_show") },
    appts: live.map(asShow), doctors: doctorStats,
    risky: waitingAppts.filter((a) => risks.get(a.id)?.level === "high").map(asShow),
    expectedMisses: waitingAppts.reduce((n, a) => n + (risks.get(a.id)?.p ?? 0), 0),
    week: week.map((d) => ({ label: longDate(d.date), load: d.load, word: d.label })), nextFree: nextFree(s, nowDate),
  });
  const expected = waitingAppts.reduce((n, a) => n + (risks.get(a.id)?.p ?? 0), 0);
  const insight = model.history < MIN_HISTORY
    ? `Attendance estimates appear after ${MIN_HISTORY} completed or missed visits (${model.history} so far).`
    : waitingAppts.length ? `About ${Math.round(expected)} of ${plural(waitingAppts.length, "patient")} still to arrive may miss, judged from this clinic's history. Flagged rows are worth a reminder call.` : "";
  const capacity = held + free, pct = capacity ? Math.round((held / capacity) * 100) : 0;
  const onDuty = active.filter((d) => inView(d.id) && freeSlots(s, d, date, nowDate).length + shown.filter((a) => a.doctorId === d.id).length > 0).length;
  const data = {
    date, view: ui.view, notToday: !isToday, isToday, canBook: isFuture && free > 0,
    title: `${when}${isToday || date === addDays(now0, 1) ? ` · ${shortDate(date)}` : ""}`,
    subtitle: [s.clinic!.name, plural(live.length, "appointment"), `${plural(onDuty, "doctor")} on duty`, capacity ? `${pct}% of slots taken` : "No clinic hours"].join(" · "),
    insight,
    filter: ui.filter || "all", doctorFilterOptions: [{ label: "All doctors", value: "all" }, ...doctors.map((d) => ({ label: d.active ? d.name : `${d.name} (retired)`, value: d.id }))],
    stats: { booked: count("booked"), checkedIn: count("checked_in"), completed: count("completed"), missed: count("no_show"), free },
    tabTitles: { appts: counted(ui.view === "list" ? "Appointments" : ui.view === "week" ? "Week" : "Month", ui.view === "list" ? live.length : 0), attn: counted("Needs attention", alerts.length), waiting: counted("Waiting list", waiting.length), remind: counted("Reminders", remind.length) },
    events,
    attention: alerts.map((a) => { const pl = (a.payload ?? {}) as { id?: string; doctorId?: string; date?: string; time?: string }; return { id: pl.id ?? a.id, pid: pl.id ?? "", doctorId: pl.doctorId ?? "", date: pl.date ?? "", time: pl.time ?? "", title: a.title, body: a.body, tone: a.tone, label: a.label, isCall: a.action === "open_patient", isOffer: a.action === "waitlist_offer", isBook: a.action === "book_patient", isDay: a.action === "open_day" }; }),
    appts: shown.map((a) => {
      const patient = patientOf(s, a.patientId)!, doctor = doctorOf(s, a.doctorId)!;
      return {
        id: a.id, patientId: patient.id, title: `${spokenTime(a.time)} · ${patient.name}`, subtitle: [doctor.name, doctor.room, `${a.minutes} min`, phoneText(patient.phone)].filter(Boolean).join(" · "),
        body: [patient.allergies ? `Allergies: ${patient.allergies}` : "", kindLine(a), riskNote(risks.get(a.id))].filter(Boolean).join(" · "), status: STATUS_LABEL[a.status], tone: STATUS_TONE[a.status],
        canCheckIn: a.status === "booked", canComplete: a.status === "checked_in", canNoShow: a.status === "booked",
        canReschedule: a.status === "booked", canCancel: a.status === "booked" || a.status === "checked_in",
        canReopen: a.status === "completed" || a.status === "cancelled" || a.status === "no_show",
        reopenTo: a.status === "completed" ? "checked_in" : "booked", reopenLabel: a.status === "completed" ? "Reopen" : "Restore booking",
      };
    }),
    hasAppts: shown.length > 0,
    emptyText: free ? `${plural(free, "slot")} ${isFuture ? "open" : "were open"}. Book a patient, or take a walk-in.` : isFuture ? "No doctor is available that day, or every slot is taken." : "No appointments were recorded for this day.",
    export: { name: `appointments-${date}`, csv: ["Date,Time,Doctor,Patient,Phone,Type,Reason,Status", ...shown.map((a) => [a.date, a.time, doctorOf(s, a.doctorId)!.name, patientOf(s, a.patientId)!.name, patientOf(s, a.patientId)!.phone, a.kind, a.reason, STATUS_LABEL[a.status]].map(csvCell).join(","))].join("\n") },
    quick: quick.map((q) => ({ ...q })),
    waitlist: waiting.map(({ w, p }) => ({ id: w.id, name: p.name, who: `${w.doctorId ? doctorOf(s, w.doctorId)!.name : "Any doctor"} · ${phoneText(p.phone)}`, note: w.note || "No reason given" })),
    waitText: waiting.length ? "Find a slot opens Book for them; booking clears the entry." : "",
    remindText: remind.length ? `Booked for ${longDate(tomorrow)}. The messages are written for you to send yourself.` : "",
    remindLines: remind.map((a) => `${spokenTime(a.time)} · ${patientOf(s, a.patientId)!.name} · ${patientOf(s, a.patientId)!.phone} · ${doctorOf(s, a.doctorId)!.name}`),
    remind: { name: `reminders-${tomorrow}`, csv: ["Phone,Patient,Doctor,Date,Time,Message", ...remind.map((a) => [patientOf(s, a.patientId)!.phone, patientOf(s, a.patientId)!.name, doctorOf(s, a.doctorId)!.name, a.date, a.time, message(a)].map(csvCell).join(","))].join("\n") },
    week: week.map((d) => ({ date: d.date, label: dayTag(d.date), word: d.label, tone: d.label === "Busy" ? "warning" : d.label === "Closed" ? "neutral" : d.label === "Quiet" ? "info" : "success", summary: d.capacity ? `${d.booked} of ${d.capacity} booked${d.atRisk >= 1 ? ` · ~${Math.round(d.atRisk)} may miss` : ""}` : "No clinic" })),
    assistantRequest: assistantRequest(s, date), assistantWorkflow,
    spoken: { brief },
  };
  return { surface: "today", nodes: reachable(nodes), data: replaceAll(data) };
}

/** Book: pick the doctor, day and time on the left; the patient and a summary to confirm on the right. */
function bookSurface(s: State, nowDate: Date): Update {
  const draft = s.ui!.draft, now0 = today(s, nowDate);
  const active = s.doctors!.filter((d) => d.active);
  const doctor = doctorOf(s, draft.doctorId) ?? active[0];
  const date = bookDay(s, nowDate);
  const moving = s.appts!.find((a) => a.id === draft.rescheduleId);
  const slots = doctor ? freeSlots(s, doctor, date, nowDate, draft.rescheduleId) : [];
  const picked = slots.includes(draft.time) ? draft.time : "";
  const match = !moving && draft.name && digits(draft.phone).length >= 6 ? s.patients!.find((p) => digits(p.phone) === digits(draft.phone) && p.name.toLowerCase() === draft.name.toLowerCase()) : undefined;
  const group = (from: string, to: string) => slots.filter((t) => t >= from && t < to).map((t) => ({ time: t, label: spokenTime(t), style: t === picked ? "primary" : "secondary" }));
  const parts = [{ id: "am", title: "Morning", items: group("00:00", "12:00") }, { id: "pm", title: "Afternoon", items: group("12:00", "17:00") }, { id: "eve", title: "Evening", items: group("17:00", "24:00") }].filter((g) => g.items.length);
  const stripStart = date >= now0 && date <= addDays(now0, 6) ? now0 : date < now0 ? now0 : date;
  const strip = Array.from({ length: 7 }, (_, i) => addDays(stripStart, i)).map((d) => {
    const n = doctor ? freeSlots(s, doctor, d, nowDate, draft.rescheduleId).length : 0;
    return { date: d, label: `${dayTag(d)} · ${n ? `${n} free` : "none"}`, style: d === date ? "primary" : "secondary" };
  });
  const nodes: Node[] = [{ id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: active.length ? [...(moving ? ["moving"] : []), "cols"] : ["none"] }];
  if (!active.length) nodes.push({ id: "none", type: "card", props: { title: "No doctor to book", body: "Add or restore a doctor in Setup, then come back to book.", tone: "warning" }, children: ["none-go"] }, btn("none-go", "Open Setup", "setup_doctors", "primary"));
  else nodes.push(
    ...(moving ? [
      { id: "moving", type: "card", props: { title: "Rescheduling", body: "{/movingText}", tone: "warning", layout: "row" }, children: ["moving-cancel"] },
      btn("moving-cancel", "Keep the current time", "cancel_reschedule", "secondary"),
    ] : []),
    { id: "cols", type: "split", props: { ratio: "1:1", gap: "lg" }, children: ["when", "who"] },
    { id: "when", type: "section", props: { title: "1 · Doctor and time", description: "{/slotHint}" }, children: ["doctor", "days", "when-bar", ...(parts.length ? parts.map((g) => g.id) : ["no-slots"])] },
    { id: "doctor", type: "select", props: { label: "Doctor", bind: "/draft/doctorId", options: "{/doctorOptions}" } },
    chips("days", "/strip", "day"),
    btn("day", "{label}", "pick_day", "{style}", { date: "{date}" }),
    row("when-bar", ["day-pick", "next-free"]),
    { id: "day-pick", type: "date", props: { label: "Another day", bind: "/draft/date", maxWidth: "sm" } },
    btn("next-free", "Next available", "next_available"),
    ...(parts.length ? parts.flatMap((g) => [
      { id: g.id, type: "stack", props: { gap: "xs" }, children: [`${g.id}-t`, `${g.id}-row`] },
      { id: `${g.id}-t`, type: "text", props: { content: `${g.title} · ${g.items.length} free`, variant: "subheading" } },
      chips(`${g.id}-row`, `/slots/${g.id}`, `${g.id}-slot`),
      btn(`${g.id}-slot`, "{label}", "pick_slot", "{style}", { time: "{time}" }),
    ]) : [caption("no-slots", "{/noSlots}")]),
    { id: "who", type: "section", props: { title: moving ? "2 · Confirm" : "2 · Patient", description: "{/summary}" }, children: moving ? ["confirm-card", "confirm"] : [...(s.patients!.length ? ["pick"] : []), "contact", ...(match ? ["returning"] : []), "kind", "reason", "confirm-card", "who-bar"] },
    ...(moving ? [] : [
      { id: "pick", type: "select", props: { label: "Returning patient", bind: "/draft/patientId", options: "{/patientOptions}", presentation: "dropdown" } },
      { id: "contact", type: "grid", props: { columns: 2, minItemWidth: "sm", gap: "sm" }, children: ["name", "phone"] },
      { id: "name", type: "input", props: { label: "Patient name", bind: "/draft/name", placeholder: "Full name" } },
      { id: "phone", type: "input", props: { label: "Phone", bind: "/draft/phone", placeholder: "Number the clinic can call", kind: "tel" } },
      ...(match ? [{ id: "returning", type: "alert", props: { title: "Returning patient", body: "{/returningText}", tone: "info" } }] : []),
      { id: "kind", type: "select", props: { label: "Visit type", bind: "/draft/kind", options: VISIT_TYPES } },
      { id: "reason", type: "input", props: { label: "Reason for visit", bind: "/draft/reason", placeholder: "Fever, check-up, follow-up" } },
      row("who-bar", ["confirm", "waitlist"]),
      btn("waitlist", "Add to waiting list", "add_waitlist", "secondary"),
    ]),
    { id: "confirm-card", type: "card", props: { title: "{/confirmTitle}", body: "{/confirmBody}", tone: picked ? "success" : "neutral" } },
    btn("confirm", moving ? "Confirm new time" : "Book appointment", "book", "primary"),
  );
  const data = {
    draft: { doctorId: doctor?.id ?? "", date, name: draft.name, phone: draft.phone, reason: draft.reason, kind: draft.kind, patientId: match?.id ?? "" },
    doctorOptions: doctorOptions(s),
    patientOptions: s.patients!.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500).map((p) => ({ label: `${p.name} · ${p.phone || "no phone"}`, value: p.id })),
    slotHint: doctor ? `${plural(slots.length, "free slot")} · ${doctor.slot}-minute visits · ${longDate(date)}` : "",
    strip,
    slots: { am: group("00:00", "12:00"), pm: group("12:00", "17:00"), eve: group("17:00", "24:00") },
    noSlots: `${whyNone(s, doctor, date, nowDate)} Try another day above, or use Next available.`,
    summary: picked ? "Review the details, then book." : "Pick a time first.",
    confirmTitle: picked ? `${doctor!.name} · ${shortDate(date)} · ${spokenTime(picked)}` : "No time chosen yet",
    confirmBody: picked ? [moving ? patientOf(s, moving.patientId)!.name : draft.name || "Patient name needed", draft.kind, draft.reason].filter(Boolean).join(" · ") : "Choose a day and a time slot.",
    movingText: moving ? `${patientOf(s, moving.patientId)!.name}, currently ${shortDate(moving.date)} at ${spokenTime(moving.time)}. Pick the new time, then confirm.` : "",
    returningText: match ? `${match.name} has ${plural(s.appts!.filter((a) => a.patientId === match.id && a.status === "completed").length, "past visit")} here.` : "",
  };
  return { surface: "book", nodes: reachable(nodes), data: replaceAll(data) };
}

/** Patients: the list on the left; the open record (details and visit history tabs) or a short add form on the right. */
function patientsSurface(s: State, nowDate: Date): Update {
  const ui = s.ui!, now0 = today(s, nowDate), open = patientOf(s, ui.openPatientId);
  const live = upcoming(s, nowDate);
  const visits = (id: string) => s.appts!.filter((a) => a.patientId === id);
  const history = open ? visits(open.id).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)).slice(0, 200) : [];
  const nodes: Node[] = [
    { id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: ["subtitle", "cols"] },
    caption("subtitle", "{/subtitle}"),
    { id: "cols", type: "split", props: { ratio: "1:2", gap: "lg" }, children: ["browse", open ? "detail" : "add"] },
    panel("browse", "All patients", [s.patients!.length ? "list" : "empty"]),
    caption("empty", "No patients yet. Add one here, or book an appointment and the record is created for you."),
    rows("list", "/patients", "p-card", { searchable: true, pageSize: 10 }),
    { id: "p-card", type: "card", props: { title: "{name}", subtitle: "{phone}", body: "{summary}", badge: "{badge}", tone: "{tone}", action: "open_patient", payload: { id: "{id}" }, actionLabel: "Open record" } },
    panel("add", "Add a patient", ["add-grid", "add-bar"], "Name and phone are enough. Booking also creates the record."),
    { id: "add-grid", type: "grid", props: { columns: 3, minItemWidth: "sm", gap: "sm" }, children: ["np-name", "np-phone", "np-dob"] },
    { id: "np-name", type: "input", props: { label: "Name", bind: "/newPatient/name", placeholder: "Full name" } },
    { id: "np-phone", type: "input", props: { label: "Phone", bind: "/newPatient/phone", placeholder: "Number the clinic can call", kind: "tel" } },
    { id: "np-dob", type: "date", props: { label: "Date of birth", bind: "/newPatient/dob" } },
    row("add-bar", ["np-add"]),
    btn("np-add", "Add patient", "add_patient", "primary"),
  ];
  if (open) nodes.push(
    { id: "detail", type: "section", props: { title: "{/detail/title}", description: "{/detail/summary}" }, children: ["d-facts", "d-actions", ...(ui.confirmDelete ? ["d-confirm"] : []), "d-tabs"] },
    { id: "d-facts", type: "grid", props: { columns: 4, minItemWidth: "sm", gap: "sm" }, children: ["f-att", "f-last", "f-next", "f-doc"] },
    { id: "f-att", type: "stat", props: { label: "Attendance", value: "{/facts/attendance}", tone: "{/facts/tone}" } },
    { id: "f-last", type: "stat", props: { label: "Last seen", value: "{/facts/last}" } },
    { id: "f-next", type: "stat", props: { label: "Next visit", value: "{/facts/next}", tone: "info" } },
    { id: "f-doc", type: "stat", props: { label: "Usual doctor", value: "{/facts/doctor}" } },
    row("d-actions", ["d-book", "d-close", "d-delete"]),
    btn("d-book", "Book for this patient", "book_for_patient", "primary"),
    btn("d-close", "Add another patient", "close_patient", "secondary"),
    btn("d-delete", "Delete record", "ask_delete_patient", "link"),
    { id: "d-confirm", type: "alert", props: { title: "Delete this record?", body: "The patient and their visit history are removed from this computer. This cannot be undone.", tone: "danger" }, children: ["d-yes", "d-no"] },
    btn("d-yes", "Yes, delete", "delete_patient", "danger"),
    btn("d-no", "Keep", "cancel_delete_patient", "secondary"),
    { id: "d-tabs", type: "tabs", props: { ...(activeTab(ui, "patient") ? { active: activeTab(ui, "patient") } : {}) }, children: ["details", "visits"] },
    panel("details", "Details", ["d-fields", "d-notes"], "Changes save as you type. These are front-desk details, not a medical record."),
    { id: "d-fields", type: "grid", props: { columns: 2, minItemWidth: "md", gap: "sm" }, children: ["d-name", "d-phone", "d-email", "d-dob", "d-allergy", "d-emerg"] },
    { id: "d-name", type: "input", props: { label: "Name", bind: "/patient/name" } },
    { id: "d-phone", type: "input", props: { label: "Phone", bind: "/patient/phone", kind: "tel" } },
    { id: "d-email", type: "input", props: { label: "Email", bind: "/patient/email", kind: "email" } },
    { id: "d-dob", type: "date", props: { label: "Date of birth", bind: "/patient/dob" } },
    { id: "d-allergy", type: "input", props: { label: "Allergies and alerts", bind: "/patient/allergies", placeholder: "Shown on every visit" } },
    { id: "d-emerg", type: "input", props: { label: "Emergency contact", bind: "/patient/emergency", placeholder: "Name and number" } },
    { id: "d-notes", type: "textarea", props: { label: "Notes for the front desk", bind: "/patient/notes", placeholder: "Preferences, access needs, who to call" } },
    panel("visits", "{/detail/visitsTitle}", [history.length ? "d-hist" : "d-none"]),
    { id: "d-hist", type: "table", props: { columns: [{ key: "date", label: "Date" }, { key: "time", label: "Time" }, { key: "doctor", label: "Doctor" }, { key: "kind", label: "Type" }, { key: "status", label: "Status" }, { key: "reason", label: "Reason" }], rows: "{/history}", pageSize: 10 } },
    caption("d-none", "No visits yet."),
  );
  const missed = s.appts!.filter((a) => a.status === "no_show").length;
  const data = {
    subtitle: `${plural(s.patients!.length, "patient")} · ${plural(s.appts!.filter(live).length, "upcoming visit")} · ${plural(missed, "missed visit")}. Records stay on this computer.`,
    newPatient: { ...ui.newPatient },
    patients: s.patients!.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, 1000).map((p) => {
      const mine = visits(p.id), next = mine.filter(live).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
      const missedN = mine.filter((a) => a.status === "no_show").length;
      return { id: p.id, name: p.name, phone: p.phone || "No phone", summary: [p.dob ? `${age(p.dob, now0)} yrs` : "", `${plural(mine.filter((a) => a.status === "completed").length, "past visit")}`].filter(Boolean).join(" · "), badge: p.id === ui.openPatientId ? "Open" : next ? `Next ${shortDate(next.date)}` : missedN ? `${missedN} missed` : "", tone: p.id === ui.openPatientId ? "success" : next ? "info" : missedN ? "warning" : "neutral" };
    }),
    patient: open ? { name: open.name, phone: open.phone, dob: open.dob, notes: open.notes, email: open.email, allergies: open.allergies, emergency: open.emergency } : { name: "", phone: "", dob: "", notes: "", email: "", allergies: "", emergency: "" },
    facts: (() => {
      if (!open) return { attendance: "", tone: "neutral", last: "", next: "", doctor: "" };
      const f = patientFacts(s, open.id, now0);
      return { attendance: f.completed + f.missed ? `${Math.round(f.attendance * 100)}%` : "New", tone: f.missed >= 2 ? "danger" : f.missed ? "warning" : "success", last: f.last ? shortDate(f.last) : "Never", next: f.next ? `${shortDate(f.next.date)} ${spokenTime(f.next.time)}` : "None booked", doctor: f.topDoctor ? doctorOf(s, f.topDoctor)?.name ?? "-" : "-" };
    })(),
    detail: open ? { title: open.name, summary: [phoneText(open.phone), open.dob ? `${age(open.dob, now0)} years` : "", open.allergies ? `Allergies: ${open.allergies}` : ""].filter(Boolean).join(" · "), visitsTitle: counted("Visit history", visits(open.id).length) } : { title: "", summary: "", visitsTitle: "" },
    history: history.map((a) => ({ date: shortDate(a.date), time: spokenTime(a.time), doctor: doctorOf(s, a.doctorId)!.name, kind: a.kind, status: STATUS_LABEL[a.status], reason: a.reason || "-" })),
  };
  return { surface: "patients", nodes: reachable(nodes), data: replaceAll(data) };
}

const doctorCard = (to: string): Node => ({ id: "d-card", type: "card", props: { title: "{name}", subtitle: "{subtitle}", body: "{body}", badge: "{badge}", tone: "{tone}", action: "open_doctor", payload: { id: "{id}", to }, actionLabel: "Open" } });

/** Setup: clinic details in one tab; doctors, their hours and time away in another. */
function setupSurface(s: State): Update {
  const ui = s.ui!, open = doctorOf(s, ui.openDoctorId);
  const nodes: Node[] = [
    { id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: ["subtitle", "tabs"] },
    caption("subtitle", "{/subtitle}"),
    { id: "tabs", type: "tabs", props: { ...(activeTab(ui, "setup") ? { active: activeTab(ui, "setup") } : {}) }, children: ["clinic", "doctors"] },
    panel("clinic", "Clinic", ["c-grid", "c-bar"], "The name, tagline, phone and address head the schedule, reminders and exports. The time zone decides what \"today\" and \"now\" mean for slots."),
    { id: "c-grid", type: "grid", props: { columns: 3, minItemWidth: "md", gap: "sm" }, children: ["c-name", "c-tag", "c-phone", "c-addr", "c-zone"] },
    { id: "c-name", type: "input", props: { label: "Clinic name", bind: "/clinic/name" } },
    { id: "c-tag", type: "input", props: { label: "Tagline", bind: "/clinic/tagline", placeholder: "Care that listens" } },
    { id: "c-phone", type: "input", props: { label: "Clinic phone", bind: "/clinic/phone", kind: "tel" } },
    { id: "c-addr", type: "input", props: { label: "Address", bind: "/clinic/address" } },
    { id: "c-zone", type: "input", props: { label: "Time zone", bind: "/clinic/timezone", placeholder: "Asia/Kolkata" } },
    row("c-bar", ["c-save"]),
    btn("c-save", "Save changes", "save_clinic", "primary"),
    panel("doctors", "{/doctorsTitle}", ["d-cols"], "{/doctorText}"),
    { id: "d-cols", type: "split", props: { ratio: "1:2", gap: "lg" }, children: ["roster", ...(open ? ["editor"] : [])] },
    { id: "roster", type: "stack", props: { gap: "sm" }, children: ["add-bar", ...(s.doctors!.length ? ["d-list"] : [])] },
    row("add-bar", ["new-doc", "add-doc"]),
    { id: "new-doc", type: "input", props: { label: "New doctor", bind: "/newDoctor", placeholder: "Dr. Name" } },
    btn("add-doc", "Add doctor", "add_doctor", "primary"),
    rows("d-list", "/doctors", "d-card", { pageSize: 10 }),
    doctorCard("setup"),
  ];
  if (open) nodes.push(
    { id: "editor", type: "stack", props: { gap: "md" }, children: ["e-head", "e-who", "e-days", "e-presets", "e-hours", "leave-t", "l-bar", ...(s.leave!.some((l) => l.doctorId === open.id) ? ["l-list"] : []), "e-active"] },
    { id: "e-head", type: "stack", props: { gap: "xs" }, children: ["e-title", "e-sub"] },
    { id: "e-title", type: "text", props: { content: "{/editor/title}", variant: "subheading" } },
    caption("e-sub", "{/editor/summary}"),
    { id: "e-who", type: "grid", props: { columns: 3, minItemWidth: "sm", gap: "sm" }, children: ["e-name", "e-spec", "e-room"] },
    { id: "e-name", type: "input", props: { label: "Name", bind: "/doctor/name" } },
    { id: "e-spec", type: "input", props: { label: "Specialty", bind: "/doctor/specialty", placeholder: "General practice" } },
    { id: "e-room", type: "input", props: { label: "Room", bind: "/doctor/room", placeholder: "Room 2" } },
    { id: "e-days", type: "select", props: { label: "Working days", bind: "/doctor/days", options: DAYS, multiple: true } },
    row("e-presets", ["pr-wk", "pr-sat", "pr-all"]),
    btn("pr-wk", "Mon to Fri", "days_preset", "link", { preset: "weekdays" }),
    btn("pr-sat", "Mon to Sat", "days_preset", "link", { preset: "mon-sat" }),
    btn("pr-all", "Every day", "days_preset", "link", { preset: "every-day" }),
    { id: "e-hours", type: "grid", props: { columns: 3, minItemWidth: "sm", gap: "sm" }, children: ["e-start", "e-end", "e-slot", "e-bs", "e-be"] },
    { id: "e-start", type: "select", props: { label: "Starts", bind: "/doctor/start", options: TIMES, presentation: "dropdown" } },
    { id: "e-end", type: "select", props: { label: "Ends", bind: "/doctor/end", options: TIMES, presentation: "dropdown" } },
    { id: "e-slot", type: "select", props: { label: "Visit length (min)", bind: "/doctor/slot", options: SLOT_MINUTES.map(String), presentation: "dropdown" } },
    { id: "e-bs", type: "select", props: { label: "Break from", bind: "/doctor/breakStart", options: ["none", ...TIMES], presentation: "dropdown" } },
    { id: "e-be", type: "select", props: { label: "Break until", bind: "/doctor/breakEnd", options: ["none", ...TIMES], presentation: "dropdown" } },
    { id: "leave-t", type: "stack", props: { gap: "xs" }, children: ["leave-h", "leave-d"] },
    { id: "leave-h", type: "text", props: { content: "Time away", variant: "subheading" } },
    caption("leave-d", "Leave removes this doctor's slots on those days."),
    row("l-bar", ["l-from", "l-to", "l-note", "l-add"]),
    { id: "l-from", type: "date", props: { label: "From", bind: "/leave/from" } },
    { id: "l-to", type: "date", props: { label: "To", bind: "/leave/to" } },
    { id: "l-note", type: "input", props: { label: "Note", bind: "/leave/note", placeholder: "Conference, holiday" } },
    btn("l-add", "Add time away", "add_leave", "primary"),
    rows("l-list", "/leaveList", "l-card"),
    { id: "l-card", type: "card", props: { title: "{range}", body: "{note}", layout: "row" }, children: ["l-drop"] },
    btn("l-drop", "Remove", "remove_leave", "link", { id: "{id}" }),
    row("e-active", ["e-toggle"]),
    btn("e-toggle", "{/editor/toggle}", "toggle_doctor", "{/editor/toggleStyle}"),
  );
  const activeN = s.doctors!.filter((d) => d.active).length;
  const data = {
    subtitle: `${s.clinic!.name} · ${plural(activeN, "doctor")} taking bookings`,
    clinic: { name: s.clinic!.name, timezone: s.clinic!.timezone, tagline: s.clinic!.tagline, phone: s.clinic!.phone, address: s.clinic!.address },
    newDoctor: ui.newDoctor, doctorsTitle: counted("Doctors", s.doctors!.length),
    doctorText: s.doctors!.length ? "Choose a doctor to change their days, hours and time away. Changes save as you make them." : "Add the first doctor to start booking.",
    doctors: s.doctors!.map((d) => ({
      id: d.id, name: d.name, subtitle: [d.specialty || "General", d.room].filter(Boolean).join(" · "), body: `${d.days.length === 7 ? "Every day" : d.days.join(", ") || "No days set"} · ${d.start}–${d.end} · ${d.slot}-minute visits`,
      badge: d.id === ui.openDoctorId ? "Editing" : d.active ? "Active" : "Retired", tone: d.id === ui.openDoctorId ? "info" : d.active ? "success" : "neutral",
    })),
    doctor: open ? { name: open.name, specialty: open.specialty, room: open.room, days: open.days, start: open.start, end: open.end, slot: String(open.slot), breakStart: open.breakStart || "none", breakEnd: open.breakEnd || "none" } : { name: "", room: "", specialty: "", days: [], start: "09:00", end: "17:00", slot: "15", breakStart: "none", breakEnd: "none" },
    leave: { ...ui.leave },
    leaveList: open ? s.leave!.filter((l) => l.doctorId === open.id).sort((a, b) => a.from.localeCompare(b.from)).map((l) => ({ id: l.id, range: l.from === l.to ? shortDate(l.from) : `${shortDate(l.from)} to ${shortDate(l.to)}`, note: l.note || "No note" })) : [],
    editor: open ? { title: open.name, summary: open.active ? "Taking bookings." : "Retired: not offered for new bookings.", toggle: open.active ? "Retire doctor" : "Restore doctor", toggleStyle: open.active ? "danger" : "primary" } : { title: "", summary: "", toggle: "", toggleStyle: "secondary" },
  };
  return { surface: "setup", nodes: reachable(nodes), data: replaceAll(data) };
}

const mondayOf = (date: string) => addDays(date, -DAYS.indexOf(dayName(date)));
const pctText = (v: number) => `${Math.round(v * 100)}%`;

/** Doctors: the roster on the left; the chosen doctor's week, upcoming visits and results as tabs on the right. */
function doctorsSurface(s: State, nowDate: Date): Update {
  const ui = s.ui!, now0 = today(s, nowDate), open = doctorOf(s, ui.openDoctorId);
  const week = mondayOf(now0);
  const model = riskModel(s);
  const live = upcoming(s, nowDate);
  const coming = open ? s.appts!.filter((a) => a.doctorId === open.id && live(a)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)) : [];
  const nodes: Node[] = [
    { id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: ["subtitle", s.doctors!.length ? "cols" : "empty"] },
    caption("subtitle", "{/subtitle}"),
    { id: "empty", type: "card", props: { title: "No doctors yet", body: "Add a doctor and their weekly hours in Setup. Their profile, week calendar and results appear here.", tone: "info" }, children: ["empty-go"] },
    btn("empty-go", "Set up doctors", "setup_doctors", "primary"),
    { id: "cols", type: "split", props: { ratio: "1:2", gap: "lg" }, children: ["roster", ...(open ? ["profile"] : [])] },
    panel("roster", "All doctors", ["cards"]),
    rows("cards", "/doctors", "d-card", { pageSize: 10 }),
    doctorCard("doctors"),
  ];
  if (open) nodes.push(
    { id: "profile", type: "section", props: { title: "{/profile/title}", description: "{/profile/summary}" }, children: ["p-stats", "p-bar", "p-tabs"] },
    { id: "p-stats", type: "grid", props: { columns: 4, minItemWidth: "sm", gap: "sm" }, children: ["ps-visits", "ps-miss", "ps-util", "ps-free"] },
    { id: "ps-visits", type: "stat", props: { label: "Visits (30 days)", value: "{/profile/visits}" } },
    { id: "ps-miss", type: "stat", props: { label: "No-show rate", value: "{/profile/noShow}", tone: "{/profile/noShowTone}" } },
    { id: "ps-util", type: "stat", props: { label: "Slots used", value: "{/profile/util}", tone: "info" } },
    { id: "ps-free", type: "stat", props: { label: "Next free slot", value: "{/profile/nextFree}", tone: "success" } },
    row("p-bar", ["p-book", "p-edit"]),
    btn("p-book", "Book with this doctor", "book_with_doctor", "primary"),
    btn("p-edit", "Edit hours and leave", "setup_doctors", "secondary", { id: open.id }),
    { id: "p-tabs", type: "tabs", props: { ...(activeTab(ui, "doctor") ? { active: activeTab(ui, "doctor") } : {}) }, children: ["week", "coming", "results"] },
    panel("week", "Calendar", ["p-cal"]),
    { id: "p-cal", type: "calendar", props: { events: "{/profile/events}", view: "week", date: "{/profile/week}" } },
    panel("coming", "{/profile/comingTitle}", [coming.length ? "p-next" : "p-none"]),
    { id: "p-next", type: "table", props: { columns: [{ key: "when", label: "When" }, { key: "patient", label: "Patient" }, { key: "kind", label: "Type" }, { key: "risk", label: "Attendance" }], rows: "{/profile/upcoming}", pageSize: 10 } },
    caption("p-none", "No upcoming visits."),
    panel("results", "Results", ["p-chart"], "Visits by weekday over the last 30 days."),
    { id: "p-chart", type: "chart", props: { kind: "bar", labels: "{/profile/chart/labels}", series: "{/profile/chart/series}", height: "sm" } },
  );
  const stat = open ? report(s, addDays(now0, -29), now0, now0, open.id) : undefined;
  const next = open ? (() => { for (let i = 0; i < 30; i++) { const date = addDays(now0, i), t = freeSlots(s, open, date, nowDate)[0]; if (t) return `${i === 0 ? "Today" : i === 1 ? "Tomorrow" : shortDate(date)} ${spokenTime(t)}`; } return "None in 30 days"; })() : "";
  const todayBooked = (id: string) => s.appts!.filter((a) => a.doctorId === id && a.date === now0 && a.status !== "cancelled").length;
  const data = {
    subtitle: s.doctors!.length ? `${plural(s.doctors!.filter((d) => d.active).length, "doctor")} taking bookings. Choose one for their week, upcoming visits and results.` : "Add a doctor in Setup to begin.",
    doctors: s.doctors!.map((d) => ({
      id: d.id, name: d.name, subtitle: [d.specialty || "General practice", d.room].filter(Boolean).join(" · "),
      body: `${d.days.length === 7 ? "Every day" : d.days.join(", ") || "No days set"} · ${d.start}–${d.end} · ${todayBooked(d.id)} booked today`,
      badge: d.id === ui.openDoctorId ? "Open" : !d.active ? "Retired" : onLeave(s, d.id, now0) ? "Away" : "Active",
      tone: d.id === ui.openDoctorId ? "info" : !d.active ? "neutral" : onLeave(s, d.id, now0) ? "warning" : "success",
    })),
    profile: open && stat ? {
      title: open.name, summary: [open.specialty, open.room, `${open.days.join(", ")} ${open.start}–${open.end}`, `${open.slot}-minute visits`].filter(Boolean).join(" · "),
      visits: stat.completed + stat.noShow + stat.upcoming, noShow: stat.completed + stat.noShow >= 5 ? pctText(stat.noShowRate) : "Not enough yet", noShowTone: stat.noShowRate >= 0.15 ? "danger" : stat.noShowRate >= 0.08 ? "warning" : "success",
      util: pctText(stat.utilisation), nextFree: next, week,
      // The calendar pages on its own; give it the weeks around this one.
      events: s.appts!.filter((a) => a.doctorId === open.id && a.date >= addDays(week, -28) && a.date <= addDays(week, 62) && a.status !== "cancelled").slice(0, 600)
        .map((a) => ({ title: shortName(patientOf(s, a.patientId)!.name), date: a.date, start: a.time, end: clock(minutes(a.time) + a.minutes), note: kindLine(a), tone: STATUS_TONE[a.status] })),
      chart: { labels: stat.weekdays.map((d) => d.label), series: [{ name: "Visits", values: stat.weekdays.map((d) => d.total) }] },
      comingTitle: counted("Upcoming", coming.length),
      upcoming: coming.slice(0, 100).map((a) => ({ when: `${shortDate(a.date)} ${spokenTime(a.time)}`, patient: shortName(patientOf(s, a.patientId)!.name), kind: a.kind, risk: riskOf(model, a) ? `${Math.round(riskOf(model, a)!.p * 100)}% may miss` : "-" })),
    } : { title: "", summary: "", visits: 0, noShow: "", noShowTone: "neutral", util: "", nextFree: "", week, events: [], chart: { labels: [], series: [] }, comingTitle: "", upcoming: [] },
  };
  return { surface: "doctors", nodes: reachable(nodes), data: replaceAll(data) };
}

/** Insights: filters and headline figures, then tabs for the summary, trends, patterns and each doctor. */
function insightsSurface(s: State, nowDate: Date): Update {
  const ui = s.ui!, now0 = today(s, nowDate), days = Number(ui.insightDays);
  const r = report(s, addDays(now0, -(days - 1)), now0, now0, ui.insightDoctor);
  const model = riskModel(s);
  const out = weekOutlook(s, now0, nowDate, model);
  const resolved = r.completed + r.noShow;
  const notes: string[] = [];
  if (!r.total) notes.push("No appointments in this period yet. Figures appear as visits are booked and completed.");
  else {
    if (r.enoughHistory) {
      const worst = r.weekdays.filter((d) => d.noShowRate > 0).sort((a, b) => b.noShowRate - a.noShowRate)[0];
      if (worst && worst.noShowRate >= 0.1) notes.push(`${worst.label} has the highest no-show rate (${pctText(worst.noShowRate)}). Reminders matter most for that day.`);
      if (r.noShowRate >= 0.12) notes.push(`${pctText(r.noShowRate)} of resolved visits were missed. Two reminders, one a few days ahead and one the day before, usually help.`);
    }
    if (r.utilisation >= 0.9) notes.push("Slots are nearly all taken. Consider more hours or another session for the busiest doctor.");
    else if (r.capacity && r.utilisation <= 0.4) notes.push(`Only ${pctText(r.utilisation)} of offered slots were used. Shorter hours on quiet days could free the doctor's time.`);
    if (r.avgLead >= 10) notes.push(`Patients book about ${Math.round(r.avgLead)} days ahead. Long lead times raise the chance of a miss, so keep some same-week slots open.`);
    if (!notes.length) notes.push("Nothing stands out. Attendance and capacity look healthy for this period.");
  }
  const chartBox = (id: string, title: string, chart: Node): Node[] => [{ id, type: "stack", props: { gap: "xs" }, children: [`${id}-t`, chart.id] }, { id: `${id}-t`, type: "text", props: { content: title, variant: "subheading" } }, chart];
  const nodes: Node[] = [
    { id: "root", type: "stack", props: { gap: "md", density: "compact" }, children: ["subtitle", "bar", ...(s.doctors!.length ? ["stats", "tabs"] : ["empty"])] },
    caption("subtitle", "{/subtitle}"),
    row("bar", ["period", "who", "export"]),
    { id: "period", type: "select", props: { label: "Period", bind: "/insightDays", options: PERIODS } },
    { id: "who", type: "select", props: { label: "Doctor", bind: "/insightDoctor", options: "{/doctorOptions}" } },
    btn("export", "Export report (CSV)", "file.save", "secondary", { name: "/report/name", text: "/report/csv" }),
    { id: "empty", type: "card", props: { title: "No data yet", body: "Add a doctor and book visits to see results here.", tone: "info" } },
    { id: "stats", type: "grid", props: { columns: 6, minItemWidth: "sm", gap: "sm" }, children: ["i-vis", "i-att", "i-miss", "i-util", "i-lead", "i-new"] },
    { id: "i-vis", type: "stat", props: { label: "Visits completed", value: "{/k/completed}", tone: "success" } },
    { id: "i-att", type: "stat", props: { label: "Attendance", value: "{/k/attendance}" } },
    { id: "i-miss", type: "stat", props: { label: "No-show rate", value: "{/k/noShow}", tone: "{/k/noShowTone}" } },
    { id: "i-util", type: "stat", props: { label: "Slots used", value: "{/k/util}", tone: "info" } },
    { id: "i-lead", type: "stat", props: { label: "Booked ahead", value: "{/k/lead}" } },
    { id: "i-new", type: "stat", props: { label: "New patients", value: "{/k/newPatients}" } },
    { id: "tabs", type: "tabs", props: {}, children: ["summary", "trends", "patterns", "by-doctor"] },
    panel("summary", "Summary", ["notes-list"], "Rules over this clinic's own records, not medical advice."),
    { id: "notes-list", type: "list", props: { items: "{/notes}" } },
    panel("trends", "Trends", ["trend-grid"]),
    { id: "trend-grid", type: "grid", props: { columns: 2, minItemWidth: "lg", gap: "md" }, children: ["trend", "fc"] },
    ...chartBox("trend", "Visits over time", { id: "trend-c", type: "chart", props: { kind: "stacked", labels: "{/trend/labels}", series: "{/trend/series}", height: "sm" } }),
    ...chartBox("fc", "Next 7 days: booked and expected", { id: "fc-c", type: "chart", props: { kind: "bar", labels: "{/forecast/labels}", series: "{/forecast/series}", height: "sm" } }),
    panel("patterns", "Patterns", ["mix"]),
    { id: "mix", type: "grid", props: { columns: 3, minItemWidth: "md", gap: "md" }, children: ["m-hours", "m-days", "m-kinds"] },
    ...chartBox("m-hours", "Busiest hours", { id: "m-hours-c", type: "chart", props: { kind: "bar", labels: "{/hours/labels}", series: "{/hours/series}", height: "sm" } }),
    ...chartBox("m-days", "No-show rate by weekday (%)", { id: "m-days-c", type: "chart", props: { kind: "bar", labels: "{/weekdays/labels}", series: "{/weekdays/series}", height: "sm" } }),
    ...chartBox("m-kinds", "Visit types", { id: "m-kinds-c", type: "chart", props: { kind: "pie", labels: "{/kinds/labels}", series: "{/kinds/series}", height: "sm" } }),
    panel("by-doctor", "By doctor", ["docs"]),
    { id: "docs", type: "table", props: { columns: [{ key: "name", label: "Doctor" }, { key: "total", label: "Visits", align: "end" }, { key: "completed", label: "Completed", align: "end" }, { key: "noShow", label: "No-shows", align: "end" }, { key: "cancelled", label: "Cancelled", align: "end" }, { key: "util", label: "Slots used", align: "end" }], rows: "{/doctorRows}" } },
  ];
  const csv = [["Metric", "Value"], ["Period", `${r.from} to ${r.to}`], ["Doctor", ui.insightDoctor ? doctorOf(s, ui.insightDoctor)?.name ?? "" : "All"], ["Appointments", String(r.total)], ["Completed", String(r.completed)], ["No-shows", String(r.noShow)], ["Cancelled", String(r.cancelled)], ["No-show rate", pctText(r.noShowRate)], ["Slots used", pctText(r.utilisation)], ["Average days booked ahead", r.avgLead.toFixed(1)], ["New patients", String(r.newPatients)], [], ["Doctor", "Visits", "Completed", "No-shows", "Cancelled", "Slots used"], ...r.doctors.map((d) => [d.name, String(d.total), String(d.completed), String(d.noShow), String(d.cancelled), pctText(d.utilisation)])]
    .map((cols) => cols.map(csvCell).join(",")).join("\n") + "\n";
  const data = {
    subtitle: `${s.clinic!.name} · ${shortDate(r.from)} to ${shortDate(r.to)} · ${plural(r.total, "appointment")}`,
    insightDays: ui.insightDays, insightDoctor: ui.insightDoctor || "all",
    doctorOptions: [{ label: "All doctors", value: "all" }, ...s.doctors!.map((d) => ({ label: d.name, value: d.id }))],
    k: {
      completed: r.completed, attendance: resolved ? pctText(1 - r.noShowRate) : "-", noShow: resolved ? pctText(r.noShowRate) : "-", noShowTone: r.noShowRate >= 0.15 ? "danger" : r.noShowRate >= 0.08 ? "warning" : "success",
      util: r.capacity ? pctText(r.utilisation) : "-", lead: r.total ? `${r.avgLead.toFixed(1)} days` : "-", newPatients: r.newPatients,
    },
    notes,
    trend: { labels: r.trend.labels, series: [{ name: "Completed", values: r.trend.completed }, { name: "Upcoming", values: r.trend.upcoming }, { name: "No-show", values: r.trend.noShow }, { name: "Cancelled", values: r.trend.cancelled }] },
    hours: { labels: r.hours.map((h) => h.label), series: [{ name: "Visits", values: r.hours.map((h) => h.count) }] },
    weekdays: { labels: r.weekdays.map((d) => d.label), series: [{ name: "No-show %", values: r.weekdays.map((d) => Math.round(d.noShowRate * 100)) }] },
    kinds: { labels: r.kinds.map((k) => k.label), series: [{ name: "Visits", values: r.kinds.map((k) => k.count) }] },
    doctorRows: r.doctors.map((d) => ({ name: d.name, total: d.total, completed: d.completed, noShow: d.noShow, cancelled: d.cancelled, util: pctText(d.utilisation) })),
    forecast: { labels: out.map((d) => dayTag(d.date)), series: [{ name: "Booked", values: out.map((d) => d.booked) }, { name: "Expected", values: out.map((d) => d.expected) }] },
    report: { name: `clinic-report-${r.from}-to-${r.to}.csv`, csv },
  };
  return { surface: "insights", nodes: reachable(nodes), data: replaceAll(data) };
}

const TITLES: Record<string, string> = { today: "Schedule", book: "Book", patients: "Patients", doctors: "Doctors", insights: "Insights", setup: "Setup" };
/** A new clinic on a fixed clock and zone, so the shipped file never depends on who generates it. */
export const emptyState = (): State => ({ clinic: { name: "Our Clinic", timezone: "UTC", tagline: "", phone: "", address: "" } });
/** The shipped surface.json: every view of a new, empty app. */
export const surfaceFile = () => view(emptyState(), new Date(Date.now())).map((u) => ({ id: u.surface, title: TITLES[u.surface], data: u.data[0]!.value, nodes: u.nodes }));

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) { return { updates: view(normalize(context.state), context.now?.() ?? new Date()) }; }
