// The four views, each derived from the same records. Text a person or the assistant
// wrote reaches a view only through data bindings, never inside node text, so saved
// content can never be read as a binding of its own.
import { background, checked, current, planRequest, planning, ready, runRequest, selectedAttempt, working, type Attempt, type State, type Task } from './model.ts';

interface Node { id: string; type: string; props: Record<string, unknown>; children?: string[] | { each: string; template: string } }

export const TITLES: Record<string, string> = { tasks: 'Tasks', plan: 'Plan', evidence: 'Evidence', compare: 'Compare' };
const REASON_LABELS = { independent_judgment: 'Independent judgment', context_bound: 'Smaller context of its own' } as const;

const n = (id: string, type: string, props: Record<string, unknown> = {}, children?: Node['children']): Node => ({ id, type, props, ...(children ? { children } : {}) });
const text = (id: string, content: string, variant = 'body') => n(id, 'text', { content, variant });
const button = (id: string, label: string, action: string, payload: Record<string, unknown> = {}, style = 'secondary') => n(id, 'button', { label, action, payload, style });
const row = (id: string, children: string[]) => n(id, 'stack', { direction: 'horizontal', wrap: true, gap: 'sm' }, children);
const update = (surface: string, nodes: Node[], value: Record<string, unknown>) => ({ surface, nodes, data: [{ op: 'replace' as const, path: '/' as const, value }] });
const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

function receipts(a: Attempt | undefined): string {
  if (!a?.execution) return 'No host execution receipt is attached to this attempt. Statements about tool use in its text are unsupported.';
  return `Assistant run ${a.execution.id}. The host recorded ${count(a.execution.operations.length, 'completed tool response', 'completed tool responses')}. A receipt proves a response was observed, not that its contents are true or that an outside change succeeded.`;
}

function spoken(t: Task | undefined, a: Attempt | undefined): string {
  if (!t) return 'Agent Desk has no selected task. Define a goal, supplied inputs and observable completion criteria to begin.';
  const plan = t.plan.length ? `The work plan has ${count(t.plan.length, 'assignment', 'assignments')} for separate workers.` : 'There is no work plan, so one worker does the task.';
  const attempt = a ? ` The selected attempt has ${count(a.reports.length, 'worker report', 'worker reports')} and ${count(checked(a), 'criterion', 'criteria')} you marked passed. Assistant claims and worker reports are not independent verification. ${a.execution ? `${count(a.execution.operations.length, 'host tool response is', 'host tool responses are')} kept apart from the claims.` : 'No host tool-response receipt is attached.'}` : '';
  return `${t.title}. ${t.accepted ? 'You accepted a result after personal evidence review.' : 'The task is open.'} ${t.goal} There are ${count(t.criteria.length, 'fixed completion criterion', 'fixed completion criteria')} and ${count(t.attempts.length, 'saved attempt', 'saved attempts')}. ${plan}${attempt}`;
}

function markdown(t: Task | undefined, a: Attempt | undefined): string {
  if (!t) return 'No task selected.';
  const criteria = t.criteria.map(c => `- ${c.id}: ${c.text}`).join('\n');
  if (!a) return `# ${t.title}\n\n${t.goal}\n\n## Fixed criteria\n\n${criteria}\n\nNo attempt saved.\n`;
  const workers = a.reports.length ? a.reports.map(r => `### ${r.assignment}: ${r.status}\n\nObjective: ${r.objective}\nResult must contain: ${r.acceptance}\n\n${r.result}\n\nReference: ${r.reference || 'Missing'}`).join('\n\n') : 'One worker did this attempt; there are no separate worker reports.';
  const operations = a.execution?.operations.map(o => `${o.id} · ${o.tool} · ${o.status} · ${o.at}\nArguments SHA-256: ${o.argumentsSha256}\nResponse SHA-256: ${o.responseSha256}`).join('\n\n') ?? '';
  const evidence = a.claims.map(c => {
    const r = a.reviews.find(v => v.criterion === c.criterion)!;
    return `${c.criterion}: assistant ${c.outcome}; personal review ${r.verdict}\n${c.observation}\nReference: ${c.reference || 'Missing'}\nReview: ${r.note || 'Not checked'}`;
  }).join('\n\n');
  return `# ${t.title}\n\n${t.goal}\n\n## Fixed criteria\n\n${criteria}\n\n## ${a.id}: ${a.approach}\n\n${a.result}\n\n## Limits\n\n${a.limits || 'None recorded'}\n\n## Worker reports\n\n${workers}\n\n## Host tool responses\n\n${receipts(a)}${operations ? `\n\n${operations}` : ''}\n\n## Evidence\n\n${evidence}\n\nAcceptance: ${t.accepted || 'Not accepted'}\nLesson: ${t.lesson || 'None retained'}\n`;
}

function tasksView(s: State) {
  const tasks = s.tasks.map(t => ({ id: t.id, title: t.title, goal: t.goal, status: t.accepted ? 'Accepted' : t.attempts.length ? 'Needs review' : 'Ready', summary: `${count(t.criteria.length, 'criterion', 'criteria')} · ${count(t.plan.length, 'assignment', 'assignments')} · ${count(t.attempts.length, 'attempt', 'attempts')}` }));
  const nodes: Node[] = [
    n('root', 'stack', { gap: 'md' }, ['intro', 'new', tasks.length ? 'list' : 'empty']),
    text('intro', 'Give work a clear goal, split it among workers where that helps, and keep the evidence that shows whether it succeeded.'),
    n('new', 'section', { title: 'New task contract', description: 'The goal, supplied inputs and criteria stay fixed across attempts. Start a new contract if the goal changes.' }, ['title', 'goal', 'inputs', 'criteria', 'create']),
    n('title', 'input', { label: 'Task name', bind: '/draft/title', placeholder: 'A useful name for this work' }),
    n('goal', 'textarea', { label: 'What should be accomplished?', bind: '/draft/goal' }),
    n('inputs', 'textarea', { label: 'Supplied inputs and source references', bind: '/draft/inputs', placeholder: 'Paste evidence or exact references. A link alone is not a source read.' }),
    n('criteria', 'textarea', { label: 'Complete when: one observable criterion per line', bind: '/draft/criteria', placeholder: 'What result, source, value, interaction or receipt must be checked?' }),
    button('create', 'Save task contract', 'create_task', {}, 'primary'),
    ...(tasks.length ? [
      n('list', 'grid', { columns: 2, gap: 'sm', searchable: true, pageSize: 8 }, { each: '/tasks', template: 'task' }),
      n('task', 'card', { title: '{title}', body: '{goal}', subtitle: '{summary}', badge: '{status}' }, ['open']),
      button('open', 'Open task', 'open_task', { id: '{id}' }),
    ] : [text('empty', 'No tasks saved yet. Saving a contract starts no model request.')]),
  ];
  return update('tasks', nodes, { draft: s.draft, tasks });
}

function planView(s: State, t: Task | undefined, a: Attempt | undefined) {
  const open = !!t && !t.accepted;
  const nodes: Node[] = !t ? [n('root', 'stack', {}, ['empty']), text('empty', 'Open Tasks to create or choose a task.')] : [
    n('root', 'stack', { gap: 'md' }, ['goal', 'contract', 'workers', 'run', ...(t.attempts.length ? ['attempts'] : ['no-attempts'])]),
    text('goal', '{/task/goal}'),
    n('contract', 'table', { columns: ['Criterion', 'Completion condition'], rows: '{/criteria}', pageSize: 8 }),
    n('workers', 'section', { title: 'Work plan', description: 'Each assignment goes to a separate worker that sees only that assignment and the task inputs. Split work only where an independent judgment or a smaller context helps; with no plan, one worker does the task.' }, [t.plan.length ? 'assignments' : 'no-plan', ...(open ? ['plan-ask', 'add'] : [])]),
    ...(t.plan.length ? [
      n('assignments', 'stack', { gap: 'sm' }, { each: '/plan', template: 'assignment' }),
      n('assignment', 'card', { title: '{objective}', body: '{acceptance}', subtitle: '{reason}', badge: '{id}' }, open ? ['assignment-remove'] : []),
      ...(open ? [button('assignment-remove', 'Remove', 'remove_assignment', { id: '{id}' })] : []),
    ] : [text('no-plan', 'No assignments yet.', 'caption')]),
    ...(open ? [
      button('plan-ask', 'Plan with the assistant', 'assistant.compose', { path: 'planRequest', workflowPath: 'planning' }),
      n('add', 'section', { title: 'Add an assignment yourself' }, ['add-objective', 'add-acceptance', 'add-reason', 'add-save']),
      n('add-objective', 'textarea', { label: 'Objective for one worker', bind: '/assignment/objective' }),
      n('add-acceptance', 'textarea', { label: 'What its result must contain', bind: '/assignment/acceptance' }),
      n('add-reason', 'select', { label: 'Why a separate worker', bind: '/assignment/reason', presentation: 'dropdown', options: Object.entries(REASON_LABELS).map(([value, label]) => ({ label, value })) }),
      button('add-save', 'Add assignment', 'add_assignment'),
    ] : []),
    n('run', 'section', { title: '{/task/title}', description: t.accepted ? 'Accepted task. Open Evidence to inspect the retained result.' : 'Choose an approach, then open the assistant and Send.' }, ['approach', 'run-actions', 'boundary']),
    n('approach', 'textarea', { label: 'Approach for this attempt', bind: '/approach' }),
    row('run-actions', ['work', 'background']),
    button('work', t.accepted ? 'Inspect with the assistant' : 'Run with the assistant', 'assistant.compose', { path: 'runRequest', workflowPath: 'working' }, 'primary'),
    button('background', 'Prepare background work', 'work.prepare', { path: 'background' }),
    text('boundary', 'The assistant uses your selected model, enabled skills, integrations and current approvals; its workers share that one authority. Background work opens the Work form with this task and its planned pieces; there you choose the provider, limits and whether delegated work is allowed.', 'caption'),
    ...(t.attempts.length ? [
      n('attempts', 'grid', { columns: 2, gap: 'sm', searchable: true, pageSize: 6 }, { each: '/attempts', template: 'attempt' }),
      n('attempt', 'card', { title: '{id}', body: '{approach}', subtitle: '{summary}' }, ['attempt-open']),
      button('attempt-open', 'Inspect result and evidence', 'open_attempt', { id: '{id}' }),
    ] : [text('no-attempts', 'No saved attempts. Opening the assistant sends nothing; Send starts the work.')]),
  ];
  return update('plan', nodes, {
    task: { title: t?.title ?? '', goal: t?.goal ?? '' },
    criteria: t?.criteria.map(c => [c.id, c.text]) ?? [],
    plan: t?.plan.map(p => ({ ...p, reason: REASON_LABELS[p.reason] })) ?? [],
    assignment: s.assignment, approach: s.approach,
    attempts: t?.attempts.map(v => ({ id: v.id, approach: v.approach, summary: `${count(v.reports.length, 'worker report', 'worker reports')} · ${checked(v)} / ${v.claims.length} personally passed · ${t.accepted === v.id ? 'Accepted' : 'Unreviewed'}` })) ?? [],
    planRequest: planRequest(s), planning, runRequest: runRequest(s), working, background: background(t),
    spoken: { summary: spoken(t, a) },
  });
}

function evidenceView(t: Task | undefined, a: Attempt | undefined) {
  const accepted = !!t && !!a && t.accepted === a.id;
  const nodes: Node[] = !t || !a ? [n('root', 'stack', {}, ['empty']), text('empty', 'Open a saved attempt in Plan to review its evidence.')] : [
    n('root', 'stack', { gap: 'md' }, ['identity', 'result', 'limits', 'workers', 'receipts', 'review', ...(accepted ? ['accepted', 'lesson', 'lesson-save'] : ['accept']), 'export']),
    text('identity', '{/candidate/identity}', 'caption'),
    n('result', 'section', { title: 'Result' }, ['result-text']),
    text('result-text', '{/candidate/result}'),
    n('limits', 'alert', { title: 'Limits and missing evidence', body: '{/candidate/limits}', tone: a.claims.some(c => c.outcome !== 'pass') || a.reports.some(r => r.status === 'failed') ? 'warning' : 'neutral' }),
    n('workers', 'section', { title: 'Worker reports', description: 'What each separate worker returned for its own assignment. A report is unreviewed input to the result, never a completion.' }, [a.reports.length ? 'reports' : 'no-reports']),
    ...(a.reports.length ? [
      n('reports', 'stack', { gap: 'sm' }, { each: '/reports', template: 'report' }),
      n('report', 'section', { title: '{title}' }, ['report-objective', 'report-result', 'report-reference']),
      text('report-objective', '{objective}', 'caption'),
      text('report-result', '{result}'),
      text('report-reference', '{reference}', 'caption'),
    ] : [text('no-reports', 'One worker did this attempt; there are no separate reports.', 'caption')]),
    n('receipts', 'section', { title: 'Host tool responses' }, ['receipt-text', ...(a.execution?.operations.length ? ['receipt-table'] : [])]),
    text('receipt-text', '{/candidate/receipts}'),
    ...(a.execution?.operations.length ? [n('receipt-table', 'table', { columns: ['Receipt', 'Tool', 'Status', 'Time', 'Arguments SHA-256', 'Response SHA-256'], rows: '{/operations}', searchable: true, sortable: true, pageSize: 6 })] : []),
    n('review', 'section', { title: 'Check against the original criteria', description: 'Inspect actual sources, values, interactions and receipts. Acceptance records your own review; it does not certify an automated verifier.' }, ['checks']),
    n('checks', 'stack', { gap: 'md' }, { each: '/checks', template: 'check' }),
    n('check', 'section', { title: '{title}' }, ['observation', 'reference', 'verdict', 'note', 'save-check']),
    text('observation', '{observation}'),
    text('reference', '{reference}'),
    n('verdict', 'select', { label: 'Your evidence verdict', bind: 'verdict', presentation: 'dropdown', options: [{ label: 'Not checked', value: 'unchecked' }, { label: 'Pass', value: 'pass' }, { label: 'Fail', value: 'fail' }], disabled: accepted }),
    n('note', 'textarea', { label: 'What did you independently check?', bind: 'note', disabled: accepted }),
    button('save-check', 'Save review notes', 'refresh'),
    ...(accepted ? [
      text('accepted', 'Accepted after your personal evidence review.'),
      n('lesson', 'textarea', { label: 'Lesson from this task: kept here, never installed as instructions', bind: '/lesson' }),
      button('lesson-save', 'Save task lesson', 'refresh'),
    ] : [button('accept', ready(a) ? 'Accept reviewed result' : 'Accept after checking every criterion', 'accept_result', { id: a.id }, 'primary')]),
    button('export', 'Export result and evidence', 'file.save', { name: 'Agent Desk result.md', text: '/export/markdown' }),
  ];
  const link = (reference: string) => /^https:\/\//i.test(reference) ? ` ([open cited source](${reference.replace(/\(/g, '%28').replace(/\)/g, '%29')}))` : '';
  const cited = (reference: string) => reference ? `Reference, not automatically verified: ${reference}${link(reference)}` : 'Reference missing';
  return update('evidence', nodes, {
    candidate: { identity: t && a ? `${t.title} · ${a.id} · ${a.at}` : '', result: a?.result ?? '', limits: a?.limits || 'No limits recorded by the assistant. Check for omissions.', receipts: receipts(a) },
    reports: a?.reports.map(r => ({ title: `${r.assignment}: ${r.status === 'failed' ? 'failed' : 'returned'}`, objective: `Objective: ${r.objective} Result must contain: ${r.acceptance}`, result: r.result, reference: cited(r.reference) })) ?? [],
    operations: a?.execution?.operations.map(o => [o.id, o.tool, o.status, o.at, o.argumentsSha256, o.responseSha256]) ?? [],
    checks: a?.reviews.map(r => {
      const c = a.claims.find(v => v.criterion === r.criterion)!;
      return { ...r, title: `${r.criterion}: ${t!.criteria.find(k => k.id === r.criterion)!.text}`, observation: `Assistant claim: ${c.outcome}. ${c.observation}`, reference: cited(c.reference) };
    }) ?? [],
    lesson: t?.lesson ?? '',
    export: { markdown: markdown(t, a) },
  });
}

function compareView(t: Task | undefined) {
  const attempts = t?.attempts ?? [];
  const nodes: Node[] = [
    n('root', 'stack', { gap: 'md' }, ['intro', ...(attempts.length ? ['comparison', 'interpretation'] : ['empty'])]),
    text('intro', '{/summary}'),
    ...(attempts.length ? [
      n('comparison', 'table', { columns: ['Attempt', 'Approach', 'Worker reports', 'Failed reports', 'Assistant pass claims', 'Personal passes', 'Missing references', 'State'], rows: '{/rows}', sortable: true, searchable: true, pageSize: 6 }),
      text('interpretation', 'These counts describe saved reports, claims and personal checks. They are not a benchmark or a quality score. Model time, tool use and spending stay in the shared assistant’s call details. A new approach never changes permissions or the frozen criteria.', 'caption'),
    ] : [text('empty', 'Attempts appear after the assistant saves them. Earlier failures stay visible.')]),
  ];
  return update('compare', nodes, {
    summary: t ? `${t.title}: compare attempts against the same ${count(t.criteria.length, 'fixed criterion', 'fixed criteria')}.` : 'Choose a task in Tasks.',
    rows: attempts.map(v => [v.id, v.approach, v.reports.length, v.reports.filter(r => r.status === 'failed').length, v.claims.filter(c => c.outcome === 'pass').length, checked(v), v.claims.filter(c => !c.reference.trim()).length, t?.accepted === v.id ? 'Accepted' : 'Unaccepted']),
  });
}

export function views(s: State) {
  const t = current(s), a = selectedAttempt(s);
  return [tasksView(s), planView(s, t, a), evidenceView(t, a), compareView(t)];
}
