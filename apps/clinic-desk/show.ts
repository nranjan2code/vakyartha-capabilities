// The day as a programme: Listen reads it and Watch shows it, from the same
// records as the Schedule (see docs/features/PROGRAMMES.md). It is built from
// plain facts handed in by server.ts, so it never says anything the screen does not.
// Patients are named by first name and initial: Watch may be on a shared screen.

export interface ShowAppt { time: string; who: string; doctor: string; reason: string; status: string; note: string }
export interface ShowDoctor { name: string; seen: number; first: string; last: string }
export interface ShowInput {
  clinic: string; when: string; counts: { waiting: number; checkedIn: number; completed: number; free: number; missed: number };
  appts: ShowAppt[]; doctors: ShowDoctor[]; risky: ShowAppt[]; expectedMisses: number;
  week: { label: string; load: number; word: string }[]; nextFree: string;
}

type Segment = Record<string, unknown>;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const spoken = (t: string) => { const h = Number(t.slice(0, 2)); return `${h % 12 || 12}:${t.slice(3)} ${h < 12 ? "AM" : "PM"}`; };
const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export function programme(i: ShowInput) {
  const live = i.appts.filter((a) => a.status !== "Cancelled");
  const segments: Segment[] = [];
  const figures = [
    { label: "Waiting", value: String(i.counts.waiting) }, { label: "Checked in", value: String(i.counts.checkedIn) },
    { label: "Completed", value: String(i.counts.completed) }, { label: "Free slots", value: String(i.counts.free) },
  ];
  if (!live.length) {
    segments.push({ delivery: "opening", cue: "intro", kicker: "Day brief", heading: i.clinic, figures,
      text: `${i.when} there are no appointments at ${i.clinic}. ${i.counts.free ? `${plural(i.counts.free, "slot")} ${i.counts.free === 1 ? "is" : "are"} open.` : "No doctor is available that day."}` });
  } else {
    segments.push({ delivery: "opening", cue: "intro", kicker: "Day brief", heading: `${i.when} at ${i.clinic}`, figures,
      text: `${i.when} at ${i.clinic}: ${plural(live.length, "appointment")} with ${plural(i.doctors.length, "doctor")}. ${i.counts.waiting} still waiting, ${i.counts.checkedIn} checked in, ${i.counts.completed} completed and ${plural(i.counts.free, "slot")} open.` });
    for (const d of i.doctors.slice(0, 8)) {
      const mine = live.filter((a) => a.doctor === d.name);
      segments.push({ delivery: "story", break: "story", kicker: "Doctor", heading: d.name,
        figures: [{ label: "Patients", value: String(d.seen) }, { label: "First", value: spoken(d.first) }, { label: "Last", value: spoken(d.last) }],
        text: `${d.name} sees ${plural(d.seen, "patient")}, from ${spoken(d.first)} to ${spoken(d.last)}. ${mine.slice(0, 5).map((a) => `${spoken(a.time)}, ${a.who}${a.reason ? ` for ${a.reason}` : ""}.`).join(" ")}${mine.length > 5 ? ` And ${mine.length - 5} more.` : ""}` });
    }
    if (i.risky.length) segments.push({ delivery: "aside", break: "story", kicker: "Worth a call", heading: "Likely to miss",
      text: `${plural(i.risky.length, "appointment")} ${i.risky.length === 1 ? "carries" : "carry"} a higher chance of being missed, judged from this clinic's own history: ${list(i.risky.slice(0, 4).map((a) => `${a.who} at ${spoken(a.time)}`))}. A reminder call is worthwhile.` });
    else if (i.expectedMisses >= 1) segments.push({ delivery: "aside", break: "short", kicker: "Attendance", heading: "Expected misses", text: `Across the day, about ${Math.round(i.expectedMisses)} ${Math.round(i.expectedMisses) === 1 ? "patient" : "patients"} may not attend.` });
  }
  if (i.week.some((d) => d.word !== "Closed")) {
    const busy = i.week.filter((d) => d.word === "Busy").map((d) => d.label), quiet = i.week.filter((d) => d.word === "Quiet").map((d) => d.label);
    segments.push({ delivery: "story", break: "section", kicker: "Week ahead", heading: "How full the week is",
      chart: { kind: "bars", title: "Booked share of each day's slots", unit: "%", bars: i.week.map((d) => ({ label: d.label.slice(0, 3), value: Math.round(d.load * 100) })) },
      text: `${busy.length ? `Busiest: ${list(busy)}.` : "No day is close to full."} ${quiet.length ? `Quietest: ${list(quiet)}.` : ""}${i.nextFree ? ` Next free slot: ${i.nextFree}.` : ""}`.trim() });
  }
  segments.push({ delivery: "closing", cue: "outro", break: "section", kicker: "Sign off", heading: i.clinic, text: `That is ${i.when.toLowerCase()} at ${i.clinic}.` });
  return {
    title: `${i.clinic}: ${i.when}`, badge: i.when === "Today" ? "Today" : undefined, segments,
    ticker: live.filter((a) => a.status === "Booked" || a.status === "Checked in").slice(0, 12).map((a) => ({ kicker: spoken(a.time), text: `${a.who} with ${a.doctor}${a.reason ? `, ${a.reason}` : ""}` })),
  };
}
