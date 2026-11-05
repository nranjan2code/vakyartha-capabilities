import assert from "node:assert/strict";
import { test } from "node:test";
import { handleAction, nextOccurrence, normalize, view } from "../apps/task-planner/server.ts";
import type { Task } from "../apps/task-planner/server.ts";
import { readFileSync } from "node:fs";

const fixed = () => new Date("2026-11-04T12:00:00.000Z");
const task = (overrides: Partial<Task> = {}): Task => ({ id: "task-1", title: "Pay rent", notes: "", dueDate: "2026-11-04", startTime: "", durationMin: 30, priority: "normal", status: "open", repeat: "none", seriesId: "", createdAt: "2026-11-01T00:00:00.000Z", completedAt: "", ...overrides });

test("recurrence advances calendar dates and clamps month ends", () => {
  assert.equal(nextOccurrence("2026-11-04", "daily"), "2026-11-05");
  assert.equal(nextOccurrence("2026-11-04", "weekly"), "2026-11-11");
  assert.equal(nextOccurrence("2026-01-31", "monthly"), "2026-02-28");
  assert.equal(nextOccurrence("2026-02-28", "monthly", 31), "2026-03-31");
  assert.equal(nextOccurrence("2024-01-31", "monthly"), "2024-02-29");
  assert.equal(nextOccurrence("2026-11-04", "none"), "");
});

test("normalization drops invalid records and bounds user text", () => {
  const s = normalize({ tasks: [task({ id: "ok" }), task({ id: "bad", title: "  " }), task({ id: "date", dueDate: "2026-02-30" })] as never[] });
  assert.equal(s.tasks!.length, 2);
  assert.equal(s.tasks![1]!.dueDate, "");
});

test("capture, due views, explicit edits and completion derive consistent surfaces", async () => {
  const c: any = { state: { capture: "Call the dentist" }, now: fixed };
  let r = await handleAction("capture_task", null, c, "capture_task");
  assert.equal(c.state.tasks![0]!.title, "Call the dentist");
  let data: any = r.updates.find(x => x.surface === "main")!.data[0]!.value;
  assert.equal(data.counts.open, 1);
  r = await handleAction("select_task", { id: "task-1" }, c, "select_task");
  assert.equal(r.focusSurface, "details");
  await handleAction("/edit/dueDate", "2026-11-06", c);
  await handleAction("save_selected", null, c, "save_selected");
  assert.equal(c.state.tasks![0]!.dueDate, "2026-11-06");
  r = await handleAction("toggle_done", { id: "task-1" }, c, "toggle_done");
  data = r.updates.find(x => x.surface === "main")!.data[0]!.value;
  assert.equal(data.counts.done, 1);
  assert.equal(data.counts.open, 0);
  assert.equal(data.chart.trendSeries[0].values.at(-1), 1);
});

test("calendar events include a local timed block and reject a time without a date", async () => {
  const c: any = { state: { draft: { title: "Focus work", dueDate: "2026-11-05", startTime: "09:15", durationMin: 60 } }, now: fixed };
  await handleAction("save_task", null, c, "save_task");
  const event: any = (view(c.state, "2026-11-04").find(x => x.surface === "main")!.data[0]!.value as any).calendarEvents[0];
  assert.equal(event.start, "09:15");
  assert.equal(event.end, "10:15");
  const invalid: any = { state: { draft: { title: "Focus", startTime: "09:15" } }, now: fixed };
  await assert.rejects(handleAction("save_task", null, invalid, "save_task"), /Add a due date/);
});

test("unsaved edits cannot be silently replaced", async () => {
  const c: any = { state: { tasks: [task(), task({ id: "task-2", title: "Buy groceries" })] }, now: fixed };
  await handleAction("select_task", { id: "task-1" }, c, "select_task");
  await handleAction("/edit/title", "Pay electricity", c);
  await assert.rejects(handleAction("select_task", { id: "task-2" }, c, "select_task"), /Save or discard/);
  await handleAction("discard_edits", null, c, "discard_edits");
  await handleAction("select_task", { id: "task-2" }, c, "select_task");
  assert.equal(c.state.edit!.title, "Buy groceries");
});

test("voice transcription and speech use only the host actions and canonical text", () => {
  const manifest = JSON.parse(readFileSync("apps/task-planner/app.json", "utf8"));
  assert.equal(manifest.voice.listen.surface, "main");
  assert.equal(manifest.voice.listen.path, "/spoken/summary");
  assert.deepEqual(manifest.entitlements.mcpTools, []);
  const [main, draftDetails] = view({ tasks: [task()] }, "2026-11-04");
  const mainButtons = main!.nodes.filter(n => n.type === "button").map(n => n.props) as any[];
  assert.ok(mainButtons.some(p => p?.action === "voice.dictate" && p.payload.into === "capture-input"));
  assert.match((main!.data[0]!.value as any).spoken.summary, /Pay rent/);
  assert.ok(draftDetails!.nodes.some(n => (n.props as any)?.action === "voice.dictate" && (n.props as any).payload.into === "new-notes"));
  const [, details] = view({ tasks: [task()], selectedId: "task-1", edit: task() }, "2026-11-04");
  assert.ok(details!.nodes.some(n => (n.props as any)?.action === "voice.dictate" && (n.props as any).payload.into === "selected-notes"));
  assert.ok(details!.nodes.some(n => (n.props as any)?.action === "voice.read" && (n.props as any).payload.text === "/spoken/detail"));
  assert.match((details!.data[0]!.value as any).spoken.detail, /Pay rent/);
});

test("recurring completion creates one next task and retains the completed occurrence", async () => {
  const c: any = { state: { tasks: [task({ repeat: "monthly", seriesDay: 31, dueDate: "2026-01-31" })] }, now: fixed };
  await handleAction("toggle_done", { id: "task-1" }, c, "toggle_done");
  assert.equal(c.state.tasks!.length, 2);
  assert.equal(c.state.tasks![0]!.dueDate, "2026-02-28");
  assert.equal(c.state.tasks![0]!.seriesDay, 31);
  assert.equal(c.state.tasks![0]!.status, "open");
  assert.equal(c.state.tasks![1]!.status, "done");
  const before = JSON.stringify(c.state.tasks);
  view(c.state, "2026-11-04");
  assert.equal(JSON.stringify(c.state.tasks), before, "render never advances recurrence");
});

test("delete requires review and a second exact action", async () => {
  const c: any = { state: { tasks: [task()] }, now: fixed };
  await assert.rejects(handleAction("delete_task", { id: "task-1" }, c, "delete_task"), /Review the task/);
  await handleAction("ask_delete", { id: "task-1" }, c, "ask_delete");
  await handleAction("confirm_delete", { id: "task-other" }, c, "confirm_delete").then(() => assert.fail("foreign id accepted"), e => assert.match(String(e), /Review the task again/));
  await handleAction("confirm_delete", { id: "task-1" }, c, "confirm_delete");
  assert.equal(c.state.tasks!.length, 0);
});
