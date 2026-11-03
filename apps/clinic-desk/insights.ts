// Clinic Desk reports and front-desk prompts. Everything here is derived from the
// appointment records on each run (nothing stored, nothing learned elsewhere), so a
// figure on the Insights screen, a "needs attention" card and an assistant answer
// agree with the Schedule. Capacity is computed from doctors' weekly hours and leave
// exactly as the free-slot logic does, so utilisation cannot disagree with Book.
import { addDays, dayName, freeSlots, minutes, onLeave, type Appt, type Doctor, type State } from "./server.ts";
import { riskOf, type RiskModel } from "./intel.ts";

const HELD = ["booked", "checked_in", "completed", "no_show"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const RECALL_DAYS = 180;
export const PERIODS = [{ label: "7 days", value: "7" }, { label: "30 days", value: "30" }, { label: "90 days", value: "90" }];

const share = (n: number, d: number) => (d ? n / d : 0);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const short = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const first = (name: string) => { const w = name.split(" ").filter(Boolean); return w.length > 1 ? `${w[0]} ${w.at(-1)![0]}.` : name; };

/** Slots a doctor offers on one date before any booking, from weekly hours, break and leave. */
function daySlots(s: State, d: Doctor, date: string): number {
  if (!d.days.includes(dayName(date)) || onLeave(s, d.id, date)) return 0;
  let n = 0;
  for (let t = minutes(d.start); t + d.slot <= minutes(d.end); t += d.slot) {
    if (d.breakStart && t < minutes(d.breakEnd) && t + d.slot > minutes(d.breakStart)) continue;
    n++;
  }
  return n;
}

export interface Report {
  from: string; to: string; days: number; total: number; completed: number; noShow: number; cancelled: number; upcoming: number;
  noShowRate: number; cancelRate: number; capacity: number; utilisation: number; avgLead: number; newPatients: number; returning: number;
  enoughHistory: boolean;
  trend: { labels: string[]; completed: number[]; noShow: number[]; cancelled: number[]; upcoming: number[] };
  doctors: { id: string; name: string; total: number; completed: number; noShow: number; cancelled: number; utilisation: number }[];
  kinds: { label: string; count: number }[];
  hours: { label: string; count: number }[];
  weekdays: { label: string; total: number; noShowRate: number }[];
  reasons: { label: string; count: number }[];
}

/** Everything the Insights screen shows for a date range, optionally for one doctor. */
export function report(s: State, from: string, to: string, today: string, doctorId = ""): Report {
  const days = daysBetween(from, to) + 1;
  const appts = s.appts!.filter((a) => a.date >= from && a.date <= to && (!doctorId || a.doctorId === doctorId));
  const count = (st: string, xs = appts) => xs.filter((a) => a.status === st).length;
  const completed = count("completed"), noShow = count("no_show"), cancelled = count("cancelled");
  const upcoming = appts.filter((a) => (a.status === "booked" || a.status === "checked_in") && a.date >= today).length;
  const doctors = s.doctors!.filter((d) => (!doctorId || d.id === doctorId) && (d.active || appts.some((a) => a.doctorId === d.id)));
  const capOf = (d: Doctor) => { let n = 0; for (let i = 0; i < days; i++) n += daySlots(s, d, addDays(from, i)); return n; };
  const held = (xs: Appt[]) => xs.filter((a) => HELD.includes(a.status)).length;
  const capacity = doctors.reduce((n, d) => n + capOf(d), 0);
  const leads = appts.filter((a) => a.status !== "cancelled").map((a) => Math.max(0, daysBetween(a.created.slice(0, 10), a.date)));
  const completedBefore = new Set<string>();
  let returning = 0, seen = 0;
  for (const a of s.appts!.filter((x) => x.status === "completed").sort((x, y) => x.date.localeCompare(y.date))) {
    if (a.date >= from && a.date <= to && (!doctorId || a.doctorId === doctorId)) { seen++; if (completedBefore.has(a.patientId)) returning++; }
    completedBefore.add(a.patientId);
  }

  // Long ranges read better by week than by day.
  const weekly = days > 31, bucket = (date: string) => (weekly ? addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7)) : date);
  const keys: string[] = [];
  for (let i = 0; i < days; i++) { const k = bucket(addDays(from, i)); if (!keys.includes(k)) keys.push(k); }
  const trend = { labels: keys.map((k) => (weekly ? `Wk ${short(k)}` : short(k))), completed: keys.map(() => 0), noShow: keys.map(() => 0), cancelled: keys.map(() => 0), upcoming: keys.map(() => 0) };
  for (const a of appts) {
    const i = keys.indexOf(bucket(a.date));
    if (i < 0) continue;
    if (a.status === "completed") trend.completed[i]!++;
    else if (a.status === "no_show") trend.noShow[i]!++;
    else if (a.status === "cancelled") trend.cancelled[i]!++;
    else trend.upcoming[i]!++;
  }

  const tally = (key: (a: Appt) => string, only = appts.filter((a) => a.status !== "cancelled")) => {
    const m = new Map<string, number>();
    for (const a of only) { const k = key(a); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const hourCounts = new Map(tally((a) => a.time.slice(0, 2)));
  const hourKeys = [...hourCounts.keys()].sort();
  const lo = Number(hourKeys[0] ?? 9), hi = Number(hourKeys.at(-1) ?? 17);
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => { const h = String(lo + i).padStart(2, "0"); return { label: `${Number(h) % 12 || 12}${Number(h) < 12 ? "a" : "p"}`, count: hourCounts.get(h) ?? 0 }; });
  const resolved = appts.filter((a) => a.status === "completed" || a.status === "no_show");

  return {
    from, to, days, total: appts.length, completed, noShow, cancelled, upcoming,
    noShowRate: share(noShow, completed + noShow), cancelRate: share(cancelled, appts.length),
    capacity, utilisation: share(held(appts), capacity),
    avgLead: leads.length ? leads.reduce((a, b) => a + b, 0) / leads.length : 0,
    newPatients: s.patients!.filter((p) => p.created.slice(0, 10) >= from && p.created.slice(0, 10) <= to).length,
    returning: share(returning, seen), enoughHistory: completed + noShow >= 10,
    trend,
    doctors: doctors.map((d) => {
      const mine = appts.filter((a) => a.doctorId === d.id), cap = capOf(d);
      return { id: d.id, name: d.name, total: mine.length, completed: count("completed", mine), noShow: count("no_show", mine), cancelled: count("cancelled", mine), utilisation: share(held(mine), cap) };
    }),
    kinds: tally((a) => a.kind).map(([label, c]) => ({ label, count: c })),
    hours,
    weekdays: WEEKDAYS.map((w) => { const mine = resolved.filter((a) => dayName(a.date) === w); return { label: w, total: appts.filter((a) => dayName(a.date) === w && a.status !== "cancelled").length, noShowRate: share(count("no_show", mine), mine.length) }; }),
    reasons: tally((a) => a.reason.toLowerCase()).slice(0, 6).map(([label, c]) => ({ label: label.charAt(0).toUpperCase() + label.slice(1), count: c })),
  };
}

export interface Alert { id: string; kind: "call" | "backfill" | "rebook" | "recall" | "overbook"; tone: "danger" | "warning" | "info"; title: string; body: string; label: string; action: string; payload?: unknown }
const ORDER: Record<Alert["tone"], number> = { danger: 0, warning: 1, info: 2 };

/**
 * What the desk should do next, each with the reason. These are rules over the
 * clinic's own records and the attendance estimate, never a clinical judgement:
 * every prompt is a call, a rebooking or an offer a person makes.
 */
export function attention(s: State, now: Date, model: RiskModel, today: string): Alert[] {
  const out: Alert[] = [];
  const name = (id: string) => s.patients!.find((p) => p.id === id)?.name ?? "Patient";
  const doctor = (id: string) => s.doctors!.find((d) => d.id === id);
  const clock = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? "AM" : "PM"}`; };
  const live = (a: Appt) => a.status === "booked" || a.status === "checked_in";

  // 1. Likely no-shows in the next two days: a call is cheaper than an empty slot.
  s.appts!.filter((a) => a.status === "booked" && a.date >= today && a.date <= addDays(today, 2))
    .map((a) => ({ a, r: riskOf(model, a) })).filter((x) => x.r?.level === "high")
    .sort((x, y) => y.r!.p - x.r!.p).slice(0, 4)
    .forEach(({ a, r }) => out.push({ id: `call-${a.id}`, kind: "call", tone: "danger", title: `Call ${first(name(a.patientId))}: about ${Math.round(r!.p * 100)}% may miss`,
      body: `${short(a.date)} ${clock(a.time)} with ${doctor(a.doctorId)?.name ?? "the doctor"}${r!.reasons.length ? ` · ${r!.reasons.slice(0, 2).join("; ")}` : ""}.`, label: "Open patient", action: "open_patient", payload: { id: a.patientId } }));

  // 2. A waiting-list patient who could take an open slot, earliest first.
  const taken = new Set<string>();
  for (const w of s.waitlist!.slice(0, 20)) {
    const pool = s.doctors!.filter((d) => d.active && (!w.doctorId || d.id === w.doctorId));
    let hit: { d: Doctor; date: string; time: string } | undefined;
    for (let i = 0; i < 7 && !hit; i++) {
      const date = addDays(today, i);
      for (const d of pool) { const t = freeSlots(s, d, date, now).find((x) => !taken.has(`${d.id}${date}${x}`)); if (t && (!hit || `${date}${t}` < `${hit.date}${hit.time}`)) hit = { d, date, time: t }; }
    }
    if (!hit) continue;
    taken.add(`${hit.d.id}${hit.date}${hit.time}`);
    out.push({ id: `fill-${w.id}`, kind: "backfill", tone: "warning", title: `Offer ${first(name(w.patientId))} ${hit.date === today ? "today" : short(hit.date)} at ${clock(hit.time)}`,
      body: `${hit.d.name} has this slot open and ${first(name(w.patientId))} is on the waiting list${w.note ? ` (${w.note})` : ""}.`, label: "Start booking", action: "waitlist_offer", payload: { id: w.id, doctorId: hit.d.id, date: hit.date, time: hit.time } });
    if (out.filter((o) => o.kind === "backfill").length >= 3) break;
  }

  // 3. Missed in the last fortnight and not rebooked.
  const byPatient = new Map<string, Appt[]>();
  for (const a of s.appts!) { const xs = byPatient.get(a.patientId) ?? []; xs.push(a); byPatient.set(a.patientId, xs); }
  const rebook: Alert[] = [], recall: Alert[] = [];
  for (const [id, xs] of byPatient) {
    const latest = xs.slice().sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
    if (xs.some((a) => live(a) && a.date >= today)) continue;
    const last = latest[0]!;
    if (last.status === "no_show" && daysBetween(last.date, today) <= 14) rebook.push({ id: `rebook-${id}`, kind: "rebook", tone: "warning", title: `${first(name(id))} missed ${short(last.date)} and has no new visit`, body: `Offer a new time with ${doctor(last.doctorId)?.name ?? "the doctor"}.`, label: "Rebook", action: "book_patient", payload: { id } });
    const done = latest.filter((a) => a.status === "completed");
    if (done.length >= 2 && daysBetween(done[0]!.date, today) >= RECALL_DAYS && last.status === "completed") recall.push({ id: `recall-${id}`, kind: "recall", tone: "info", title: `${first(name(id))} is due a check-up`, body: `Last seen ${short(done[0]!.date)}, ${Math.round(daysBetween(done[0]!.date, today) / 30)} months ago.`, label: "Book a visit", action: "book_patient", payload: { id } });
  }
  out.push(...rebook.slice(0, 3), ...recall.slice(0, 3));

  // 4. A full day that is likely to lose visits can take one late request.
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i), mine = s.appts!.filter((a) => a.date === date && a.status === "booked");
    const expected = mine.reduce((n, a) => n + (riskOf(model, a)?.p ?? 0), 0);
    const free = s.doctors!.filter((d) => d.active).reduce((n, d) => n + freeSlots(s, d, date, now).length, 0);
    if (expected >= 1.5 && free === 0) out.push({ id: `over-${date}`, kind: "overbook", tone: "info", title: `${short(date)} is full but about ${Math.round(expected)} visits may be missed`, body: "A late request could be fitted in if someone does not arrive. Keep it as a walk-in, not a booking.", label: "Open day", action: "open_day", payload: { date } });
  }
  return out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]).slice(0, 9);
}

/** One patient's history in numbers, for the profile. */
export function patientFacts(s: State, patientId: string, today: string) {
  const mine = s.appts!.filter((a) => a.patientId === patientId);
  const done = mine.filter((a) => a.status === "completed").sort((a, b) => b.date.localeCompare(a.date));
  const missed = mine.filter((a) => a.status === "no_show").length;
  const next = mine.filter((a) => (a.status === "booked" || a.status === "checked_in") && a.date >= today).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
  const perDoctor = new Map<string, number>();
  for (const a of done) perDoctor.set(a.doctorId, (perDoctor.get(a.doctorId) ?? 0) + 1);
  const topDoctor = [...perDoctor.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const gaps = done.slice(0, -1).map((a, i) => daysBetween(done[i + 1]!.date, a.date));
  return { total: mine.length, completed: done.length, missed, attendance: share(done.length, done.length + missed), last: done[0]?.date ?? "", next, topDoctor, avgGapDays: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0, pct };
}
