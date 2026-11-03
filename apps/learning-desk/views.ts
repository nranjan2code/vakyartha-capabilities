import { allCourses, authorRequest, authorWorkflow, current, type State } from './server.ts';
import { cover } from './art.ts';
import { CATEGORIES, IDEAS } from './content.ts';
import type { Course } from './content.ts';
interface Node { id: string; type: string; props?: Record<string, unknown>; children?: string[] | { each: string; template: string } }
const n = (id: string, type: string, props: Record<string, unknown> = {}, children?: Node['children']): Node => ({ id, type, props, ...(children ? { children } : {}) });
const button = (id: string, label: string, action: string, payload: Record<string, unknown> = {}, style = 'secondary') => n(id, 'button', { label, action, payload, style });
const line = (id: string, content: string, variant = 'body') => n(id, 'text', { content, variant });
const sourceLink = (title:string,url:string) => `[${title.replace(/[\[\]\\]/g,'')}](${url.replace(/\(/g,'%28').replace(/\)/g,'%29')})`;
const update = (surface: string, nodes: Node[], value: Record<string, unknown>) => ({ surface, nodes, data: [{ op: 'replace' as const, path: '/' as const, value }] });
const cards = (path: string, key: string): Node[] => [
  n(key, 'grid', { columns: 2, minItemWidth:'md', gap: 'sm', searchable: true, pageSize: 9 }, { each: path, template: `${key}-card` }),
  n(`${key}-card`, 'card', { title: '{title}', subtitle: '{meta}', body: '{summary}', titleLines: 2, image: '{cover}', imageLayout:'thumbnail' }, [`${key}-progress`,`${key}-actions`]),
  n(`${key}-progress`,'progress',{value:'{done}',max:'{total}',label:'{progressLabel}',kind:'bar',visibleIf:'{started}'}),
  n(`${key}-actions`,'stack',{direction:'horizontal',wrap:true,gap:'sm'},[`${key}-open`,`${key}-save`,`${key}-remove`]),
  button(`${key}-open`, '{openLabel}', 'open_course', { id: '{id}' }, 'primary'),
  button(`${key}-save`, '{saveLabel}', 'save_course', { id: '{id}' }),
  n(`${key}-remove`,'button',{label:'Remove course',action:'ask_remove_course',payload:{id:'{id}'},style:'link',visibleIf:'{personal}'}),
];
const completed = (s:State,c:Course) => new Set(s.attempts.filter(a=>a.course===c.id&&a.correct&&c.lessons.some(l=>l.id===a.lesson)).map(a=>a.lesson)).size;
const preview = (s: State, c: Course) => {
  const done=completed(s,c),started=s.started.includes(c.id)||s.attempts.some(a=>a.course===c.id);
  return { started, id:c.id,title:c.title,summary:c.summary.length>145?c.summary.slice(0,142).trimEnd()+'…':c.summary,age:c.age,personal:c.origin==='personal',cover:cover(c.topic),meta:`${c.category} · ${c.level} · ${c.lessons.length} lessons · ${c.minutes} min / lesson`,done,total:c.lessons.length,progressLabel:done?`${done} of ${c.lessons.length} lessons answered correctly`:started?'Started · continue at your pace':'Not started',openLabel:done===c.lessons.length?'Revisit course':started?'Continue learning':'Start learning',saveLabel:s.saved.includes(c.id)?'Saved · Remove':'Save course'};
};
export function views(s: State) {
  const all = allCourses(s), course = current(s), lesson = course.lessons.find(l => l.id === s.lesson)!;
  const materialId = `materials-${course.id}-${lesson.id}`;
  const attempt = s.attempts.findLast(a => a.course === course.id && a.lesson === lesson.id);
  const done = new Set(s.attempts.filter(a => a.course === course.id && a.correct).map(a => a.lesson));
  const matches = all.filter(c=>s.category==='All'||c.category===s.category);
  const continuing=all.filter(c=>s.started.includes(c.id)&&completed(s,c)<c.lessons.length).slice(0,2);
  const shelf=all.filter(c=>s.saved.includes(c.id)||c.origin==='personal'||s.started.includes(c.id)).filter(c=>s.libraryFilter==='All'||(s.libraryFilter==='Practised'?completed(s,c)===c.lessons.length:s.libraryFilter==='In progress'?(s.started.includes(c.id)||s.attempts.some(a=>a.course===c.id))&&completed(s,c)<c.lessons.length:!s.started.includes(c.id)&&!s.attempts.some(a=>a.course===c.id)));
  const removing=s.courses.find(c=>c.id===s.removeId);
  // An empty category is a dead end; it stays only while selected so the choice remains visible.
  const shown=(category:string)=>category==='All'||category===s.category||all.some(v=>v.category===category);
  const lab=s.labs[`${s.course}/${s.lesson}`]??{part:String(lesson.lab?.part??''),whole:String(lesson.lab?.whole??'')};
  const part=Number(lab.part),whole=Number(lab.whole),valid=lab.part.trim()!==''&&lab.whole.trim()!==''&&Number.isFinite(part)&&Number.isFinite(whole)&&part>=0&&whole>0&&whole<=1000000&&part<=whole;
  const share=valid ? `${part} out of ${whole} is ${(part/whole*100).toLocaleString('en-IN',{maximumFractionDigits:2})}%. Change either value and see what happens.` : 'Use a positive whole up to 1,000,000 and a part between zero and the whole.';
  const programme = { title: `${course.title}: ${lesson.title}`, segments: [
    // A lesson opens like a class: a greeting, what today is about, then what it is for; reference titles are for the screen, not the ear.
    { text: `Hello, and welcome to Learning Desk. Today's lesson is ${lesson.title}, from ${course.title}. ${lesson.objective} ${course.origin==='starter'?'This is an original introductory lesson.':'This is a lesson from your personal course.'} ${course.sources.length?`The course lists ${course.sources.length===1?'one reference':`${course.sources.length} references`}; you'll find ${course.sources.length===1?'it':'them'} in the app.`:'No external reference material is listed.'}`, heading: lesson.title, kicker: course.title, delivery: 'opening', cue: 'intro', break: 'short' },
    { text: lesson.explanation, ...(lesson.lab&&valid?{figures:[{label:'The part',value:String(part)},{label:'The whole',value:String(whole)},{label:'Share',value:`${(part/whole*100).toLocaleString('en-IN',{maximumFractionDigits:2})}%`}],chart:{kind:'bars',bars:[{label:'The part',value:part},{label:'The remainder',value:whole-part}]}}:{}), heading: 'Understand', kicker: lesson.title, delivery: 'story', break: 'story' },
    { text: lesson.example, heading: 'An example', kicker: lesson.title, delivery: 'story', break: 'story' },
    { text: `Now, try this yourself. ${lesson.activity}`, heading: 'Try it', kicker: lesson.title, delivery: 'story', break: 'section' },
    { text: `That's the end of ${lesson.title}. Take a moment with the activity, then check your answer in the app. Thanks for learning with us.`, heading: 'End of lesson', kicker: course.title, delivery: 'closing', cue: 'outro', break: 'section' },
  ] };
  return [
    update('discover', [n('root','stack',{gap:'md'},['intro',...(continuing.length?['continue']:[]),'browse', ...(matches.length ? ['courses'] : ['empty']),'questions']),
      line('intro','Find your next idea. Build knowledge you can put to use.'),
      ...(continuing.length?[n('continue','section',{title:'Continue learning',description:'Pick up a course you have started.'},['continuing']),...cards('/continuing','continuing')]:[]),
      n('browse','section',{title:'Browse by category'},['category-nav','course-count']),
      n('category-nav','stack',{direction:'horizontal',wrap:true,gap:'sm'},['All',...CATEGORIES].flatMap((category,i)=>shown(category)?[`category-${i}`]:[])),
      ...['All',...CATEGORIES].flatMap((category,i)=>!shown(category)?[]:button(`category-${i}`,`${category==='All'?'All courses':category} (${category==='All'?all.length:all.filter(v=>v.category===category).length})`,'choose_category',{category},s.category===category?'primary':'secondary')),
      line('course-count',`${matches.length} courses · ${s.category==='All'?'all categories':s.category}`,'caption'),
      ...(matches.length ? cards('/courses','courses') : [line('empty','No matching saved course. Open Create to build a course with the assistant, or Curate to import one.')]),
      n('questions','section',{title:'A good question is a beginning',description:'Course ideas to shape with your assistant. Choose one and make it yours.'},['ideas']),n('ideas','grid',{columns:3,gap:'sm',pageSize:6},{each:'/ideas',template:'idea'}),n('idea','card',{title:'{title}',subtitle:'{category}',titleLines:2},['idea-open']),button('idea-open','Explore this question','choose_idea',{id:'{id}'}),
    ],{category:s.category,continuing:continuing.map(c=>preview(s,c)),courses:matches.map(c=>preview(s,c)),ideas:IDEAS}),
    update('library',[n('root','stack',{gap:'md'},['intro','learning-summary','library-filters',...(removing?['confirm-remove']:[]),...(shelf.length?['saved']:['empty'])]),line('intro','Your learning, at a glance. Keep moving at your own pace.'),
      line('learning-summary',`${all.filter(c=>s.started.includes(c.id)&&completed(s,c)<c.lessons.length).length} courses in progress · ${all.filter(c=>completed(s,c)===c.lessons.length).length} fully practised · ${all.reduce((sum,c)=>sum+completed(s,c),0)} lessons answered correctly. Practice progress is not a mastery assessment.`,'caption'),
      n('library-filters','stack',{direction:'horizontal',wrap:true,gap:'sm'},['library-filter','library-apply']),n('library-filter','select',{label:'Show courses',bind:'/libraryFilter',options:['All','In progress','Not started','Practised'].map(v=>({label:v,value:v}))}),button('library-apply','Show courses','refresh'),...(removing?[n('confirm-remove','section',{title:`Remove ${removing.title}?`,description:'This removes this personal course and its notes, experiments and practice history.'},['remove-confirm','remove-cancel']),button('remove-confirm','Remove course and its learning records','remove_course',{id:removing.id}),button('remove-cancel','Keep course','cancel_remove')]:[]),...(shelf.length?cards('/courses','saved'):[line('empty','Save a course from Discover or add your own in Curate.')])],{libraryFilter:s.libraryFilter,courses:shelf.map(c=>preview(s,c))}),
    update('lesson',[
      n('root','stack',{gap:'md',maxWidth:'lg'},['heading','basis','course-about','lesson-layout']),
      n('lesson-layout','split',{ratio:'2:1',gap:'md'},['lesson-main','course-outline']),
      n('lesson-main','stack',{gap:'md',maxWidth:'md'},['lesson-position','lesson-title','objective',...(lesson.media?['lesson-media']:[]),materialId,'lesson-nav']),
      n('course-outline','section',{title:'Course content',description:`${course.lessons.length} lessons · ${course.minutes} minutes each`},['course-progress','outline']),
      n('course-progress','progress',{value:done.size,max:course.lessons.length,label:'Practice progress',kind:'bar'}),
      n(materialId,'tabs',{},['read-material',...(lesson.lab?['experiment-material']:[]),'practice-material','notes-material']),
      n('read-material','section',{title:'Learn'},['reading-steps',s.readPart==='example'?'example':s.readPart==='activity'?'activity':'explanation','reading-actions','references']),
      n('reading-steps','stack',{direction:'horizontal',wrap:true,gap:'sm'},['read-concept','read-example','read-activity']),
      ...[['concept','1 · Understand'],['example','2 · Example'],['activity','3 · Try it']].map(([part,label])=>button(`read-${part}`,label!,'read_part',{targetStep:part},s.readPart===part?'primary':'secondary')),
      n('reading-actions','stack',{direction:'horizontal',wrap:true,gap:'sm'},[...(s.readPart!=='concept'?['read-back']:[]),...(s.readPart!=='activity'?['read-next']:[])]),
      ...(s.readPart!=='concept'?[button('read-back',s.readPart==='example'?'Back to the idea':'Back to the example','read_part',{targetStep:s.readPart==='example'?'concept':'example'})]:[]),
      ...(s.readPart!=='activity'?[button('read-next',s.readPart==='concept'?'Next: See an example':'Next: Try it yourself','read_part',{targetStep:s.readPart==='concept'?'example':'activity'},'primary')]:[]),
      ...(lesson.lab?[n('experiment-material','section',{title:'Explore'},['lab'])]:[]),
      n('practice-material','section',{title:'Practice'},['practice']),n('notes-material','section',{title:'My notes'},['notes']),
      n('lesson-nav','stack',{direction:'horizontal',wrap:true,gap:'sm'},[...(course.lessons.indexOf(lesson)>0?['previous-lesson']:[]),...(course.lessons.indexOf(lesson)<course.lessons.length-1?['next-lesson']:[])]),
      ...(course.lessons.indexOf(lesson)>0?[button('previous-lesson','Previous lesson','open_lesson',{id:course.lessons[course.lessons.indexOf(lesson)-1]!.id})]:[]),
      ...(course.lessons.indexOf(lesson)<course.lessons.length-1?[button('next-lesson','Next lesson','open_lesson',{id:course.lessons[course.lessons.indexOf(lesson)+1]!.id},s.readPart==='activity'?'primary':'secondary')]:[]),
      ...(lesson.media?[n('lesson-media','media',{maxWidth:'md',kind:lesson.media.kind,src:lesson.media.url,title:lesson.media.title,transcript:lesson.media.transcript,description:'Course media · play here without leaving the lesson'})]:[]),
      line('heading',course.title,'heading'),n('course-about','accordion',{},['course-details']),n('course-details','section',{title:'About this course'},['course-summary']),line('course-summary',course.summary,'caption'),line('basis',`${course.age} · ${course.level} · ${course.minutes} min · ${done.size}/${course.lessons.length} lessons answered correctly. ${course.origin==='starter'?'Original introductory course; reference links are further reading.':'Personal course; content and answers need your judgement.'}`,'caption'),
      n('outline','grid',{columns:1,gap:'sm',pageSize:12},{each:'/outline',template:'outline-card'}),n('outline-card','stack',{gap:'xs'},['outline-status','open-lesson']),line('outline-status','{status}','caption'),button('open-lesson','{title}','open_lesson',{id:'{id}'},'{style}'),
      line('lesson-position',`Lesson ${course.lessons.indexOf(lesson)+1} of ${course.lessons.length}`,'caption'),line('lesson-title',lesson.title,'heading'),line('objective',lesson.objective,'caption'),...(s.readPart==='concept'?[line('explanation',lesson.explanation)]:[]),
      ...(s.readPart==='example'?[n('example','section',{title:'Work through an example'},['example-text']),line('example-text',lesson.example)]:[]),...(s.readPart==='activity'?[n('activity','section',{title:'Try it in your world'},['activity-text']),line('activity-text',lesson.activity)]:[]),
      ...(lesson.lab?[n('lab','section',{title:'Explore a share',description:'Compare a part with its whole. This optional experiment was included by the course author.'},['lab-inputs','lab-result',...(valid?['lab-chart']:[])]),n('lab-inputs','stack',{direction:'horizontal',wrap:true,gap:'sm'},['lab-part','lab-whole','lab-apply']),n('lab-part','input',{label:'The part',kind:'number',bind:'/lab/part'}),n('lab-whole','input',{label:'The whole',kind:'number',bind:'/lab/whole'}),button('lab-apply','Try these values','refresh'),line('lab-result',share),...(valid?[n('lab-chart','chart',{kind:'pie',title:'Part and remainder',series:{records:'{/labRows}',label:'label',fields:['value']},height:'sm',maxWidth:'sm'})]:[])]:[]),
      n('practice','section',{title:'Check your understanding'},['question','answer','check',...(attempt?['feedback']:[])]),line('question',lesson.question.prompt),
      n('answer','select',{label:'Your answer',bind:'/answer',presentation:'dropdown',options:[{label:'Choose an answer',value:''},...lesson.question.choices.map((label,i)=>({label,value:String(i)}))]}),button('check','Check answer','check_answer',{},'primary'),
      ...(attempt?[n('feedback','alert',{tone:attempt.correct?'success':'info',title:attempt.correct?'You got it':'Try another approach',body:lesson.question.explanation})]:[]),
      n('notes','section',{title:'Keep a thought'},['note','save-note']),n('note','textarea',{label:'Your explanation, question or discovery',bind:'/note'}),button('save-note','Keep note','refresh'),
      n('references','section',{title:'Sources and further reading'},[...(course.sources.length?['source-list']:['no-sources'])]),
      ...(course.sources.length?[n('source-list','grid',{columns:1,pageSize:6},{each:'/sources',template:'source-card'}),n('source-card','card',{title:'{title}',body:'{link}'})]:[line('no-sources','No source references supplied. This course has not been independently verified.')]),
    ],{lab,labRows:valid?[{label:'The part',value:part},{label:'The remainder',value:whole-part}]:[],answer:s.answer,note:s.notes[`${s.course}/${s.lesson}`]??'',outline:course.lessons.map(l=>({id:l.id,title:l.title,status:`Lesson ${course.lessons.indexOf(l)+1}${l.id===s.lesson?' · you are here':done.has(l.id)?' · answered correctly':''}`,style:l.id===s.lesson?'primary':'secondary'})),sources:course.sources.map(x=>({...x,link:sourceLink('Open source',x.url)})),spoken:{lesson:programme}}),
    update('create',[
      n('root','stack',{gap:'md'},['intro','form','explain']),line('intro','What would you like to understand? Shape a short course around a question, an interest or something you found.'),
      n('form','section',{title:'Make it yours'},['topic','goal','setup','source','author-actions']),
      n('topic','input',{label:'Topic or question',bind:'/topic',placeholder:'Why does the Moon change shape?'}),n('goal','textarea',{label:'What would you like to be able to do?',bind:'/goal'}),
      n('setup','stack',{direction:'horizontal',wrap:true,gap:'sm'},['age','level','minutes']),n('source','input',{label:'Start from a source (optional HTTPS link)',bind:'/sourceUrl',placeholder:'An article, a chapter or a page you trust'}),
      n('age','input',{label:'Age band and learning context',bind:'/age',placeholder:'For example: age 10, with a parent'}),n('level','input',{label:'What do you already know?',bind:'/level'}),n('minutes','input',{label:'Minutes per lesson (3–60)',bind:'/minutes'}),
      n('author-actions','stack',{direction:'horizontal',wrap:true,gap:'sm'},['author','find-sources']),button('find-sources','Find courses and sources','assistant.compose',{path:'sourceRequest',workflowPath:'authorWorkflow'}),
      button('author','Create with the assistant','assistant.compose',{path:'authorRequest',workflowPath:'authorWorkflow'},'primary'),
      line('explain','Opens your course studio here. Shape the outline with your assistant, then prepare lessons together. Enabled skills and MCP tools keep their normal permissions. The assistant may save a draft; you decide what belongs in your library.','caption'),
    ],{topic:s.topic,goal:s.goal,age:s.age,level:s.level,minutes:s.minutes,sourceUrl:s.sourceUrl,authorRequest:authorRequest(s),authorWorkflow,sourceRequest:`Help me find trustworthy courses or learning material about ${s.topic || 'a topic we can choose together'} for ${s.age}, with this existing knowledge: ${s.level}. My goal is ${s.goal || 'to understand the basics'}. Use the enabled learning-author and research skills and currently permitted search or source tools. Show sources, level, time and any cost or reuse restrictions. If online search is not available, say so. Do not invent courses or sources. Let's choose material before creating a course draft in Learning Desk.`}),
    curate(s),
  ];
}
function curate(s: State) {
  const draft = s.drafts.find(c=>c.id===(s.edit?.draft??s.reviewDraft)) ?? s.drafts[0];
  const lesson = draft?.lessons.find(l=>l.id===(s.edit?.lesson??s.reviewLesson)) ?? draft?.lessons[0];
  return update('curate',[
    n('root','stack',{gap:'md'},['notice',...(s.edit?['editor']:draft&&lesson?['review']:['no-drafts']),'import']),
    line('notice',s.notice||'Collect, inspect and choose what belongs on your learning shelf. Drafts remain separate until you add them.'),
    ...(s.edit?editor(s.edit):[]),
    ...(!s.edit&&draft&&lesson?[
      n('review','section',{title:draft.title,description:draft.summary},['selectors','review-meta','review-body','review-answer','review-sources','review-actions']),
      n('selectors','stack',{direction:'horizontal',wrap:true,gap:'sm'},['draft-choice','lesson-choice','show-review']),
      n('draft-choice','select',{label:'Draft',bind:'/reviewDraft',presentation:'dropdown',options:s.drafts.map(c=>({label:c.title,value:c.id}))}),
      n('lesson-choice','select',{label:'Lesson to inspect',bind:'/reviewLesson',presentation:'dropdown',options:draft.lessons.map(l=>({label:l.title,value:l.id}))}),button('show-review','Show selection','refresh'),
      line('review-meta',`${draft.age} · ${draft.level} · ${draft.minutes} minutes per lesson · ${draft.lessons.length} lessons. Inspect each lesson, source and answer before adding this course.`,'caption'),
      n('review-body','section',{title:lesson.title},['review-goal','review-explanation','review-example','review-activity']),
      line('review-goal',lesson.objective,'caption'),line('review-explanation',lesson.explanation),line('review-example',`Example: ${lesson.example}`),line('review-activity',`Try it: ${lesson.activity}`),
      n('review-answer','section',{title:'Question and answer key'},['review-question','review-choices','review-key']),line('review-question',lesson.question.prompt),line('review-choices',lesson.question.choices.map((v,i)=>`${i+1}. ${v}`).join('\n')),line('review-key',`Answer ${lesson.question.answer+1}: ${lesson.question.explanation}`),
      line('review-sources',draft.sources.length?['Links listed by the assistant. Learning Desk has not checked them; open each one before relying on it.',...draft.sources.map(x=>sourceLink(x.title,x.url))].join('\n'):'No sources supplied. This draft has not been independently verified.','caption'),
      n('review-actions','stack',{direction:'horizontal',wrap:true,gap:'sm'},['edit-lesson','accept','discard']),button('edit-lesson','Edit this lesson','edit_lesson'),button('accept','Add course to my library','accept_draft',{id:draft.id},'primary'),button('discard','Discard draft','discard_draft',{id:draft.id}),
    ]:s.edit?[]:[line('no-drafts','No drafts yet. Create with the assistant or import a course package below.')]),
    n('import','accordion',{},['package']),n('package','section',{title:'Import a course package',description:'For courses prepared elsewhere. Import validates structure and saves a draft; it does not verify facts or source rights.'},['import-text','import-button']),
    n('import-text','textarea',{label:'Course JSON',bind:'/importText'}),button('import-button','Review imported course','import_course'),
  ],{edit:s.edit??{},reviewDraft:draft?.id??'',reviewLesson:lesson?.id??'',importText:s.importText});
}

function editor(edit: NonNullable<State['edit']>): Node[] {
  return [n('editor','section',{title:'Make this lesson yours',maxWidth:'lg',description:'Edit the draft in ordinary words. Your learning library stays unchanged until you add the course.'},['editor-main','editor-media','editor-experiment','editor-check','editor-actions']),
    n('editor-main','section',{title:'The lesson'},['edit-title','edit-objective','edit-explanation','edit-example','edit-activity']),
    n('edit-title','input',{label:'Lesson title',bind:'/edit/title'}),n('edit-objective','textarea',{label:'What should someone be able to do?',bind:'/edit/objective'}),
    n('edit-explanation','textarea',{label:'Explain the idea',bind:'/edit/explanation'}),n('edit-example','textarea',{label:'Work through an example',bind:'/edit/example'}),n('edit-activity','textarea',{label:'Something to try',bind:'/edit/activity'}),
    n('editor-media','section',{title:'Video or audio (optional)',description:'Use a saved media: asset or real HTTPS media file you are allowed to use, not a video webpage. Playback is embedded in the lesson; no autoplay.'},['attach-media','edit-media-kind','edit-media-url','edit-media-title','edit-media-transcript']),button('attach-media','Attach video or audio','media.attach',{into:'edit/mediaUrl',kindInto:'edit/mediaKind',titleInto:'edit/mediaTitle'}),n('edit-media-kind','select',{label:'Media type',bind:'/edit/mediaKind',options:[{label:'Video',value:'video'},{label:'Audio',value:'audio'}]}),n('edit-media-url','input',{label:'Media file URL',bind:'/edit/mediaUrl'}),n('edit-media-title','input',{label:'Media title',bind:'/edit/mediaTitle'}),n('edit-media-transcript','textarea',{label:'Transcript (optional)',bind:'/edit/mediaTranscript'}),
    n('editor-experiment','section',{title:'Interactive experiment',description:'Include an experiment only when it directly teaches this lesson’s objective. A share experiment compares a part with a whole; remove it when it is unrelated.'},['edit-experiment','experiment-values']),n('edit-experiment','select',{label:'Lesson experiment',bind:'/edit/experiment',options:[{label:'No experiment',value:'none'},{label:'Part and whole',value:'share'}]}),n('experiment-values','stack',{direction:'horizontal',wrap:true,gap:'sm'},['edit-experiment-part','edit-experiment-whole']),n('edit-experiment-part','input',{label:'Starting part (if included)',kind:'number',bind:'/edit/experimentPart'}),n('edit-experiment-whole','input',{label:'Starting whole (if included)',kind:'number',bind:'/edit/experimentWhole'}),
    n('editor-check','section',{title:'Check understanding'},['edit-prompt','edit-choices','edit-answer','edit-feedback']),n('edit-prompt','textarea',{label:'Question',bind:'/edit/prompt'}),n('edit-choices','textarea',{label:'Answer choices (one per line, 2–4)',bind:'/edit/choices'}),
    n('edit-answer','select',{label:'Correct choice',bind:'/edit/answer',presentation:'dropdown',options:edit.choices.split('\n').filter(Boolean).slice(0,4).map((c,i)=>({label:`${i+1}. ${c.slice(0,60)}`,value:String(i)}))}),n('edit-feedback','textarea',{label:'Explain the answer',bind:'/edit/feedback'}),
    n('editor-actions','stack',{direction:'horizontal',wrap:true,gap:'sm'},['edit-save','edit-cancel']),button('edit-save','Save lesson edits','save_lesson',{},'primary'),button('edit-cancel','Discard these edits','cancel_edit'),
  ];
}
