---
name: learning-author
description: Create and curate short source-aware courses for Learning Desk; adapt explanations and practice to age, prior knowledge, goals and time, and propose unreviewed course drafts for the learner.
metadata:
  author: nranjan2code
  version: "0.3"
allowed-tools: use_skill read_skill_file app-learning-desk__get_authoring_context app-learning-desk__propose_course
---

# Create something worth learning

Read get_authoring_context before authoring. It supplies learner preferences, the package contract, limits and expectedRevision. Age/context and prior knowledge are different inputs; do not infer either from a name or writing style. For younger learners establish the adult-guided context and choose appropriate activities. Resolve the learning goal and source scope with the person. Offer a short ordered outline with prerequisites and observable lesson objectives before drafting the course.

Use existing enabled domain/research procedures and governed MCP sources when needed. Skill text grants no tool, network, provider, media or publishing authority. Inspect source material before saying it supports a claim. Preserve source titles and exact links; distinguish further reading from checked evidence. Use original wording or material whose reuse rights are established. Do not reproduce a protected course or infer that publicly readable means reusable. Never invent a citation, source read or factual-review claim. List a source in propose_course only when you read that page in this conversation through a source tool; when none was read, omit sources and say in the reply that the draft has no checked sources. Learning Desk shows listed links as not checked.

Write one bounded lesson at a time: objective, explanation, worked example, real-world activity and multiple-choice question with 2–4 distinct choices, zero-based answer and a reason. Check the calculation and answer independently. Keep lessons comprehensible without audio or pictures. Explain changing facts with their basis/date. Generated images and clips are optional, require normal permissions and costs, and never establish factual accuracy.

Before proposing a complete course, show material uncertainty and let the person review its direction. Re-read get_authoring_context for the current expectedRevision, then call propose_course with that revision and a complete package. A stale response means read again and reconcile; never overwrite another draft or retry an uncertain write automatically. Only a successful receipt means a draft was saved. Tell the learner to inspect it in Curate. Do not claim it is published, independently verified or evidence of mastery. Publication into the personal library remains the learner's local action.

interactive-ui and surface-design govern any requested chat surfaces. broadcast-programme governs optional programmes; the app already derives Listen and Watch from saved lesson records. Do not create a separate narration store, model endpoint, skill loader or retrieval database.

## Shared procedures and maintenance

This exported learning-author procedure owns the learning method; do not create a parallel copy elsewhere. Use enabled app-operator for app controls/receipts, app-maintainer with app-authoring for package changes, app-debugger with debug-error for failures, and app-admin for execution/usage boundaries. Read their actual procedures when needed; names here do not grant tools or guarantee automatic loading. Enabled research/domain skills and curated MCP sources remain the existing extension mechanism.

Skill names/descriptions are selected first; supporting files load through read_skill_file. interactive-ui and required surface-design own any additional chat interfaces; broadcast-programme owns programme composition. The app's deterministic handlers need no skill/model request per study action. Curate's plain-language editor modifies a separate draft buffer; save validates the draft and personal acceptance remains separate. Preserve model/source failures and distinguish proposal mechanics from factual or teaching quality when changing this procedure.

## Explicit course-creation controls

The docked assistant offers Create course draft after an outline. Treat that explicit user request as authorization to write the agreed complete lessons and propose the course through the normal approval boundary; do not require the learner to repeat the request in prose. Revise outline prepares the learner’s editable changes. Check sources requests research without saving. Only a committed proposal receipt enables Review saved drafts, which opens Curate for separate personal acceptance. Do not describe an outline as a saved course or claim teaching quality from a successful save.

The course studio is the shared assistant panel docked beside Learning Desk, with Outline/Create/Review stages supplied by authorWorkflow. The learning brief is collapsed after submission; creation requests show their action label. The narrow layout places the same panel as a sheet below the app. Stage indicators reflect chosen actions and committed draft receipts, not independent content-quality certification.

## Course browsing, progress and lesson media

Discover has explicit category navigation, concise course previews and a Continue learning shelf based on opened courses. My learning filters All, In progress, Not started and Practised; per-course bars count distinct lessons with correct practice answers, not time spent, video completion, mastery or credentials. Previously uncategorized personal courses remain Other until their content is curated. Categories are Mathematics, Science, Reading & media, Technology, Life & work and Other.

Lesson uses a responsive main-content/syllabus split, previous/next navigation and Learn, Practice and My notes tabs. Optional media `{kind:"video"|"audio",url,title,transcript}` accepts an existing `media:UUID` asset or credential-free HTTPS media file. It renders through public Projection media with inline controls, no autoplay and an optional transcript; video webpages/iframes and invented assets are unsupported. The draft editor has Attach video or audio (20 MB), media type/title and optional transcript. Attachment import uses the existing Media store; lesson edits and personal acceptance remain separate. Deleting a course does not delete shared Media assets. Listen/Watch still derive narration from lesson records; neither is a generated video file. Generated media from the existing tools can be attached by its actual saved asset receipt, under existing approvals and costs. There is no automatic media-generation pipeline.

## Exercise relevance is a separate quality check

An optional share experiment is only appropriate when the stated lesson objective teaches a proportional part relative to a whole. Do not add it to unrelated lessons or copy a sample experiment across a course. A valid chart is not evidence of relevance. Omit the lab when its purpose cannot be explained from the objective. During curation, inspect each optional experiment against the actual lesson; the editor can remove it explicitly without rewriting the lesson text. The learner sees optional experiments under Explore, separate from reading and Practice.

Learn is paced as Understand → Example → Try it, using explicit ordinary app actions and persisted readPart. Only the selected reading block is emitted; all other lesson content remains canonical and available through its step. Opening another lesson starts at Understand. Course description is a collapsed About panel. This is presentation/navigation, not an automatic rewrite or learning-completion claim. The shared Listen/Watch controls still narrate the complete lesson.

## Shared Access and package review

This package declares no outbound integration tools and keeps local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Incoming proposal tools still require current revisions and approval, and personal content acceptance remains separate. The assistant has no app-worker model entitlement.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
