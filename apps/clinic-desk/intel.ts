// Clinic Desk intelligence: small, local and explainable. Both models are
// estimated from this clinic's own appointment history on every run (nothing is
// stored, sent or trained elsewhere), so they cannot drift from the records.
//
// No-show risk is naive Bayes in log-odds: the clinic's smoothed base rate,
// moved by how the patient's own past visits, the weekday, the time of day and
// the booking lead time each differ from that base. Smoothing pulls every factor
// toward the base rate when it has little evidence, so one missed visit cannot
// brand a patient. With too little history the model says nothing rather than guess.
import type { Appt, State } from "./server.ts";

export const MIN_HISTORY = 20;
const PRIOR = 0.12, PRIOR_WEIGHT = 12, FACTOR_WEIGHT = 8, PATIENT_WEIGHT = 4;
const HIGH = 0.3, MODERATE = 0.18;

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const smooth = (hits: number, n: number, base: number, weight: number) => (hits + base * weight) / (n + weight);

const dayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const band = (time: string) => { const h = Number(time.slice(0, 2)); return h < 12 ? "morning" : h < 16 ? "afternoon" : "late"; };
const leadDays = (a: Appt) => Math.max(0, Math.round((Date.parse(`${a.date}T00:00:00Z`) - Date.parse(`${a.created.slice(0, 10)}T00:00:00Z`)) / 86_400_000));
const leadBand = (days: number) => (days === 0 ? "same day" : days <= 2 ? "short notice" : days <= 14 ? "this fortnight" : "far ahead");

export interface Risk { p: number; level: "low" | "moderate" | "high"; reasons: string[] }
interface Tally { hits: number; n: number }

/** Resolved visits are the only evidence: a visit that happened or one the patient missed. Cancellations are kept out because the slot was given back. */
const resolved = (s: State) => s.appts!.filter((a) => a.status === "completed" || a.status === "no_show");

export function riskModel(s: State) {
  const history = resolved(s);
  const tally = (key: (a: Appt) => string) => {
    const m = new Map<string, Tally>();
    for (const a of history) { const t = m.get(key(a)) ?? { hits: 0, n: 0 }; t.n++; if (a.status === "no_show") t.hits++; m.set(key(a), t); }
    return m;
  };
  const all = { hits: history.filter((a) => a.status === "no_show").length, n: history.length };
  const base = smooth(all.hits, all.n, PRIOR, PRIOR_WEIGHT);
  const factors = { day: tally((a) => String(dayIndex(a.date))), band: tally((a) => band(a.time)), lead: tally((a) => leadBand(leadDays(a))), patient: tally((a) => a.patientId) };
  return { base, history: all.n, factors };
}
export type RiskModel = ReturnType<typeof riskModel>;

/** Risk for an appointment that has not happened yet; undefined when the clinic has too little history to say. */
export function riskOf(model: RiskModel, a: Appt): Risk | undefined {
  if (a.status !== "booked" || model.history < MIN_HISTORY) return undefined;
  const reasons: string[] = [];
  let z = logit(model.base);
  const apply = (t: Tally | undefined, weight: number, reason: (t: Tally) => string) => {
    const p = smooth(t?.hits ?? 0, t?.n ?? 0, model.base, weight);
    const shift = logit(p) - logit(model.base);
    z += shift;
    if (shift > 0.25 && t) reasons.push(reason(t));
  };
  apply(model.factors.patient.get(a.patientId), PATIENT_WEIGHT, (t) => `missed ${t.hits} of ${t.n} earlier visit${t.n === 1 ? "" : "s"}`);
  apply(model.factors.day.get(String(dayIndex(a.date))), FACTOR_WEIGHT, () => `${WEEKDAYS[dayIndex(a.date)]}s see more missed visits here`);
  apply(model.factors.band.get(band(a.time)), FACTOR_WEIGHT, () => `${band(a.time)} visits are missed more often`);
  apply(model.factors.lead.get(leadBand(leadDays(a))), FACTOR_WEIGHT, () => `booked ${leadBand(leadDays(a))}`);
  const p = sigmoid(z);
  return { p, level: p >= HIGH ? "high" : p >= MODERATE ? "moderate" : "low", reasons };
}

export const riskNote = (r: Risk | undefined) => (r && r.level !== "low" ? `${r.level === "high" ? "Higher" : "Some"} no-show risk (about ${Math.round(r.p * 100)}%)${r.reasons.length ? `: ${r.reasons.slice(0, 2).join(", ")}` : ""}. A reminder call is worthwhile.` : "");

export interface Outlook { date: string; capacity: number; booked: number; expected: number; load: number; label: "Closed" | "Quiet" | "Steady" | "Busy"; atRisk: number }

/**
 * Demand per day: what is already booked, lifted to the trailing average for that
 * weekday when bookings are still arriving. Capacity is booked plus open slots.
 */
export function outlook(s: State, from: string, days: number, free: (date: string) => number, addDays: (d: string, n: number) => string, model: RiskModel): Outlook[] {
  const past = new Map<string, number>();
  for (const a of s.appts!) if (a.date < from && a.status !== "cancelled") past.set(a.date, (past.get(a.date) ?? 0) + 1);
  const recent = [...past.entries()].filter(([d]) => d >= addDays(from, -56));
  const weekday = (i: number) => { const xs = recent.filter(([d]) => dayIndex(d) === i).map(([, n]) => n); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i), mine = s.appts!.filter((a) => a.date === date);
    const booked = mine.filter((a) => a.status === "booked" || a.status === "checked_in" || a.status === "completed").length;
    const capacity = booked + free(date);
    const expected = Math.min(capacity, Math.max(booked, Math.round(weekday(dayIndex(date)))));
    const load = capacity ? expected / capacity : 0;
    const atRisk = mine.reduce((n, a) => n + (riskOf(model, a)?.p ?? 0), 0);
    return { date, capacity, booked, expected, load, label: !capacity ? "Closed" : load >= 0.85 ? "Busy" : load <= 0.35 ? "Quiet" : "Steady", atRisk: Math.round(atRisk * 10) / 10 };
  });
}
