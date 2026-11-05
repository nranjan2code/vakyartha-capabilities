// Local personal task planner. Tasks are the only canonical state; every view,
// count and spoken summary is derived from those records.
export interface Task {
  id: string; title: string; notes: string; dueDate: string; startTime: string; durationMin: number; priority: "high" | "normal" | "low";
  status: "open" | "done"; repeat: "none" | "daily" | "weekly" | "monthly";
  seriesId: string; seriesDay?: number; createdAt: string; completedAt: string; completedOn?: string;
}
export interface State { tasks?: Task[]; seq?: number; capture?: string; draft?: Partial<Task>; edit?: Partial<Task>; selectedId?: string; deleteId?: string; editDirty?: boolean; clearAsked?: boolean }
interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
interface Update { surface: string; nodes: Node[]; data: { op: "replace"; path: "/"; value: Record<string, unknown> }[] }
export interface Context { state: State; now?: () => Date }

const MAX_TASKS = 1000;
const line = (v: unknown, max = 240) => typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
const body = (v: unknown) => typeof v === "string" ? v.replace(/\r\n?/g, "\n").slice(0, 4000) : "";
const date = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v ? v : "";
const time = (v: unknown) => typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : "";
const duration = (v: unknown) => [15, 30, 45, 60, 90, 120].includes(Number(v)) ? Number(v) : 30;
const cadence = (v: unknown): Task["repeat"] => v === "daily" || v === "weekly" || v === "monthly" ? v : "none";
const priority = (v: unknown): Task["priority"] => v === "high" || v === "low" ? v : "normal";
const emptyDraft = (): Partial<Task> => ({ title: "", notes: "", dueDate: "", startTime: "", durationMin: 30, priority: "normal", repeat: "none" });

export function normalize(input: State): State {
  const tasks: Task[] = (Array.isArray(input?.tasks) ? input.tasks : []).slice(0, MAX_TASKS).flatMap((x): Task[] => {
    if (!x || typeof x !== "object" || typeof x.id !== "string" || !x.id) return [];
    const title = line(x.title); if (!title) return [];
    const status = x.status === "done" ? "done" : "open";
    const dueDate = date(x.dueDate), startTime = dueDate ? time(x.startTime) : "", repeat = cadence(x.repeat);
    return [{ id: x.id.slice(0, 64), title, notes: body(x.notes), dueDate, startTime, durationMin: duration(x.durationMin), priority: priority(x.priority), status,
      repeat, seriesId: typeof x.seriesId === "string" ? x.seriesId.slice(0, 64) : "", seriesDay: repeat === "monthly" ? (Number.isInteger(x.seriesDay) && Number(x.seriesDay) >= 1 && Number(x.seriesDay) <= 31 ? Number(x.seriesDay) : Number(dueDate.slice(8)) || 1) : 0,
      createdAt: typeof x.createdAt === "string" ? x.createdAt : "", completedAt: status === "done" && typeof x.completedAt === "string" ? x.completedAt : "", completedOn: status === "done" ? date(x.completedOn) || (typeof x.completedAt === "string" ? date(x.completedAt.slice(0, 10)) : "") : "" }];
  });
  const selectedId = tasks.some(t => t.id === input?.selectedId) ? input.selectedId : "";
  const d = input?.draft && typeof input.draft === "object" ? input.draft : {};
  return { tasks, seq: Number.isSafeInteger(input?.seq) && input!.seq! >= tasks.length ? input!.seq : tasks.length,
    capture: body(input?.capture), selectedId, deleteId: tasks.some(t => t.id === input?.deleteId) ? input.deleteId : "", editDirty: Boolean(selectedId && input?.editDirty), clearAsked: Boolean(input?.clearAsked) && tasks.some(t => t.status === "done"),
    draft: { title: line(d.title), notes: body(d.notes), dueDate: date(d.dueDate), startTime: time(d.startTime), durationMin: duration(d.durationMin), priority: priority(d.priority), repeat: cadence(d.repeat) },
    edit: selectedId ? { title: line(input?.edit?.title ?? tasks.find(t => t.id === selectedId)?.title), notes: body(input?.edit?.notes ?? tasks.find(t => t.id === selectedId)?.notes),
      dueDate: date(input?.edit?.dueDate ?? tasks.find(t => t.id === selectedId)?.dueDate), startTime: time(input?.edit?.startTime ?? tasks.find(t => t.id === selectedId)?.startTime), durationMin: duration(input?.edit?.durationMin ?? tasks.find(t => t.id === selectedId)?.durationMin), priority: priority(input?.edit?.priority ?? tasks.find(t => t.id === selectedId)?.priority), repeat: cadence(input?.edit?.repeat ?? tasks.find(t => t.id === selectedId)?.repeat) } : {} };
}
const nextId = (s: State) => `task-${(s.seq = (s.seq ?? 0) + 1)}`;
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
export function nextOccurrence(day: string, repeat: Task["repeat"], seriesDay?: number): string {
  if (!date(day) || repeat === "none") return "";
  const d = new Date(`${day}T00:00:00Z`);
  if (repeat === "daily") d.setUTCDate(d.getUTCDate() + 1);
  if (repeat === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  if (repeat === "monthly") { const original = Number.isInteger(seriesDay) && seriesDay! >= 1 && seriesDay! <= 31 ? seriesDay! : d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(original, last)); }
  return isoDay(d);
}
const label = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const overdue = (t: Task, today: string) => t.status === "open" && !!t.dueDate && t.dueDate < today;
const replace = (value: Record<string, unknown>) => [{ op: "replace" as const, path: "/" as const, value }];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const addDays = (day: string, n: number) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
/** The person's calendar day, read from their clock (due dates are date-only). */
export const localDay = (now: Date) => isoDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));

export interface Capture { title: string; dueDate: string; startTime: string; durationMin: number; priority: Task["priority"]; repeat: Task["repeat"]; understood: string[] }
/**
 * Quick capture understands the few phrases people type when jotting a task: a day
 * ("today", "tomorrow", "friday", "next week", "in 3 days", "12 nov", "2026-11-12"), a time
 * ("at 5pm", "17:30"), a length ("for 45 min"), a repeat ("every week") and a priority
 * ("!high", "!low", "urgent"). Fixed local rules: no model, nothing leaves the device.
 * The rest of the text is the title; the person sees what was understood before adding.
 */
export function parseCapture(text: string, today: string): Capture {
  let rest = ` ${line(text, 400)} `;
  const out: Capture = { title: "", dueDate: "", startTime: "", durationMin: 30, priority: "normal", repeat: "none", understood: [] };
  const take = (re: RegExp, use: (m: RegExpExecArray) => boolean | void) => { const m = re.exec(rest); if (m && use(m) !== false) rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length); };
  const W = "(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)";
  const dayOf = (w: string) => WEEKDAYS.findIndex(d => d.startsWith(w.toLowerCase().slice(0, 3)));
  const nextWeekday = (i: number, strict: boolean) => { let n = (i - weekday(today) + 7) % 7; if (n === 0 && strict) n = 7; return addDays(today, n); };
  take(new RegExp(`\\s(?:every|each)\\s+${W}\\b`, "i"), m => { out.repeat = "weekly"; out.dueDate = nextWeekday(dayOf(m[1]!), false); });
  take(/\s(?:every\s+day|everyday|daily)\b/i, () => { out.repeat = "daily"; });
  take(/\s(?:every\s+week|weekly)\b/i, () => { out.repeat = "weekly"; });
  take(/\s(?:every\s+month|monthly)\b/i, () => { out.repeat = "monthly"; });
  const on = "(?:\\s(?:on|by|due))?";
  if (!out.dueDate) take(new RegExp(`${on}\\s(\\d{4})-(\\d{2})-(\\d{2})\\b`, "i"), m => { const d = date(`${m[1]}-${m[2]}-${m[3]}`); if (!d) return false; out.dueDate = d; });
  if (!out.dueDate) take(new RegExp(`${on}\\s(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})[a-z]*|(${MONTHS.join("|")})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?)(?:,?\\s+(\\d{4}))?\\b`, "i"), m => {
    const day = Number(m[1] ?? m[4]), month = MONTHS.indexOf(String(m[2] ?? m[3]).toLowerCase()) + 1;
    let year = m[5] ? Number(m[5]) : Number(today.slice(0, 4));
    let d = date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    if (d && !m[5] && d < today) { year++; d = date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`); }
    if (!d) return false; out.dueDate = d;
  });
  if (!out.dueDate) take(/\s(?:the\s+)?day\s+after\s+tomorrow\b/i, () => { out.dueDate = addDays(today, 2); });
  if (!out.dueDate) take(/\s(?:tomorrow|tmrw|tmr)\b/i, () => { out.dueDate = addDays(today, 1); });
  if (!out.dueDate) take(/\s(?:today|tonight)\b/i, () => { out.dueDate = today; });
  if (!out.dueDate) take(/\s(?:in\s+(\d{1,3})\s+(day|week)s?)\b/i, m => { out.dueDate = addDays(today, Number(m[1]) * (m[2]!.toLowerCase() === "week" ? 7 : 1)); });
  if (!out.dueDate) take(/\snext\s+week\b/i, () => { out.dueDate = nextWeekday(1, true); });
  // Short forms ("sun", "sat", "wed") are ordinary words too, so they need "on", "next" and the like.
  if (!out.dueDate) take(new RegExp(`\\s(on|by|due|next|this)\\s+${W}\\b`, "i"), m => { out.dueDate = nextWeekday(dayOf(m[2]!), m[1]!.toLowerCase() === "next"); });
  if (!out.dueDate) take(/\s(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i, m => { out.dueDate = nextWeekday(dayOf(m[1]!), false); });
  take(/\s(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i, m => {
    let h = Number(m[1]); if (h < 1 || h > 12) return false;
    if (m[3]!.toLowerCase() === "pm" && h < 12) h += 12; if (m[3]!.toLowerCase() === "am" && h === 12) h = 0;
    out.startTime = `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
  });
  if (!out.startTime) take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i, m => { out.startTime = `${m[1]!.padStart(2, "0")}:${m[2]}`; });
  if (!out.startTime) take(/\sat\s+(noon|midday)\b/i, () => { out.startTime = "12:00"; });
  take(/\sfor\s+(\d{1,3})\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)\b/i, m => {
    const minutes = Number(m[1]) * (/^h/i.test(m[2]!) ? 60 : 1), allowed = [15, 30, 45, 60, 90, 120];
    out.durationMin = allowed.reduce((best, x) => Math.abs(x - minutes) < Math.abs(best - minutes) ? x : best, 30);
  });
  take(/\s(?:!high|!!|p1|urgent|asap)(?=\s)/i, () => { out.priority = "high"; });
  if (out.priority === "normal") take(/\s(?:!low|p3|someday)(?=\s)/i, () => { out.priority = "low"; });
  if (out.priority === "normal") take(/\s!(?=\s)/, () => { out.priority = "high"; });
  // A time or a repeat needs a day to sit on; the nearest is today.
  if ((out.startTime || out.repeat !== "none") && !out.dueDate) out.dueDate = today;
  out.title = rest.replace(/\s+/g, " ").trim().replace(/\s+(?:on|at|by|due|for|every)$/i, "").replace(/^(?:on|at|by|due)\s+/i, "").replace(/[,;:-]+$/, "").trim();
  if (out.dueDate) out.understood.push(`Due ${friendlyDay(out.dueDate, today)}`);
  if (out.startTime) out.understood.push(`at ${out.startTime}${out.durationMin !== 30 ? ` for ${out.durationMin} min` : ""}`);
  if (out.repeat !== "none") out.understood.push(`repeats ${out.repeat}`);
  if (out.priority !== "normal") out.understood.push(`${out.priority} priority`);
  return out;
}
/** Today, Tomorrow, Yesterday, "Fri 7 Nov" within a week, else "7 Nov" (with the year when it differs). */
export function friendlyDay(day: string, today: string): string {
  if (!date(day)) return "";
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  const d = new Date(`${day}T00:00:00Z`), short = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]![0]!.toUpperCase()}${MONTHS[d.getUTCMonth()]!.slice(1)}`;
  if (day > today && day < addDays(today, 7)) return `${WEEKDAYS[d.getUTCDay()]!.slice(0, 1).toUpperCase()}${WEEKDAYS[d.getUTCDay()]!.slice(1, 3)} ${short}`;
  return day.slice(0, 4) === today.slice(0, 4) ? short : `${short} ${day.slice(0, 4)}`;
}

export async function handleAction(controlId: string, value: unknown, context: Context, action?: string) {
  const s = context.state = normalize(context.state), now = context.now?.() ?? new Date(), today = localDay(now);
  const id = value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : "";
  const task = s.tasks!.find(t => t.id === id);
  let leftDetails = false;
  if (!action) {
    if (controlId === "/capture") s.capture = body(value);
    else if (controlId === "/draft/title") s.draft!.title = line(value);
    else if (controlId === "/draft/notes") s.draft!.notes = body(value);
    else if (controlId === "/draft/dueDate") s.draft!.dueDate = date(value);
    else if (controlId === "/draft/startTime") s.draft!.startTime = time(value);
    else if (controlId === "/draft/durationMin") s.draft!.durationMin = duration(value);
    else if (controlId === "/draft/priority") s.draft!.priority = priority(value);
    else if (controlId === "/draft/repeat") s.draft!.repeat = cadence(value);
    else if (controlId === "/edit/title") { s.edit!.title = line(value); s.editDirty = true; }
    else if (controlId === "/edit/notes") { s.edit!.notes = body(value); s.editDirty = true; }
    else if (controlId === "/edit/dueDate") { s.edit!.dueDate = date(value); s.editDirty = true; }
    else if (controlId === "/edit/startTime") { s.edit!.startTime = time(value); s.editDirty = true; }
    else if (controlId === "/edit/durationMin") { s.edit!.durationMin = duration(value); s.editDirty = true; }
    else if (controlId === "/edit/priority") { s.edit!.priority = priority(value); s.editDirty = true; }
    else if (controlId === "/edit/repeat") { s.edit!.repeat = cadence(value); s.editDirty = true; }
    else if (controlId.startsWith("/spoken/")) { /* derived */ }
    else throw new Error(`Unknown task field: ${controlId}`);
  } else if (action === "capture_task") {
    const parsed = parseCapture(s.capture ?? "", today), title = parsed.title || line(s.capture);
    if (!title) throw new Error("Enter a task first");
    if (s.tasks!.length >= MAX_TASKS) throw new Error(`Task Planner keeps up to ${MAX_TASKS} tasks; delete completed tasks first`);
    if (parsed.startTime && Number(parsed.startTime.slice(0, 2)) * 60 + Number(parsed.startTime.slice(3)) + parsed.durationMin > 1440) throw new Error("The time block must end before midnight");
    const taskId = nextId(s);
    s.tasks!.unshift({ id: taskId, title, notes: "", dueDate: parsed.dueDate, startTime: parsed.startTime, durationMin: parsed.durationMin, priority: parsed.priority, status: "open", repeat: parsed.repeat,
      seriesId: parsed.repeat === "none" ? "" : taskId, seriesDay: parsed.repeat === "monthly" ? Number(parsed.dueDate.slice(8)) || 1 : 0, createdAt: now.toISOString(), completedAt: "", completedOn: "" });
    s.capture = "";
  } else if (action === "save_task") {
    const title = line(s.draft?.title); if (!title) throw new Error("Add a task title before saving");
    if (s.tasks!.length >= MAX_TASKS) throw new Error(`Task Planner keeps up to ${MAX_TASKS} tasks; delete completed tasks first`);
    const taskId = nextId(s), repeat = cadence(s.draft?.repeat);
    const dueDate = date(s.draft?.dueDate), requestedTime = time(s.draft?.startTime);
    if (requestedTime && !dueDate) throw new Error("Add a due date before scheduling a start time");
    const startTime = dueDate ? requestedTime : "";
    if (startTime && Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + duration(s.draft?.durationMin) > 1440) throw new Error("The time block must end before midnight");
    s.tasks!.unshift({ id: taskId, title, notes: body(s.draft?.notes), dueDate, startTime, durationMin: duration(s.draft?.durationMin), priority: priority(s.draft?.priority), status: "open", repeat, seriesId: repeat === "none" ? "" : taskId, seriesDay: repeat === "monthly" ? Number(dueDate.slice(8)) || 1 : 0, createdAt: now.toISOString(), completedAt: "", completedOn: "" });
    s.draft = emptyDraft(); s.selectedId = taskId;
  } else if (action === "select_task") {
    if (!task) throw new Error("That task no longer exists");
    if (s.editDirty && s.selectedId !== task.id) throw new Error("Save or discard the current task edits before opening another task");
    s.selectedId = task.id; s.editDirty = false; s.edit = { title: task.title, notes: task.notes, dueDate: task.dueDate, startTime: task.startTime, durationMin: task.durationMin, priority: task.priority, repeat: task.repeat };
  } else if (action === "new_task") {
    if (s.editDirty) throw new Error("Save or discard the current task edits before adding another task");
    s.selectedId = ""; s.edit = {}; s.draft = emptyDraft();
  } else if (action === "discard_edits") {
    const selected = s.tasks!.find(t => t.id === s.selectedId); if (!selected) throw new Error("That task no longer exists");
    s.editDirty = false; s.edit = { title: selected.title, notes: selected.notes, dueDate: selected.dueDate, startTime: selected.startTime, durationMin: selected.durationMin, priority: selected.priority, repeat: selected.repeat };
  } else if (action === "save_selected") {
    const selected = s.tasks!.find(t => t.id === s.selectedId);
    if (!selected) throw new Error("That task no longer exists");
    const title = line(s.edit?.title); if (!title) throw new Error("Add a task title before saving");
    const dueDate = date(s.edit?.dueDate), requestedTime = time(s.edit?.startTime);
    if (requestedTime && !dueDate) throw new Error("Add a due date before scheduling a start time");
    const startTime = dueDate ? requestedTime : "";
    if (startTime && Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + duration(s.edit?.durationMin) > 1440) throw new Error("The time block must end before midnight");
    selected.title = title; selected.notes = body(s.edit?.notes); selected.dueDate = dueDate; selected.startTime = startTime; selected.durationMin = duration(s.edit?.durationMin);
    selected.priority = priority(s.edit?.priority); selected.repeat = cadence(s.edit?.repeat); selected.seriesDay = selected.repeat === "monthly" ? Number(selected.dueDate.slice(8)) || 1 : 0;
    s.editDirty = false;
    if (selected.repeat !== "none" && !selected.seriesId) selected.seriesId = selected.id;
  } else if (action === "toggle_done") {
    if (!task) throw new Error("That task no longer exists");
    if (task.status === "open") {
      if (task.repeat !== "none" && task.dueDate && s.tasks!.length >= MAX_TASKS) throw new Error(`Task Planner keeps up to ${MAX_TASKS} tasks; delete completed tasks before completing a recurring task`);
      task.status = "done"; task.completedAt = now.toISOString(); task.completedOn = today;
      if (task.repeat !== "none" && task.dueDate) {
        const newId = nextId(s); s.tasks!.unshift({ ...task, id: newId, dueDate: nextOccurrence(task.dueDate, task.repeat, task.seriesDay), status: "open", completedAt: "", completedOn: "", createdAt: now.toISOString() });
      }
    } else { task.status = "open"; task.completedAt = ""; task.completedOn = ""; }
  } else if (action === "snooze") {
    if (!task || task.status !== "open") throw new Error("That task is no longer open");
    if (s.editDirty && s.selectedId === task.id) throw new Error("Save or discard the current task edits before moving it");
    const to = (value as { to?: unknown })?.to;
    task.dueDate = to === "next_week" ? addDays(today, ((8 - weekday(today)) % 7) || 7) : addDays(today, 1);
    if (task.repeat === "monthly") task.seriesDay = Number(task.dueDate.slice(8));
    if (s.selectedId === task.id) s.edit = { ...s.edit, dueDate: task.dueDate };
  } else if (action === "ask_clear_completed") {
    if (!s.tasks!.some(t => t.status === "done")) throw new Error("There are no completed tasks to clear");
    s.clearAsked = true;
  } else if (action === "cancel_clear_completed") s.clearAsked = false;
  else if (action === "confirm_clear_completed") {
    if (!s.clearAsked) throw new Error("Review the completed tasks before clearing them");
    if (s.tasks!.some(t => t.status === "done" && t.id === s.selectedId)) { s.selectedId = ""; s.edit = {}; s.editDirty = false; }
    s.tasks = s.tasks!.filter(t => t.status !== "done"); s.clearAsked = false;
  } else if (action === "ask_delete") {
    if (!task) throw new Error("That task no longer exists"); s.deleteId = task.id;
  } else if (action === "cancel_delete") s.deleteId = "";
  else if (action === "confirm_delete") {
    if (!task || s.deleteId !== task.id) throw new Error("Review the task again before deleting it");
    s.tasks = s.tasks!.filter(t => t.id !== task.id); if (s.selectedId === id) { s.selectedId = ""; s.edit = {}; s.editDirty = false; leftDetails = true; } s.deleteId = "";
  } else if (action === "delete_task") throw new Error("Review the task before confirming deletion");
  else throw new Error(`Unknown task action: ${action}`);
  return { updates: view(s, today), ...(action === "select_task" || action === "new_task" ? { focusSurface: "details" } : action === "save_task" || leftDetails ? { focusSurface: "main" } : {}) };
}

function endTime(start: string, minutes: number) {
  if (!time(start)) return "";
  const end = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + minutes;
  return end < 1440 ? `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}` : "";
}
function taskRows(tasks: Task[], today: string) {
  return tasks.map(t => {
    const late = overdue(t, today);
    const dateLabel = t.status === "done" ? `Completed ${friendlyDay(t.completedOn || t.completedAt.slice(0, 10), today) || ""}`.trim()
      : t.dueDate ? `${late ? "Overdue · " : ""}${friendlyDay(t.dueDate, today)}${t.startTime ? ` · ${t.startTime}–${endTime(t.startTime, t.durationMin)}` : ""}` : "No date";
    const priorityLabel = t.priority === "high" ? "High priority" : t.priority === "low" ? "Low priority" : "";
    return { id: t.id, title: t.title, notes: t.notes, dueDate: t.dueDate, dateLabel, priorityLabel, meta: [dateLabel, priorityLabel].filter(Boolean).join(" · "),
      repeatLabel: t.repeat === "none" ? "" : `Repeats ${t.repeat}`, overdue: late, done: t.status === "done",
      // Moving to tomorrow is offered where it helps: late, due today, or not yet dated.
      canSnooze: t.status === "open" && (late || t.dueDate === today || !t.dueDate),
      tone: t.status === "done" ? "success" : late ? "danger" : t.priority === "high" ? "warning" : "neutral" };
  });
}
const rank = { high: 0, normal: 1, low: 2 } as const;
/** What to do next first: late, then by day and time, then priority; undated last, high priority first. */
const byUrgency = (a: Task, b: Task) => (a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1) || a.dueDate.localeCompare(b.dueDate)
  || (a.startTime || "99").localeCompare(b.startTime || "99") || rank[a.priority] - rank[b.priority] || b.createdAt.localeCompare(a.createdAt);
export function view(input: State, today = localDay(new Date())): Update[] {
  const s = normalize(input), tasks = s.tasks!, open = tasks.filter(t => t.status === "open").sort(byUrgency);
  const done = tasks.filter(t => t.status === "done").sort((a, b) => (b.completedAt || b.completedOn || "").localeCompare(a.completedAt || a.completedOn || ""));
  const dueToday = open.filter(t => t.dueDate === today), overdueTasks = open.filter(t => overdue(t, today));
  const upcoming = open.filter(t => t.dueDate > today);
  const capture = s.capture ? parseCapture(s.capture, today) : undefined;
  const capturePreview = capture?.title ? `Adds “${capture.title}”${capture.understood.length ? ` · ${capture.understood.join(" · ")}` : ""}` : "";
  const trendLabels: string[] = [], trendValues: number[] = [];
  const anchor = new Date(`${today}T00:00:00Z`);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(anchor); d.setUTCDate(d.getUTCDate() - i); const day = isoDay(d);
    trendLabels.push(day.slice(5)); trendValues.push(done.filter(t => (t.completedOn || t.completedAt.slice(0, 10)) === day).length);
  }
  const selected = tasks.find(t => t.id === s.selectedId);
  const urgent = [...overdueTasks, ...dueToday].slice(0, 3).map(t => `${t.title}, ${overdue(t, today) ? "overdue" : "due today"}${t.startTime ? ` at ${t.startTime}` : ""}`).join(". ");
  const nextUp = upcoming.slice(0, 2).map(t => `${t.title}, due ${friendlyDay(t.dueDate, today).toLowerCase().replace(/^(mon|tue|wed|thu|fri|sat|sun) /, "")}${t.startTime ? ` at ${t.startTime}` : ""}`).join(". ");
  const unscheduled = open.filter(t => !t.dueDate).slice(0, 2).map(t => t.title).join(". ");
  const spoken = open.length === 0 ? (done.length ? `No open tasks. ${label(done.length, "task")} completed.` : "No tasks saved yet. Add one with quick capture.")
    : `${label(open.length, "open task")}. ${overdueTasks.length ? `${label(overdueTasks.length, "task")} overdue. ` : ""}${dueToday.length ? `${label(dueToday.length, "task")} due today. ` : "Nothing due today. "}${urgent ? `First up: ${urgent}. ` : ""}${nextUp ? `Coming up: ${nextUp}.` : ""}${!urgent && !nextUp && unscheduled ? `Without a date: ${unscheduled}.` : ""}`;
  const data = { capture: s.capture ?? "", draft: s.draft ?? emptyDraft(), edit: s.edit ?? {}, editDirty: Boolean(s.editDirty),
    today: taskRows([...overdueTasks, ...dueToday.filter(t => !overdue(t, today))], today), upcoming: taskRows(upcoming, today), all: taskRows(open, today), completed: taskRows(done, today),
    noToday: overdueTasks.length + dueToday.length === 0, noUpcoming: upcoming.length === 0, noOpen: open.length === 0, noDone: done.length === 0, hasDone: done.length > 0,
    capturePreview, clearAsked: Boolean(s.clearAsked), canAskClear: done.length > 0 && !s.clearAsked,
    counts: { open: open.length, done: done.length, overdue: overdueTasks.length, today: dueToday.length, upcoming: upcoming.length },
    todayDate: today,
    chart: { statusLabels: ["Open", "Completed"], statusSeries: [{ name: "Tasks", values: [open.length, done.length] }], trendLabels, trendSeries: [{ name: "Completed", values: trendValues }] },
    summary: `${label(open.length, "open task")} · ${label(dueToday.length, "due today")} · ${label(overdueTasks.length, "overdue")}`,
    calendarEvents: open.filter(t => t.dueDate).map(t => ({ title: t.title, date: t.dueDate, ...(t.startTime ? { start: t.startTime, end: endTime(t.startTime, t.durationMin) } : {}), note: `${t.priority === "high" ? "High priority · " : ""}${t.repeat !== "none" ? `Repeats ${t.repeat}` : ""}`.trim(), tone: overdue(t, today) ? "danger" : t.priority === "high" ? "warning" : "info" })),
    selected: selected ? { id: selected.id, status: selected.status, doneLabel: selected.status === "done" ? "Reopen" : "Complete", confirmDelete: selected.id === s.deleteId, canAskDelete: selected.id !== s.deleteId, canSnooze: selected.status === "open" } : null,
    spoken: { summary: spoken } };
  const detailRecord = selected ? (s.edit ?? selected) : (s.draft ?? emptyDraft());
  const detailTitle = line(detailRecord.title);
  const detailSpoken = !detailTitle ? "No task details yet. Add a title, then save the task." : [
    selected ? `Task: ${detailTitle}.` : `Unsaved task draft: ${detailTitle}.`,
    detailRecord.dueDate ? `Due ${detailRecord.dueDate}.` : "No due date.",
    detailRecord.startTime ? `Scheduled from ${detailRecord.startTime} for ${duration(detailRecord.durationMin)} minutes.` : "No time block.",
    `Priority ${priority(detailRecord.priority)}.`,
    cadence(detailRecord.repeat) === "none" ? "Does not repeat." : `Repeats ${cadence(detailRecord.repeat)} after completion.`,
    selected ? (selected.status === "done" ? "Marked complete." : "Still open.") : "Not saved yet.",
    body(detailRecord.notes) ? `Notes: ${body(detailRecord.notes)}` : "No notes.",
  ].filter(Boolean).join(" ");
  const taskList = (id: string, path: string): Node[] => [
    { id, type: "stack", props: { gap: "sm" }, children: { each: path, template: "task-row" } },
    { id: "task-row", type: "card", props: { title: "{title}", subtitle: "{meta}", body: "{notes}", badge: "{repeatLabel}", tone: "{tone}" }, children: ["task-actions"] },
    { id: "task-actions", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["task-done", "task-snooze", "task-select", "task-delete", "confirm-delete", "cancel-delete"] },
    { id: "task-done", type: "button", props: { label: "{doneLabel}", action: "toggle_done", payload: { id: "{id}" }, style: "secondary" } },
    { id: "task-snooze", type: "button", props: { label: "Tomorrow", action: "snooze", payload: { id: "{id}", to: "tomorrow" }, style: "link", visibleIf: "{canSnooze}" } },
    { id: "task-select", type: "button", props: { label: "Edit", action: "select_task", payload: { id: "{id}" }, style: "link" } },
    { id: "task-delete", type: "button", props: { label: "Delete", action: "ask_delete", payload: { id: "{id}" }, style: "link", visibleIf: "{canAskDelete}" } },
    { id: "confirm-delete", type: "button", props: { label: "Confirm delete", action: "confirm_delete", payload: { id: "{id}" }, style: "danger", visibleIf: "{confirmDelete}" } },
    { id: "cancel-delete", type: "button", props: { label: "Keep task", action: "cancel_delete", style: "secondary", visibleIf: "{confirmDelete}" } },
  ];
  // Add the dynamic action label to every row without creating parallel records.
  for (const key of ["today", "upcoming", "all", "completed"] as const) for (const row of data[key]) {
    (row as typeof row & { doneLabel: string; confirmDelete: boolean; canAskDelete: boolean }).doneLabel = row.done ? "Reopen" : "Complete";
    (row as typeof row & { confirmDelete: boolean }).confirmDelete = row.id === s.deleteId;
    (row as typeof row & { canAskDelete: boolean }).canAskDelete = row.id !== s.deleteId;
  }
  const tabs: Node[] = [
    { id: "root", type: "stack", props: { gap: "md" }, children: ["summary", "capture", "capture-bar", "tabbed"] },
    { id: "summary", type: "text", props: { content: "{/summary}", variant: "caption" } },
    { id: "capture", type: "form", props: { submit: "capture_task", submitLabel: "Add task" }, children: ["capture-input", "capture-preview"] },
    { id: "capture-input", type: "input", props: { label: "Quick capture", bind: "/capture", placeholder: "Call the bank tomorrow at 5pm !high" } },
    { id: "capture-preview", type: "text", props: { content: "{/capturePreview}", variant: "caption", visibleIf: "{/capturePreview}" } },
    { id: "capture-bar", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["capture-dictate", "new-task", "capture-help"] },
    { id: "capture-dictate", type: "button", props: { label: "Dictate", action: "voice.dictate", payload: { into: "capture-input" }, style: "secondary" } },
    { id: "new-task", type: "button", props: { label: "Add with details", action: "new_task", style: "secondary" } },
    { id: "capture-help", type: "text", props: { content: "Type a day, time, repeat or priority with the task: friday, 12 nov, at 9:30, for 1h, every week, !high.", variant: "caption" } },
    { id: "tabbed", type: "tabs", props: {}, children: ["today-panel", "upcoming-panel", "all-panel", "completed-panel", "insights-panel"] },
    { id: "today-panel", type: "section", props: { title: overdueTasks.length + dueToday.length ? `Today · ${overdueTasks.length + dueToday.length}` : "Today", description: "{/counts/today} due today · {/counts/overdue} overdue" }, children: ["today-list", "today-empty"] },
    { id: "today-list", type: "stack", props: { gap: "sm" }, children: { each: "/today", template: "task-row" } },
    { id: "today-empty", type: "text", props: { content: "Nothing is due today. Tasks with today's date or an earlier one appear here.", variant: "caption", visibleIf: "{/noToday}" } },
    { id: "upcoming-panel", type: "section", props: { title: upcoming.length ? `Upcoming · ${upcoming.length}` : "Upcoming", description: "Dated tasks by month, week, day or agenda, then the list in date order." }, children: ["calendar", "upcoming-list", "upcoming-empty"] },
    { id: "calendar", type: "calendar", props: { events: "{/calendarEvents}", view: "month", date: "{/todayDate}" } },
    { id: "upcoming-list", type: "stack", props: { gap: "sm" }, children: { each: "/upcoming", template: "task-row" } },
    { id: "upcoming-empty", type: "text", props: { content: "No future tasks yet. Add a day such as friday or 12 nov to place one on the calendar.", variant: "caption", visibleIf: "{/noUpcoming}" } },
    { id: "all-panel", type: "section", props: { title: open.length ? `All open · ${open.length}` : "All open", description: "Late first, then by day, time and priority; undated tasks last." }, children: ["all-list", "all-empty"] },
    { id: "all-list", type: "stack", props: { gap: "sm" }, children: { each: "/all", template: "task-row" } },
    { id: "all-empty", type: "text", props: { content: "No open tasks. Quick capture is ready when you need it.", variant: "caption", visibleIf: "{/noOpen}" } },
    { id: "completed-panel", type: "section", props: { title: "Completed", description: "{/counts/done} completed, newest first" }, children: ["completed-list", "completed-empty", "clear-bar"] },
    { id: "completed-list", type: "stack", props: { gap: "sm" }, children: { each: "/completed", template: "task-row" } },
    { id: "completed-empty", type: "text", props: { content: "Completed tasks will appear here.", variant: "caption", visibleIf: "{/noDone}" } },
    { id: "clear-bar", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["clear-ask", "clear-confirm", "clear-cancel"] },
    { id: "clear-ask", type: "button", props: { label: "Clear completed", action: "ask_clear_completed", style: "link", visibleIf: "{/canAskClear}" } },
    { id: "clear-confirm", type: "button", props: { label: "Delete {/counts/done} completed tasks", action: "confirm_clear_completed", style: "danger", visibleIf: "{/clearAsked}" } },
    { id: "clear-cancel", type: "button", props: { label: "Keep them", action: "cancel_clear_completed", style: "secondary", visibleIf: "{/clearAsked}" } },
    { id: "insights-panel", type: "section", props: { title: "Insights", description: "Counts come directly from saved task records; no scores or estimates." }, children: ["status-chart", "trend-chart"] },
    { id: "status-chart", type: "chart", props: { kind: "bar", title: "Open and completed", labels: "{/chart/statusLabels}", series: "{/chart/statusSeries}", height: "sm" } },
    { id: "trend-chart", type: "chart", props: { kind: "line", title: "Completed each day · last 14 days", labels: "{/chart/trendLabels}", series: "{/chart/trendSeries}", height: "sm" } },
    ...taskList("unused-list", "/all"),
  ];
  // Shared repeated nodes use stable IDs; one repeater template is reused by tabs.
  tabs.splice(tabs.findIndex(n => n.id === "unused-list"), 1);
  const detailNodes: Node[] = [
    { id: "root", type: "stack", props: { gap: "md" }, children: selected ? ["selected-form", "selected-controls", "read-detail"] : ["new-form", "read-detail"] },
    ...(selected ? [
      { id: "selected-form", type: "form", props: { submit: "save_selected", submitLabel: "Save changes" }, children: ["selected-title", "dictate-selected-title", "selected-date", "selected-time", "selected-duration", "selected-priority", "selected-repeat", "selected-notes", "dictate-selected-notes"] },
      { id: "selected-title", type: "input", props: { label: "Task", bind: "/edit/title" } },
      { id: "dictate-selected-title", type: "button", props: { label: "Dictate task title", action: "voice.dictate", payload: { into: "selected-title" }, style: "secondary" } },
      { id: "selected-date", type: "date", props: { label: "Due date", bind: "/edit/dueDate" } },
      { id: "selected-time", type: "input", props: { label: "Start time", kind: "time", bind: "/edit/startTime" } },
      { id: "selected-duration", type: "select", props: { label: "Time block", bind: "/edit/durationMin", options: [{ label: "15 minutes", value: "15" }, { label: "30 minutes", value: "30" }, { label: "45 minutes", value: "45" }, { label: "1 hour", value: "60" }, { label: "1.5 hours", value: "90" }, { label: "2 hours", value: "120" }] } },
      { id: "selected-priority", type: "select", props: { label: "Priority", bind: "/edit/priority", options: [{ label: "Normal", value: "normal" }, { label: "High", value: "high" }, { label: "Low", value: "low" }] } },
      { id: "selected-repeat", type: "select", props: { label: "Repeat after completion", bind: "/edit/repeat", options: [{ label: "Never", value: "none" }, { label: "Daily", value: "daily" }, { label: "Weekly", value: "weekly" }, { label: "Monthly", value: "monthly" }] } },
      { id: "selected-notes", type: "textarea", props: { label: "Notes", bind: "/edit/notes" } },
      { id: "dictate-selected-notes", type: "button", props: { label: "Dictate notes", action: "voice.dictate", payload: { into: "selected-notes" }, style: "secondary" } },
      { id: "selected-controls", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["selected-done", "selected-snooze", "back-to-tasks", "discard-edits", "selected-delete", "selected-confirm-delete", "selected-cancel-delete"] },
      { id: "selected-done", type: "button", props: { label: "{/selected/doneLabel}", action: "toggle_done", payload: { id: selected.id }, style: "secondary" } },
      { id: "selected-snooze", type: "button", props: { label: "Move to tomorrow", action: "snooze", payload: { id: selected.id, to: "tomorrow" }, style: "link", visibleIf: "{/selected/canSnooze}" } },
      { id: "selected-delete", type: "button", props: { label: "Delete", action: "ask_delete", payload: { id: selected.id }, style: "link", visibleIf: "{/selected/canAskDelete}" } },
      { id: "selected-confirm-delete", type: "button", props: { label: "Confirm delete", action: "confirm_delete", payload: { id: selected.id }, style: "danger", visibleIf: "{/selected/confirmDelete}" } },
      { id: "selected-cancel-delete", type: "button", props: { label: "Keep task", action: "cancel_delete", style: "secondary", visibleIf: "{/selected/confirmDelete}" } },
      { id: "back-to-tasks", type: "button", props: { label: "Back to tasks", action: "view.open", payload: { surface: "main" }, style: "secondary" } },
      { id: "discard-edits", type: "button", props: { label: "Discard unsaved edits", action: "discard_edits", style: "link", visibleIf: "{/editDirty}" } },
    ] : [
      { id: "new-form", type: "form", props: { submit: "save_task", submitLabel: "Save task" }, children: ["new-title", "dictate-new-title", "new-date", "new-time", "new-duration", "new-priority", "new-repeat", "new-notes", "dictate-new-notes"] },
      { id: "new-title", type: "input", props: { label: "Task", bind: "/draft/title", placeholder: "A clear next action" } },
      { id: "dictate-new-title", type: "button", props: { label: "Dictate task title", action: "voice.dictate", payload: { into: "new-title" }, style: "secondary" } },
      { id: "new-date", type: "date", props: { label: "Due date", bind: "/draft/dueDate" } },
      { id: "new-time", type: "input", props: { label: "Start time", kind: "time", bind: "/draft/startTime" } },
      { id: "new-duration", type: "select", props: { label: "Time block", bind: "/draft/durationMin", options: [{ label: "15 minutes", value: "15" }, { label: "30 minutes", value: "30" }, { label: "45 minutes", value: "45" }, { label: "1 hour", value: "60" }, { label: "1.5 hours", value: "90" }, { label: "2 hours", value: "120" }] } },
      { id: "new-priority", type: "select", props: { label: "Priority", bind: "/draft/priority", options: [{ label: "Normal", value: "normal" }, { label: "High", value: "high" }, { label: "Low", value: "low" }] } },
      { id: "new-repeat", type: "select", props: { label: "Repeat after completion", bind: "/draft/repeat", options: [{ label: "Never", value: "none" }, { label: "Daily", value: "daily" }, { label: "Weekly", value: "weekly" }, { label: "Monthly", value: "monthly" }] } },
      { id: "new-notes", type: "textarea", props: { label: "Notes", bind: "/draft/notes", placeholder: "Optional context" } },
      { id: "dictate-new-notes", type: "button", props: { label: "Dictate notes", action: "voice.dictate", payload: { into: "new-notes" }, style: "secondary" } },
    ]),
    { id: "read-detail", type: "button", props: { label: "Read task aloud", action: "voice.read", payload: { text: "/spoken/detail" }, style: "secondary" } },
  ];
  const main: Update = { surface: "main", nodes: tabs, data: replace(data) };
  const detailData = { draft: data.draft, spoken: { detail: detailSpoken }, ...(selected ? { edit: data.edit, selected: data.selected } : {}) };
  return [main, { surface: "details", nodes: detailNodes, data: replace(detailData) }];
}
export const surfaceFile = () => view({}, "2000-01-01").map(u => ({ id: u.surface, title: u.surface === "main" ? "Tasks" : "Task details", data: u.data[0]!.value, nodes: u.nodes }));
export async function renderApp(context: Context) { return { updates: view(normalize(context.state)) }; }
