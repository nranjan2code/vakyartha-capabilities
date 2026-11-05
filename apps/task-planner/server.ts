// Local personal task planner. Tasks are the only canonical state; every view,
// count and spoken summary is derived from those records.
export interface Task {
  id: string; title: string; notes: string; dueDate: string; startTime: string; durationMin: number; priority: "high" | "normal" | "low";
  status: "open" | "done"; repeat: "none" | "daily" | "weekly" | "monthly";
  seriesId: string; seriesDay?: number; createdAt: string; completedAt: string; completedOn?: string;
}
export interface State { tasks?: Task[]; seq?: number; capture?: string; draft?: Partial<Task>; edit?: Partial<Task>; selectedId?: string; deleteId?: string; editDirty?: boolean }
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
    capture: body(input?.capture), selectedId, deleteId: tasks.some(t => t.id === input?.deleteId) ? input.deleteId : "", editDirty: Boolean(selectedId && input?.editDirty),
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
const dayName = (day: string, today: string) => day === today ? "Today" : day;
const replace = (value: Record<string, unknown>) => [{ op: "replace" as const, path: "/" as const, value }];

export async function handleAction(controlId: string, value: unknown, context: Context, action?: string) {
  const s = context.state = normalize(context.state), now = context.now?.() ?? new Date(), today = isoDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  const id = value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : "";
  const task = s.tasks!.find(t => t.id === id);
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
    const title = line(s.capture); if (!title) throw new Error("Enter a task first");
    if (s.tasks!.length >= MAX_TASKS) throw new Error(`Task Planner keeps up to ${MAX_TASKS} tasks; delete completed tasks first`);
    const taskId = nextId(s); s.tasks!.unshift({ id: taskId, title, notes: "", dueDate: "", startTime: "", durationMin: 30, priority: "normal", status: "open", repeat: "none", seriesId: "", seriesDay: 0, createdAt: now.toISOString(), completedAt: "", completedOn: "" });
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
  } else if (action === "ask_delete") {
    if (!task) throw new Error("That task no longer exists"); s.deleteId = task.id;
  } else if (action === "cancel_delete") s.deleteId = "";
  else if (action === "confirm_delete") {
    if (!task || s.deleteId !== task.id) throw new Error("Review the task again before deleting it");
    s.tasks = s.tasks!.filter(t => t.id !== task.id); if (s.selectedId === id) s.selectedId = ""; s.deleteId = "";
  } else if (action === "delete_task") throw new Error("Review the task before confirming deletion");
  else throw new Error(`Unknown task action: ${action}`);
  return { updates: view(s, today), ...(action === "select_task" || action === "new_task" ? { focusSurface: "details" } : action === "save_task" ? { focusSurface: "main" } : {}) };
}

function endTime(start: string, minutes: number) {
  if (!time(start)) return "";
  const end = Number(start.slice(0, 2)) * 60 + Number(start.slice(3)) + minutes;
  return end < 1440 ? `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}` : "";
}
function taskRows(tasks: Task[], today: string) {
  return tasks.map(t => ({ id: t.id, title: t.title, notes: t.notes, dueDate: t.dueDate, dateLabel: t.dueDate ? `${dayName(t.dueDate, today)}${t.startTime ? ` · ${t.startTime}` : ""}` : "No due date",
    priorityLabel: t.priority === "high" ? "High priority" : t.priority === "low" ? "Low priority" : "Normal priority",
    repeatLabel: t.repeat === "none" ? "" : `Repeats ${t.repeat}`, overdue: overdue(t, today), done: t.status === "done", tone: t.status === "done" ? "success" : overdue(t, today) ? "danger" : "neutral" }));
}
export function view(input: State, today = isoDay(new Date())): Update[] {
  const s = normalize(input), tasks = s.tasks!, open = tasks.filter(t => t.status === "open"), done = tasks.filter(t => t.status === "done");
  const dueToday = open.filter(t => t.dueDate === today), overdueTasks = open.filter(t => overdue(t, today));
  const upcoming = open.filter(t => t.dueDate > today).sort((a,b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  const trendLabels: string[] = [], trendValues: number[] = [];
  const anchor = new Date(`${today}T00:00:00Z`);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(anchor); d.setUTCDate(d.getUTCDate() - i); const day = isoDay(d);
    trendLabels.push(day.slice(5)); trendValues.push(done.filter(t => (t.completedOn || t.completedAt.slice(0, 10)) === day).length);
  }
  const selected = tasks.find(t => t.id === s.selectedId);
  const urgent = [...overdueTasks, ...dueToday].slice(0, 3).map(t => `${t.title}, ${overdue(t, today) ? "overdue" : "due today"}${t.startTime ? ` at ${t.startTime}` : ""}`).join(". ");
  const nextUp = upcoming.slice(0, 2).map(t => `${t.title}, due ${t.dueDate}${t.startTime ? ` at ${t.startTime}` : ""}`).join(". ");
  const unscheduled = open.filter(t => !t.dueDate).slice(0, 2).map(t => t.title).join(". ");
  const spoken = open.length === 0 ? (done.length ? `No open tasks. ${label(done.length, "task")} completed.` : "No tasks saved yet. Add one with quick capture.")
    : `${label(open.length, "open task")}. ${overdueTasks.length ? `${label(overdueTasks.length, "task")} overdue. ` : ""}${dueToday.length ? `${label(dueToday.length, "task")} due today. ` : "Nothing due today. "}${urgent ? `First up: ${urgent}. ` : ""}${nextUp ? `Coming up: ${nextUp}.` : ""}${!urgent && !nextUp && unscheduled ? `Without a date: ${unscheduled}.` : ""}`;
  const data = { capture: s.capture ?? "", draft: s.draft ?? emptyDraft(), edit: s.edit ?? {}, editDirty: Boolean(s.editDirty),
    today: taskRows([...overdueTasks, ...dueToday.filter(t => !overdue(t, today))], today), upcoming: taskRows(upcoming, today), all: taskRows(open, today), completed: taskRows(done, today),
    hasToday: overdueTasks.length + dueToday.length > 0, hasUpcoming: upcoming.length > 0, hasOpen: open.length > 0, hasDone: done.length > 0,
    counts: { open: open.length, done: done.length, overdue: overdueTasks.length, today: dueToday.length, upcoming: upcoming.length },
    todayDate: today,
    chart: { statusLabels: ["Open", "Completed"], statusSeries: [{ name: "Tasks", values: [open.length, done.length] }], trendLabels, trendSeries: [{ name: "Completed", values: trendValues }] },
    summary: `${label(open.length, "open task")} · ${label(dueToday.length, "due today")} · ${label(overdueTasks.length, "overdue")}`,
    calendarEvents: open.filter(t => t.dueDate).map(t => ({ title: t.title, date: t.dueDate, ...(t.startTime ? { start: t.startTime, end: endTime(t.startTime, t.durationMin) } : {}), note: `${t.priority === "high" ? "High priority · " : ""}${t.repeat !== "none" ? `Repeats ${t.repeat}` : ""}`.trim(), tone: overdue(t, today) ? "danger" : t.priority === "high" ? "warning" : "info" })),
    selected: selected ? { id: selected.id, status: selected.status } : null,
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
    { id: "task-row", type: "card", props: { title: "{title}", subtitle: "{dateLabel} · {priorityLabel}", body: "{notes}", badge: "{repeatLabel}", tone: "{tone}" }, children: ["task-actions"] },
    { id: "task-actions", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["task-done", "task-select", "task-delete", "confirm-delete", "cancel-delete"] },
    { id: "task-done", type: "button", props: { label: "{doneLabel}", action: "toggle_done", payload: { id: "{id}" }, style: "secondary" } },
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
    { id: "root", type: "stack", props: { gap: "md" }, children: ["summary", "capture", "tabbed"] },
    { id: "summary", type: "text", props: { content: "{/summary}", variant: "caption" } },
    { id: "capture", type: "section", props: { title: "Quick capture", description: "Add the thought now. Add a date or repeat rule when it matters." }, children: ["capture-input", "capture-bar"] },
    { id: "capture-input", type: "input", props: { label: "Task", bind: "/capture", placeholder: "What needs doing?" } },
    { id: "capture-bar", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["capture-dictate", "capture-save", "new-task"] },
    { id: "capture-dictate", type: "button", props: { label: "Dictate", action: "voice.dictate", payload: { into: "capture-input" }, style: "secondary" } },
    { id: "capture-save", type: "button", props: { label: "Add task", action: "capture_task", style: "primary" } },
    { id: "new-task", type: "button", props: { label: "Add with details", action: "new_task", style: "secondary" } },
    { id: "tabbed", type: "tabs", props: {}, children: ["today-panel", "upcoming-panel", "all-panel", "completed-panel", "insights-panel"] },
    { id: "today-panel", type: "section", props: { title: "Today", description: "{/counts/today} due · {/counts/overdue} overdue" }, children: ["today-list", "today-empty"] },
    { id: "today-list", type: "stack", props: { gap: "sm" }, children: { each: "/today", template: "task-row" } },
    { id: "today-empty", type: "text", props: { content: "Nothing is due today. Use quick capture to save a task for later.", variant: "caption", visibleIf: "{/hasToday}" } },
    { id: "upcoming-panel", type: "section", props: { title: "Calendar", description: "Browse dated tasks by month, week, day or agenda." }, children: ["calendar", "upcoming-heading", "upcoming-list", "upcoming-empty"] },
    { id: "calendar", type: "calendar", props: { events: "{/calendarEvents}", view: "month", date: "{/todayDate}" } },
    { id: "upcoming-heading", type: "text", props: { content: "Upcoming tasks", variant: "subheading" } },
    { id: "upcoming-list", type: "stack", props: { gap: "sm" }, children: { each: "/upcoming", template: "task-row" } },
    { id: "upcoming-empty", type: "text", props: { content: "No future dated tasks yet. Add a due date to place one on the calendar.", variant: "caption", visibleIf: "{/hasUpcoming}" } },
    { id: "all-panel", type: "section", props: { title: "Open tasks", description: "{/counts/open} active tasks" }, children: ["all-list", "all-empty"] },
    { id: "all-list", type: "stack", props: { gap: "sm" }, children: { each: "/all", template: "task-row" } },
    { id: "all-empty", type: "text", props: { content: "No open tasks. Quick capture is ready when you need it.", variant: "caption", visibleIf: "{/hasOpen}" } },
    { id: "completed-panel", type: "section", props: { title: "Completed", description: "{/counts/done} completed tasks" }, children: ["completed-list", "completed-empty"] },
    { id: "completed-list", type: "stack", props: { gap: "sm" }, children: { each: "/completed", template: "task-row" } },
    { id: "completed-empty", type: "text", props: { content: "Completed tasks will appear here.", variant: "caption", visibleIf: "{/hasDone}" } },
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
      { id: "selected-controls", type: "stack", props: { direction: "horizontal", wrap: true, gap: "sm" }, children: ["back-to-tasks", "discard-edits"] },
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
  const detailData = { draft: data.draft, spoken: { detail: detailSpoken }, ...(selected ? { edit: data.edit } : {}) };
  return [main, { surface: "details", nodes: detailNodes, data: replace(detailData) }];
}
export const surfaceFile = () => view({}, "2000-01-01").map(u => ({ id: u.surface, title: u.surface === "main" ? "Tasks" : "Task details", data: u.data[0]!.value, nodes: u.nodes }));
export async function renderApp(context: Context) { return { updates: view(normalize(context.state)) }; }
