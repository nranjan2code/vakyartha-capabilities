// Agent Desk's own rules, with nothing outside the package: the frozen contract,
// the work plan, worker reports, personal review and the declared tool schemas.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { handleAction, handleQuery, normalize, renderApp, surfaceFile, type Context } from '../server.ts';
import { background, planning, working } from '../model.ts';
import { views } from '../views.ts';

const here = (file: string) => path.join(import.meta.dirname, '..', file);
const brief = { title: 'Sum the source values', goal: 'Read the supplied values and report their exact sum.', inputs: 'prices.csv\n12\n17', criteria: 'Preserve both source values\nReport the sum as 29' };
const claims = () => [
  { criterion: 'c1', outcome: 'pass', observation: 'The supplied source values are 12 and 17.', reference: 'Supplied input: prices.csv rows 1–2' },
  { criterion: 'c2', outcome: 'pass', observation: 'Independent addition yields 29.', reference: 'Calculation: 12 + 17 = 29' },
];
const proposal = (c: Context, extra: Record<string, unknown> = {}) => ({ expectedRevision: c.appRevision, taskId: 'task-1', approach: 'Read both input rows and add once', result: '12 + 17 = 29. Source: supplied prices.csv.', limits: 'No external source was requested.', reports: [] as unknown[], claims: claims(), ...extra });
const pieces = [
  { objective: 'Read the two source values from prices.csv.', acceptance: 'Both values with their row numbers.', reason: 'context_bound' },
  { objective: 'Add the two values without seeing the first answer.', acceptance: 'The sum and the calculation.', reason: 'independent_judgment' },
];
const task = (c: Context) => c.state.tasks[0]!;
const surfaces = (r: { updates: { surface: string }[] }) => r.updates.map(u => u.surface);
const data = (c: Context, surface: string) => views(c.state).find(u => u.surface === surface)!.data[0]!.value as any;

async function create(revision = 1): Promise<Context> {
  const c: Context = { state: normalize({}), appRevision: revision };
  for (const [key, value] of Object.entries(brief)) await handleAction(`/draft/${key}`, value, c);
  await handleAction('', {}, c, 'create_task');
  return c;
}
async function planned(): Promise<Context> {
  const c = await create();
  await handleAction('', { expectedRevision: 1, taskId: 'task-1', assignments: pieces }, c, 'plan_work');
  return c;
}
const reportsFor = (c: Context) => task(c).plan.map((a, i) => ({ assignment: a.id, status: i ? 'failed' : 'returned', result: i ? 'Could not add without the values.' : 'Rows 1 and 2 hold 12 and 17.', reference: i ? '' : 'prices.csv rows 1–2' }));

test('a plan is a revision-checked proposal the person can edit, and it starts no work', async () => {
  const c = await create(3);
  await assert.rejects(handleAction('', { expectedRevision: 2, taskId: 'task-1', assignments: pieces }, c, 'plan_work'), /changed/);
  await assert.rejects(handleAction('', { taskId: 'task-1', assignments: pieces }, c, 'plan_work'), /changed/);
  await assert.rejects(handleAction('', { expectedRevision: 3, taskId: 'task-1', assignments: [{ ...pieces[0], reason: 'faster' }] }, c, 'plan_work'), /reason/);
  await assert.rejects(handleAction('', { expectedRevision: 3, taskId: 'task-1', assignments: Array(9).fill(pieces[0]) }, c, 'plan_work'), /at most 8/);
  assert.equal(task(c).plan.length, 0, 'a refused plan changes nothing');
  // The host's tool bridge has already checked the revision and removed the field.
  await handleAction('tool:plan_work', { taskId: 'task-1', assignments: [pieces[0]] }, c, 'plan_work');
  assert.equal(task(c).plan.length, 1);
  const saved = await handleAction('', { expectedRevision: 3, taskId: 'task-1', assignments: pieces }, c, 'plan_work');
  assert.equal(saved.focusSurface, 'plan');
  assert.equal(task(c).plan.length, 2);
  assert.equal(task(c).attempts.length, 0);
  // The person removes one and adds their own, with no model involved.
  assert.deepEqual(surfaces(await handleAction('', { id: task(c).plan[0]!.id }, c, 'remove_assignment')), ['plan']);
  await handleAction('/assignment/objective', 'Check the sum against the criteria.', c);
  await handleAction('/assignment/acceptance', 'Pass or fail with the reason.', c);
  await handleAction('/assignment/reason', 'independent_judgment', c);
  await assert.rejects(handleAction('/assignment/reason', 'because', c), /reason/);
  await handleAction('', {}, c, 'add_assignment');
  assert.deepEqual(task(c).plan.map(a => a.objective), [pieces[1]!.objective, 'Check the sum against the criteria.']);
  assert.equal(new Set(task(c).plan.map(a => a.id)).size, 2);
  assert.equal(c.state.assignment.objective, '', 'the draft is cleared after adding');
  await assert.rejects(handleAction('', {}, c, 'add_assignment'), /characters/);
  // A replacement plan clears the earlier one; an empty plan means one worker.
  await handleAction('', { expectedRevision: 3, taskId: 'task-1', assignments: [] }, c, 'plan_work');
  assert.equal(task(c).plan.length, 0);
});

test('an attempt carries one report per planned assignment and keeps failed workers', async () => {
  const c = await planned();
  await assert.rejects(handleAction('', proposal(c), c, 'propose_attempt'), /Assignment IDs: w\d+, w\d+/);
  const reports = reportsFor(c);
  await assert.rejects(handleAction('', proposal(c, { reports: [reports[0], reports[0]] }), c, 'propose_attempt'), /exactly once/);
  await assert.rejects(handleAction('', proposal(c, { reports: [reports[0], { ...reports[1], status: 'done' }] }), c, 'propose_attempt'), /status/);
  assert.equal(task(c).attempts.length, 0);
  const saved = await handleAction('', proposal(c, { reports: [reports[1], reports[0]], reviews: [{ verdict: 'pass' }], accepted: true, execution: { id: 'forged' } }), c, 'propose_attempt');
  assert.equal(saved.focusSurface, 'evidence');
  const attempt = task(c).attempts[0]!;
  assert.deepEqual(attempt.reports.map(r => r.status), ['returned', 'failed'], 'reports follow plan order');
  assert.equal(attempt.reports[0]!.objective, pieces[0]!.objective, 'the assignment is copied into its report');
  assert.ok(attempt.reviews.every(r => r.verdict === 'unchecked' && !r.note), 'a proposal cannot supply personal review');
  assert.equal(attempt.execution, null, 'a receipt comes only from the host context');
  assert.equal(task(c).accepted, '');
  // Changing the plan later leaves saved evidence as it was.
  await handleAction('', { expectedRevision: 1, taskId: 'task-1', assignments: [] }, c, 'plan_work');
  assert.equal(task(c).attempts[0]!.reports.length, 2);
  await assert.rejects(handleAction('', proposal(c, { reports }), c, 'propose_attempt'), /no work plan/);
  await handleAction('', proposal(c), c, 'propose_attempt');
  const evidence = data(c, 'evidence'), compare = data(c, 'compare');
  assert.equal(evidence.reports.length, 0);
  assert.deepEqual(compare.rows.map((r: unknown[]) => [r[2], r[3]]), [[2, 1], [0, 0]]);
});

test('frozen criteria, failed evidence and personal acceptance stay independent', async () => {
  const c = await create(4);
  const original = structuredClone(task(c).criteria), before = structuredClone(c.state);
  await handleQuery('get_task_context', {}, c);
  assert.deepEqual(c.state, before, 'a query never changes state');
  const failed = proposal(c, { result: 'Could not confirm the sum' });
  (failed.claims[1] as any).outcome = 'fail'; (failed.claims[1] as any).reference = '';
  await handleAction('', failed, c, 'propose_attempt');
  await assert.rejects(handleAction('', { id: c.state.attempt }, c, 'accept_result'), /Check every/);
  await handleAction('', proposal(c), c, 'propose_attempt');
  const attempt = task(c).attempts[1]!;
  for (let i = 0; i < 2; i++) {
    await handleAction(`/checks/${i}/verdict`, 'pass', c);
    await handleAction(`/checks/${i}/note`, i ? 'I added 12 and 17 myself and got 29.' : 'I checked both original input rows.', c);
  }
  await handleAction('', { id: attempt.id }, c, 'accept_result');
  assert.equal(task(c).accepted, attempt.id);
  assert.deepEqual(task(c).criteria, original);
  assert.equal(task(c).attempts[0]!.claims[1]!.outcome, 'fail');
  const markdown = data(c, 'evidence').export.markdown;
  assert.match(markdown, /12 \+ 17 = 29/); assert.match(markdown, /personal review pass/);
  await assert.rejects(handleAction('/checks/0/note', 'Overwrite accepted review', c), /unaccepted/);
  await assert.rejects(handleAction('', proposal(c), c, 'propose_attempt'), /open task/);
  await assert.rejects(handleAction('', { expectedRevision: 4, taskId: 'task-1', assignments: pieces }, c, 'plan_work'), /open task/);
  await assert.rejects(handleAction('', {}, c, 'add_assignment'), /open task/);
  await handleAction('/lesson', 'Check the source rows before computing.', c);
  assert.equal(task(c).lesson, 'Check the source rows before computing.');
  assert.deepEqual((await renderApp(c)).updates, views(c.state));
});

test('malformed contracts and proposals are refused without dropping saved records', async () => {
  const c = await create(), original = structuredClone(c.state);
  const twice = proposal(c); (twice.claims[1] as any).criterion = 'c1';
  await assert.rejects(handleAction('', twice, c, 'propose_attempt'), /Required criterion IDs: c1, c2/);
  const secret = proposal(c); (secret.claims[0] as any).reference = 'https://user:secret@example.org';
  await assert.rejects(handleAction('', secret, c, 'propose_attempt'), /credential-free/);
  await assert.rejects(handleAction('', proposal(c, { taskId: 'missing' }), c, 'propose_attempt'), /open task/);
  await assert.rejects(handleAction('', proposal(c, { expectedRevision: 0 }), c, 'propose_attempt'), /changed/);
  await assert.rejects(handleAction('/draft/goal', 'x'.repeat(4001), c), /characters/);
  await assert.rejects(handleAction('/unknown', 'x', c), /Unknown task field/);
  await assert.rejects(handleAction('', {}, c, 'launch'), /Unknown task action/);
  assert.deepEqual(c.state, original);
  assert.throws(() => normalize({ tasks: [{}] }), /invalid|list/);
  assert.throws(() => normalize({ tasks: 'none' }), /list/);
  c.state.draft = { ...brief, criteria: 'Duplicate\nDuplicate' };
  await assert.rejects(handleAction('', {}, c, 'create_task'), /distinct/);
});

test('each edit rebuilds only the views that depend on it', async () => {
  const c = await planned();
  assert.deepEqual(surfaces(await handleAction('/draft/title', 'Independent draft', c)), ['tasks']);
  assert.deepEqual(surfaces(await handleAction('/approach', 'Check source identities first.', c)), ['plan']);
  assert.deepEqual(surfaces(await handleAction('/assignment/objective', 'Draft piece', c)), ['plan']);
  await handleAction('', proposal(c, { reports: reportsFor(c) }), c, 'propose_attempt');
  assert.deepEqual(surfaces(await handleAction('/checks/0/note', 'I checked the original input.', c)), ['evidence']);
  const pass = await handleAction('/checks/0/verdict', 'pass', c);
  assert.deepEqual(surfaces(pass), ['plan', 'evidence', 'compare']);
  assert.match((pass.updates[0]!.data[0]!.value as any).spoken.summary, /2 worker reports and 1 criterion you marked passed/);
  assert.deepEqual(surfaces(await handleAction('/checks/0/note', '', c)), ['plan', 'evidence', 'compare']);
  assert.deepEqual(surfaces(await handleAction('', { id: c.state.attempt }, c, 'open_attempt')), ['plan', 'evidence']);
  assert.deepEqual(surfaces(await handleAction('', { id: 'task-1' }, c, 'open_task')), ['tasks', 'plan', 'evidence', 'compare']);
});

test('saved text reaches a view only as bound data, never as node text', async () => {
  const c = await planned();
  const code = '```javascript\nconst example = { value: "{/checks/0/note}", literal: "{name}" };\n```';
  await handleAction('', proposal(c, { approach: 'Keep the {name} placeholder literal.', result: code, limits: 'Source includes {/candidate/result}.', reports: reportsFor(c).map(r => ({ ...r, result: `${r.result} {/export/markdown}` })) }), c, 'propose_attempt');
  for (const view of views(c.state)) {
    const inNodes = JSON.stringify(view.nodes);
    for (const literal of ['{name}', '{/checks/0/note}', '{/export/markdown}', brief.goal, pieces[0]!.objective]) assert.equal(inNodes.includes(literal), false, `${view.surface} nodes carry saved text: ${literal}`);
  }
  assert.equal(data(c, 'evidence').candidate.result, code);
  assert.ok(data(c, 'evidence').export.markdown.includes(code));
  assert.equal(task(c).attempts[0]!.result, code);
});

test('task context indexes attempts and returns one full attempt only when asked', async () => {
  const c = await planned(), reports = reportsFor(c);
  for (let i = 0; i < 12; i++) await handleAction('', proposal(c, { reports, result: `Large retained result ${i} ${'.'.repeat(19000)}` }), c, 'propose_attempt');
  await assert.rejects(handleAction('', proposal(c, { reports }), c, 'propose_attempt'), /12 attempts/);
  const before = structuredClone(c.state), index = await handleQuery('get_task_context', {}, c);
  assert.equal(index.task!.attempts.length, 12); assert.equal('attempt' in index, false);
  assert.deepEqual([index.task!.plan.length, index.task!.attempts[0]!.workerReports, index.task!.attempts[0]!.failedReports], [2, 2, 1]);
  assert.ok(JSON.stringify(index).length < 20000, 'the default query does not copy every retained result');
  const detail = await handleQuery('get_task_context', { attemptId: task(c).attempts[3]!.id }, c);
  assert.equal(detail.attempt!.result, before.tasks[0]!.attempts[3]!.result);
  assert.equal(detail.attempt!.reports.length, 2);
  await assert.rejects(handleQuery('get_task_context', { attemptId: 'attempt-999' }, c), /selected task/);
  await assert.rejects(handleQuery('get_task_context', { other: 1 }, c), /attemptId/);
  await assert.rejects(handleQuery('other', {}, c), /Unknown/);
  assert.deepEqual(c.state, before);
});

test('the background brief carries planned pieces within the Work form limit', async () => {
  const c = await create();
  assert.equal(background(task(c)).goal, brief.goal);
  const long = Array.from({ length: 8 }, (_, i) => ({ objective: `${i} ${'o'.repeat(590)}`, acceptance: 'a'.repeat(400), reason: 'context_bound' }));
  task(c).goal = 'g'.repeat(4000);
  await handleAction('', { expectedRevision: 1, taskId: 'task-1', assignments: long }, c, 'plan_work');
  const prepared = data(c, 'plan').background;
  assert.ok(prepared.goal.length <= 8000 && prepared.goal.startsWith(task(c).goal));
  assert.match(prepared.goal, /Planned pieces for separate workers/);
  assert.match(prepared.goal, /\d more planned pieces are kept in Agent Desk/);
  assert.equal(prepared.criteria, 'Preserve both source values\nReport the sum as 29');
  assert.equal(prepared.inputs, brief.inputs);
  assert.deepEqual(background(undefined), { goal: '', criteria: '', inputs: '' });
});

test('the manifest, shipped surfaces and assistant controls match the handlers', async () => {
  const manifest = JSON.parse(readFileSync(here('app.json'), 'utf8'));
  assert.deepEqual(JSON.parse(readFileSync(here('surface.json'), 'utf8')), surfaceFile());
  const ids = surfaceFile().map(s => s.id), tools = manifest.exports.tools;
  assert.deepEqual(ids, ['tasks', 'plan', 'evidence', 'compare']);
  assert.ok(ids.includes(manifest.voice.listen.surface));
  assert.deepEqual(tools.map((t: any) => [t.name, t.readOnly]), [['get_task_context', true], ['plan_work', false], ['propose_attempt', false]]);
  const writes = tools.filter((t: any) => !t.readOnly).map((t: any) => t.name);
  for (const flow of [planning, working]) {
    assert.ok(writes.includes(flow.saveTool) && writes.includes(flow.review.tool) && ids.includes(flow.review.surface));
    assert.ok(flow.steps.length >= 1 && flow.steps.length <= 4 && flow.steps.every(s => s.saveTool === flow.saveTool && s.stage < flow.stages.length));
  }
  // Every mutating export is revision-checked, and the schema names the same domains the handlers enforce.
  for (const tool of tools.filter((t: any) => !t.readOnly)) assert.ok(tool.inputSchema.required.includes('expectedRevision') && tool.inputSchema.additionalProperties === false);
  const plan = tools[1].inputSchema.properties.assignments, reports = tools[2].inputSchema.properties.reports;
  assert.deepEqual(plan.items.properties.reason.enum, ['independent_judgment', 'context_bound']);
  assert.deepEqual([plan.maxItems, reports.maxItems], [8, 8]);
  const c = await planned();
  assert.ok(task(c).plan.every(a => new RegExp(reports.items.properties.assignment.pattern).test(a.id)));
  // Each save has exactly one skill whose steps call it, so the host can run that plan for a required save.
  const skills = manifest.exports.skills.map((s: any) => readFileSync(here(s.path), 'utf8'));
  assert.deepEqual(manifest.exports.skills.map((s: any) => s.name), ['agent-desk-planner', 'agent-desk-worker']);
  for (const name of writes) assert.equal(skills.filter((text: string) => text.includes(`- tool: app-agent-desk__${name}`)).length, 1, `one plan saves through ${name}`);
  assert.ok(skills.every((text: string) => text.includes('- tool: app-agent-desk__get_task_context')));
  assert.ok(readFileSync(here('skills/agent-desk-worker/references/host-evidence.md'), 'utf8').length > 0);
});
