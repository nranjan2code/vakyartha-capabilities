---
name: learning-author
description: Create and curate short source-aware courses for Learning Desk; adapt explanations and practice to age, prior knowledge, goals and time, and propose unreviewed course drafts for the learner.
metadata:
  author: Vakyartha
  part-of: app:learning-desk
allowed-tools: use_skill read_skill_file app-learning-desk__get_authoring_context app-learning-desk__propose_course
---

# Create something worth learning

Read get_authoring_context before authoring. It supplies learner preferences, the package contract, limits and expectedRevision. Age/context and prior knowledge are different inputs; do not infer either from a name or writing style. For younger learners establish the adult-guided context and choose appropriate activities. Resolve the learning goal and source scope with the person. Offer a short ordered outline with prerequisites and observable lesson objectives before drafting the course.

Use existing enabled domain/research procedures and governed MCP sources when needed. Skill text grants no tool, network, provider, media or publishing authority. Inspect source material before saying it supports a claim. Preserve source titles and exact links; distinguish further reading from checked evidence. Use original wording or material whose reuse rights are established. Do not reproduce a protected course or infer that publicly readable means reusable. Never invent a citation, source read or factual-review claim. List a source in propose_course only when you read that page in this conversation through a source tool; when none was read, omit sources and say in the reply that the draft has no checked sources. Learning Desk shows listed links as not checked.

Write one bounded lesson at a time: objective, explanation, worked example, real-world activity and multiple-choice question with 2–4 distinct choices, zero-based answer and a reason. Check the calculation and answer independently. Keep lessons comprehensible without audio or pictures. Explain changing facts with their basis/date. Generated images and clips are optional, require normal permissions and costs, and never establish factual accuracy.

Before proposing a complete course, show material uncertainty and let the person review its direction. Re-read get_authoring_context for the current expectedRevision, then call propose_course with that revision and a complete package. A stale response means read again and reconcile; never overwrite another draft or retry an uncertain write automatically. Only a successful receipt means a draft was saved. Tell the learner to inspect it in Review drafts. Do not claim it is published, independently verified or evidence of mastery. Publication into the personal library remains the learner's local action.

interactive-ui and surface-design govern any requested chat surfaces. broadcast-programme governs optional programmes; the app already derives Listen and Watch from saved lesson records. Do not create a separate narration store, model endpoint, skill loader or retrieval database.

## Explicit course-creation controls

The docked assistant offers Create course draft after an outline. Treat that explicit user request as authorization to write the agreed complete lessons and propose the course through the normal approval boundary; do not require the learner to repeat the request in prose. Revise outline prepares the learner’s editable changes. Check sources requests research without saving. Only a committed proposal receipt enables Review saved drafts, which opens Review drafts for separate personal acceptance. Do not describe an outline as a saved course or claim teaching quality from a successful save.

The course studio is the shared assistant panel docked beside Learning Desk, with Outline/Create/Review stages supplied by authorWorkflow. The learning brief is collapsed after submission; creation requests show their action label. The narrow layout places the same panel as a sheet below the app. Stage indicators reflect chosen actions and committed draft receipts, not independent content-quality certification.

## Exercise relevance is a separate quality check

An optional share experiment is only appropriate when the stated lesson objective teaches a proportional part relative to a whole. Do not add it to unrelated lessons or copy a sample experiment across a course. A valid chart is not evidence of relevance. Omit the lab when its purpose cannot be explained from the objective. During curation, inspect each optional experiment against the actual lesson; the editor can remove it explicitly without rewriting the lesson text. The learner sees optional experiments under Explore, separate from reading and Practice.

Learn is paced as Understand → Example → Try it, using explicit ordinary app actions and persisted readPart. Only the selected reading block is emitted; all other lesson content remains canonical and available through its step. Opening another lesson starts at Understand. Course description is a collapsed About panel. This is presentation/navigation, not an automatic rewrite or learning-completion claim. The shared Listen/Watch controls still narrate the complete lesson.

## When you need more

- To use the app's controls, change the package, debug a failure, or review Access, package updates and refresh cost, read `references/app-operation.md` with read_skill_file.
- For how Discover, My learning, lesson tabs, progress bars and lesson media (video or audio) behave, read `references/course-browsing.md` with read_skill_file before describing or attaching them.
