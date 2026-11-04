import { parseCourse, STARTERS, IDEAS, CATEGORIES, type Course } from './content.ts';
import { views } from './views.ts';
export interface Editor { draft:string;lesson:string;title:string;objective:string;explanation:string;example:string;activity:string;prompt:string;choices:string;answer:string;feedback:string;mediaUrl:string;mediaKind:string;mediaTitle:string;mediaTranscript:string;experiment:string;experimentPart:string;experimentWhole:string }
const EDIT_FIELDS=['title','objective','explanation','example','activity','prompt','choices','answer','feedback','mediaUrl','mediaKind','mediaTitle','mediaTranscript','experiment','experimentPart','experimentWhole'] as const;
export interface Attempt { course: string; lesson: string; choice: number; correct: boolean; at: string }
export interface State { readPart:string;category:string;libraryFilter:string;started:string[]; courses: Course[]; drafts: Course[]; saved: string[]; course: string; lesson: string; topic: string; age: string; level: string; goal: string; minutes: string; importText: string; answer: string; attempts: Attempt[]; notes: Record<string, string>; notice: string; seq: number; reviewDraft: string; reviewLesson: string; sourceUrl: string; labs: Record<string, {part:string;whole:string}>; removeId: string; edit?:Editor }
export interface Context { state: State; appRevision?: number }
const text = (x: unknown, max = 1000) => typeof x === 'string' ? x.slice(0, max) : '';
export function normalize(input: unknown): State {
  const x = input && typeof input === 'object' ? input as Partial<State> : {};
  const read = (values: unknown, origin: Course['origin']) => { const ids = new Set(STARTERS.map(c => c.id)); return (Array.isArray(values) ? values : []).slice(0, origin === 'draft' ? 20 : 40).flatMap(c => { try { const id = text(c?.id, 80); if (!/^[a-z0-9-]+$/i.test(id) || ids.has(id)) return []; const course = parseCourse(c, id, origin); ids.add(id); return [course]; } catch { return []; } }); };
  const courses = read(x.courses, 'personal'), drafts=read(x.drafts,'draft');
  const all = [...STARTERS, ...courses];
  const course = all.find(c => c.id === x.course) ?? all[0]!;
  const lesson = course.lessons.find(l => l.id === x.lesson) ?? course.lessons[0]!;
  const attempts = (Array.isArray(x.attempts) ? x.attempts : []).filter(a => a && typeof a.course === 'string' && typeof a.lesson === 'string' && Number.isInteger(a.choice) && typeof a.correct === 'boolean' && typeof a.at === 'string').slice(-1000);
  const notes = Object.fromEntries(Object.entries(x.notes && typeof x.notes === 'object' ? x.notes : {}).slice(0, 300).filter(([, v]) => typeof v === 'string').map(([k,v]) => [k, text(v, 3000)]));
  const labs = Object.fromEntries(Object.entries(x.labs && typeof x.labs==='object' ? x.labs : {}).slice(0,100).map(([k,v])=>[k,{part:text(v?.part,20),whole:text(v?.whole,20)}]));
  let edit:Editor|undefined; if(x.edit && typeof x.edit==='object') { const raw=x.edit; edit={draft:text(raw.draft,80),lesson:text(raw.lesson,80),...Object.fromEntries(EDIT_FIELDS.map(k=>[k,text(raw[k],5000)]))} as Editor; if(!drafts.some(d=>d.id===edit!.draft&&d.lessons.some(l=>l.id===edit!.lesson)))edit=undefined; }
  return { readPart:['concept','example','activity'].includes(x.readPart??'')?x.readPart!:'concept', category:CATEGORIES.some(v=>v===x.category)?x.category!:'All', libraryFilter:['All','In progress','Not started','Practised'].includes(x.libraryFilter??'')?x.libraryFilter!:'All', started:(Array.isArray(x.started)?x.started:[]).filter(id=>all.some(c=>c.id===id)).slice(0,43), edit, removeId:text(x.removeId,80), labs, sourceUrl:text(x.sourceUrl, 1000), reviewDraft: text(x.reviewDraft, 80), reviewLesson: text(x.reviewLesson, 80), courses, drafts, saved: (Array.isArray(x.saved) ? x.saved : []).filter(id => all.some(c => c.id === id)), course: course.id, lesson: lesson.id, topic: text(x.topic, 120), age: text(x.age, 80) || 'Adult', level: text(x.level, 80) || 'Beginner', goal: text(x.goal, 1000), minutes: text(x.minutes, 3) || '10', importText: text(x.importText, 120000), answer: text(x.answer, 5), attempts, notes, notice: text(x.notice, 500), seq: Number.isSafeInteger(x.seq) && x.seq! >= 0 ? x.seq! : 0 };
}
export const allCourses = (s: State) => [...STARTERS, ...s.courses];
export const current = (s: State) => allCourses(s).find(c => c.id === s.course)!;
export const authorWorkflow = {
  title: 'Course studio', stages: ['Outline', 'Create', 'Review'], brief: 'Your learning brief',
  boundary: 'You stay in control. Drafts need your review; nothing is added to your library automatically.',
  saved: 'Draft saved. Review the lessons before adding the course to your library.',
  guide: {
    start: { heading: 'Start with a clear direction', hint: 'Send your topic and learning goal. Shape a short outline here before creating the lessons.' },
    responded: { heading: 'Turn the outline into lessons', hint: 'Create the lesson explanations, worked examples and practice. You’ll review the draft before it enters your library.' },
    saved: { heading: 'Your draft is ready', hint: 'Open the lessons, check the examples and answers, and make them yours before adding the course to your library.' },
  },
  steps: [
    { id: 'create', label: 'Create course draft', mode: 'send', stage: 1, message: 'Proceed with the outline we discussed. Create the complete course with explanations, worked examples, practical activities, questions, answer keys and feedback for every lesson. Use original examples; preserve the agreed learner, goal and time. Use only sources actually checked and make any uncertainty explicit. Read the current Learning Desk authoring context, then save the complete course with propose_course as an unreviewed draft for me to inspect. Do not add it to my library.' },
    { id: 'revise', label: 'Revise outline', mode: 'edit', message: 'Please revise the outline with these changes: ' },
    { id: 'sources', label: 'Check sources', mode: 'send', message: 'Check a small set of trustworthy public references for the course we are planning using currently enabled source tools. Explain what each source supports and any uncertainty or reuse limits. If tools are unavailable, say so; do not invent citations or claim a read. Do not create or save a course yet.' },
  ],
  review: { label: 'Review saved drafts', surface: 'curate', tool: 'propose_course', stage: 2 },
};
export function authorRequest(s: State): string {
  return `I'd like to learn about ${s.topic || 'a topic we can choose together'}. My goal: ${s.goal || 'understand the basics and try something practical'}. Age and context: ${s.age}. What I already know: ${s.level}. I have ${s.minutes} minutes per lesson.${s.sourceUrl ? ` Start from this source link, checking it through enabled source tools: ${s.sourceUrl}.` : ''} Please help me create this course in Learning Desk. Let's agree a short outline first, then prepare the lessons, examples and practice. Save a complete course as a draft in Learning Desk when I ask; I will review it before adding it to my library. Keep unknown facts, unverified sources and any paid work explicit.`;
}
export async function handleAction(controlId: string, value: unknown, c: Context, action?: string) {
  const s = c.state = normalize(c.state), p = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  let focusSurface: string | undefined;
  if (!action) {
    const field = controlId.slice(1);
    if (['topic','age','level','goal','minutes','importText','answer','reviewDraft','reviewLesson','sourceUrl','category','libraryFilter'].includes(field)) (s as unknown as Record<string, unknown>)[field] = text(value, field === 'importText' ? 120000 : 1000);
    else if (controlId.startsWith('/edit/') && s.edit && EDIT_FIELDS.some(k=>controlId===`/edit/${k}`)) s.edit[controlId.slice(6) as typeof EDIT_FIELDS[number]]=text(value,5000);
    else if (controlId === '/lab/part' || controlId === '/lab/whole') { const key=`${s.course}/${s.lesson}`, l=current(s).lessons.find(l=>l.id===s.lesson)!; if(!l.lab)throw new Error('This lesson has no experiment'); const values=s.labs[key]??{part:String(l.lab.part),whole:String(l.lab.whole)};values[controlId.endsWith('part')?'part':'whole']=text(value,20);s.labs[key]=values; }
    else if (controlId === '/note') { const key = `${s.course}/${s.lesson}`; if (!(key in s.notes) && Object.keys(s.notes).length >= 300) throw new Error('Notebook limit reached (300 lesson notes)'); s.notes[key] = text(value, 3000); }
    else throw new Error('Unknown learning field');
  } else if (action === 'read_part') {
    if(!['concept','example','activity'].includes(String(p.targetStep)))throw Error('Choose a reading step');s.readPart=String(p.targetStep);
  } else if (action === 'choose_category') {
    if(p.category!=='All'&&!CATEGORIES.some(v=>v===p.category))throw Error('Choose an available category');s.category=String(p.category);
  } else if (action === 'choose_idea') {
    const idea=IDEAS.find(i=>i.id===p.id); if(!idea)throw new Error('Choose an available idea'); s.topic=idea.topic;s.goal=idea.goal;focusSurface='create';
  } else if (action === 'open_course') {
    const course = allCourses(s).find(x => x.id === p.id); if (!course) throw new Error('Choose an available course');
    if(!s.started.includes(course.id))s.started.push(course.id);
    s.readPart='concept';s.course = course.id; s.lesson = (course.lessons.find(l => !s.attempts.some(a => a.course === course.id && a.lesson === l.id && a.correct)) ?? course.lessons[0])!.id; s.answer = ''; focusSurface = 'lesson';
  } else if (action === 'open_lesson') {
    if (!current(s).lessons.some(x => x.id === p.id)) throw new Error('Choose an available lesson');
    s.lesson = String(p.id); s.readPart='concept'; s.answer = ''; focusSurface = 'lesson';
  } else if (action === 'save_course') {
    if (!allCourses(s).some(x => x.id === p.id)) throw new Error('Course no longer exists');
    s.saved = s.saved.includes(String(p.id)) ? s.saved.filter(id => id !== p.id) : [...s.saved, String(p.id)];
  } else if (action === 'ask_remove_course') {
    if(!s.courses.some(c=>c.id===p.id))throw new Error('Only personal courses can be removed');s.removeId=String(p.id);focusSurface='library';
  } else if (action === 'cancel_remove') s.removeId='';
  else if (action === 'remove_course') {
    if(!s.removeId || s.removeId!==p.id)throw new Error('Review the course removal first');const id=s.removeId;s.courses=s.courses.filter(c=>c.id!==id);s.saved=s.saved.filter(v=>v!==id);s.attempts=s.attempts.filter(a=>a.course!==id);s.started=s.started.filter(v=>v!==id);s.notes=Object.fromEntries(Object.entries(s.notes).filter(([k])=>!k.startsWith(`${id}/`)));s.labs=Object.fromEntries(Object.entries(s.labs).filter(([k])=>!k.startsWith(`${id}/`)));s.removeId='';s.course=STARTERS[0]!.id;s.lesson=STARTERS[0]!.lessons[0]!.id;s.answer='';
  } else if (action === 'check_answer') {
    const l = current(s).lessons.find(x => x.id === s.lesson)!;
    if (!/^\d$/.test(s.answer) || Number(s.answer) >= l.question.choices.length) throw new Error('Choose an answer first');
    s.attempts.push({ course: s.course, lesson: s.lesson, choice: Number(s.answer), correct: Number(s.answer) === l.question.answer, at: new Date().toISOString() });
    s.attempts = s.attempts.slice(-1000);
  } else if (action === 'edit_lesson') {
    const draft=s.drafts.find(d=>d.id===s.reviewDraft)??s.drafts[0];const lesson=draft?.lessons.find(l=>l.id===s.reviewLesson)??draft?.lessons[0];if(!draft||!lesson)throw new Error('Choose a draft lesson first');
    s.edit={draft:draft.id,lesson:lesson.id,title:lesson.title,objective:lesson.objective,explanation:lesson.explanation,example:lesson.example,activity:lesson.activity,prompt:lesson.question.prompt,choices:lesson.question.choices.join('\n'),answer:String(lesson.question.answer),feedback:lesson.question.explanation,mediaUrl:lesson.media?.url??'',mediaKind:lesson.media?.kind??'video',mediaTitle:lesson.media?.title??'',mediaTranscript:lesson.media?.transcript??'',experiment:lesson.lab?'share':'none',experimentPart:lesson.lab?String(lesson.lab.part):'',experimentWhole:lesson.lab?String(lesson.lab.whole):''};
  } else if (action === 'cancel_edit') s.edit=undefined;
  else if (action === 'save_lesson') {
    const edit=s.edit,draft=s.drafts.find(d=>d.id===edit?.draft);if(!edit||!draft)throw new Error('Open a draft lesson to edit');if(!/^[0-3]$/.test(edit.answer))throw new Error('Choose the correct answer');
    if(!['none','share'].includes(edit.experiment))throw Error('Choose whether to include the share experiment');
    const raw={...draft,lessons:draft.lessons.map(l=>l.id!==edit.lesson?l:{...l,lab:edit.experiment==='share'?{kind:'share',part:edit.experimentPart.trim()?Number(edit.experimentPart):NaN,whole:edit.experimentWhole.trim()?Number(edit.experimentWhole):NaN}:undefined,media:edit.mediaUrl.trim()?{kind:edit.mediaKind,url:edit.mediaUrl.trim(),title:edit.mediaTitle,transcript:edit.mediaTranscript}:undefined,title:edit.title,objective:edit.objective,explanation:edit.explanation,example:edit.example,activity:edit.activity,question:{prompt:edit.prompt,choices:edit.choices.split('\n').map(c=>c.trim()).filter(Boolean),answer:Number(edit.answer),explanation:edit.feedback}})};
    const updated=parseCourse(raw,draft.id);if(Buffer.byteLength(JSON.stringify([...s.courses,...s.drafts.filter(d=>d.id!==draft.id),updated]))>1000000)throw new Error('Course content limit reached (1 MB)');s.drafts=s.drafts.map(d=>d.id===draft.id?updated:d);s.edit=undefined;s.notice='Lesson edits saved. Review the remaining lessons before adding the course.';
  } else if (action === 'import_course' || action === 'propose_course') {
    if (s.edit) throw new Error('Save or discard the current lesson edits first');
    if (s.drafts.length >= 20) throw new Error('Review or discard a draft first (20 draft limit)');
    const raw = action === 'import_course' ? JSON.parse(s.importText) : p.course;
    do { s.seq++; if(!Number.isSafeInteger(s.seq))throw new Error('Course identifier limit reached'); } while([...s.courses,...s.drafts].some(c=>c.id===`course-${s.seq}`));
    const course = parseCourse(raw, `course-${s.seq}`);
    if (Buffer.byteLength(JSON.stringify([...s.courses,...s.drafts,course])) > 1000000) throw new Error('Course content limit reached (1 MB); discard a draft or remove a personal course before importing more');
    s.drafts.unshift(course); s.reviewDraft = course.id; s.reviewLesson = course.lessons[0]!.id; s.importText = ''; s.notice = 'Course draft saved. Review every lesson and answer before adding it to your library.'; focusSurface = 'curate';
  } else if (action === 'accept_draft') {
    if(s.edit)throw new Error('Save or discard the current lesson edits first');
    const draft = s.drafts.find(x => x.id === p.id); if (!draft) throw new Error('Draft no longer exists');
    if (s.courses.length >= 40) throw new Error('The library holds 40 personal courses; remove one from My learning first');
    s.courses.push({ ...draft, origin: 'personal' }); s.drafts = s.drafts.filter(x => x.id !== p.id); s.saved.push(draft.id); s.course = draft.id; s.lesson = draft.lessons[0]!.id; s.answer = ''; focusSurface = 'lesson'; s.notice = 'Added to your library. Personal acceptance is not independent factual verification.';
  } else if (action === 'discard_draft') { s.drafts = s.drafts.filter(x => x.id !== p.id); if(s.edit?.draft===p.id)s.edit=undefined; }
  else if (action === 'refresh') { /* Host refresh recomputes local views; no model or source reads. */ }
  else throw new Error('Unknown learning action');
  return { updates: views(s), ...(focusSurface ? { focusSurface } : {}) };
}
export async function refresh(c: Context) { return handleAction('', {}, c, 'refresh'); }
export async function handleQuery(name: string, _params: unknown, c: Context) {
  const s = normalize(c.state);
  if (name === 'get_authoring_context') return { expectedRevision: c.appRevision, learner: { topic: s.topic, age: s.age, level: s.level, goal: s.goal, sourceUrl:s.sourceUrl, minutes: s.minutes }, courses: allCourses(s).map(c => ({ id: c.id, title: c.title })), schema: { categories:CATEGORIES, category:'one of categories', optionalLessonMedia:{kind:'video or audio',url:'existing media:UUID from Vakyartha media tools, or credential-free HTTPS file; never invent an asset or use a webpage',title:'text',transcript:'optional text'}, title: 'text', summary: 'text', topic: 'text', age: 'text', level: 'text', minutes: 'integer 3–60', sources: 'optional: only pages read in this conversation through a source tool, title and link as read; omit when none were read', lessons: [{ title: 'text', objective: 'text', explanation: 'text', example: 'text', activity: 'text', question: { prompt: 'text', choices: ['choice 0','choice 1'], answer: 'zero-based integer', explanation: 'text' } }] }, limits: '1–12 complete lessons; 20 drafts; sources are references, not proof of review' };
  throw new Error('Unknown learning query');
}
export function surfaceFile() { return views(normalize({})).map(u => ({ id: u.surface, title: ({ discover: 'Discover', library: 'My learning', lesson: 'Lesson', create: 'New course', curate: 'Review drafts' } as Record<string,string>)[u.surface], nodes: u.nodes, data: u.data[0]!.value })); }

/** Rebuild saved views during a reviewed package update; no source calls. */
export async function renderApp(context: Context) { return {updates:views(normalize(context.state))}; }
