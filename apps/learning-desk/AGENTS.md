# Working on Learning Desk

Read [BUILDING-APPS.md](../../../docs/development/BUILDING-APPS.md), [SKILL-AUTHORING.md](../../../docs/development/SKILL-AUTHORING.md), [PROGRAMMES.md](../../../docs/features/PROGRAMMES.md) and this package's README, SKILLS and ARCHITECTURE before changes.

Keep one normalized state owner. Derive all five surfaces, quizzes, notes and spoken lesson from that state. Never call models or providers inside this sandbox, grant raw network, or create a parallel skill loader. AI content creation uses the host-owned studio, existing enabled skills and MCP permissions. assistant.compose prepares text only; it cannot submit it. Any exported state-changing tool must declare readOnly false, require the current expectedRevision and save only a draft. Never expose accept_draft as an assistant tool.

Course JSON is untrusted. Validate every lesson and answer, bound every field and collection, and accept credential-free HTTPS reference links only. Sources are references, not evidence of successful fetching or validation. Never label an imported or generated draft as reviewed. Correct multiple-choice answers record practice evidence; do not infer mastery or award credentials.

Keep course cards compact, lesson text readable, controls beside their results, selections explicit and whole collections available through local pagination/search. Use public Projection components only. Curate shows one draft and one lesson at a time; do not expand whole course manuscripts in a card grid. No decorative hero, streak penalties or duplicate listening controls.

Change content.ts, server.ts or views.ts, regenerate surface.json with node scripts/app-surfaces.ts and synchronize all four documents. Verify state transitions and lint, real sandbox execution, stale proposal refusal and integration annotations. Check WebKit at desktop wide/narrow and browser widths. Record failed outcomes honestly in docs/HANDOVER.md; mocked authoring is not a real provider outcome.

Lesson editing uses a separate persistent editor buffer; incomplete fields must not corrupt or remove a valid draft. Validate on Save lesson edits, preserve stable lesson IDs and block acceptance while edits remain pending. Do not silently repair model content. A mechanically valid proposal can still need editorial correction; preserve independent review findings and the original evidence.

Keep the docked assistant beside the app and explicit next-step controls. Declare bounded workflow data, including the studio's title, stages and guidance, in the Create surface; no prose parsing or generated button labels may establish workflow progress. Create uses the same conversation and approval pipeline; Revise only prepares text. Review requires the declared mutating tool’s actual commit receipt and an existing review view. Preserve unsent edits, independent surfaces, Close/return behavior and a visible app view at all four widths.

The course studio is the shared assistant panel docked beside Learning Desk, with Outline/Create/Review stages supplied by authorWorkflow. The learning brief is collapsed after submission; creation requests show their action label. The narrow layout places the same panel as a sheet below the app. Stage indicators reflect chosen actions and committed draft receipts, not independent content-quality certification.

## Course browsing, progress and lesson media

Discover has explicit category navigation, concise course previews and a Continue learning shelf based on opened courses. My learning filters All, In progress, Not started and Practised; per-course bars count distinct lessons with correct practice answers, not time spent, video completion, mastery or credentials. Previously uncategorized personal courses remain Other until their content is curated. Categories are Mathematics, Science, Reading & media, Technology, Life & work and Other.

Lesson uses a responsive main-content/syllabus split, previous/next navigation and Learn, Practice and My notes tabs. Optional media `{kind:"video"|"audio",url,title,transcript}` accepts an existing `media:UUID` asset or credential-free HTTPS media file. It renders through public Projection media with inline controls, no autoplay and an optional transcript; video webpages/iframes and invented assets are unsupported. The draft editor has Attach video or audio (20 MB), media type/title and optional transcript. Attachment import uses the existing Media store; lesson edits and personal acceptance remain separate. Deleting a course does not delete shared Media assets. Listen/Watch still derive narration from lesson records; neither is a generated video file. Generated media from the existing tools can be attached by its actual saved asset receipt, under existing approvals and costs. There is no automatic media-generation pipeline.

Lesson 0.2.1 uses a bounded reading measure and a compact 2:1 content/syllabus split. Optional share experiments live in Explore, separate from Learn, Practice and My notes; they are not evidence of course progress. The draft editor can remove or adjust the part/whole experiment. Keep relevance review explicit: stored/generated experiments must not be silently deleted or reinterpreted. Test course/lesson changes through the existing SurfaceStore update path so irrelevant old nodes cannot remain visible.

Learn is paced as Understand → Example → Try it, using explicit ordinary app actions and persisted readPart. Only the selected reading block is emitted; all other lesson content remains canonical and available through its step. Opening another lesson starts at Understand. Course description is a collapsed About panel. This is presentation/navigation, not an automatic rewrite or learning-completion claim. The shared Listen/Watch controls still narrate the complete lesson.

## Shared Access and package review

This package declares no outbound integration tools and keeps local app state. Access explains this local-only boundary; host Voice, attachment and explicit export operations keep their own controls. Incoming proposal tools still require current revisions and approval, and personal content acceptance remains separate. The assistant has no app-worker model entitlement.

The Vakyartha host owns the Access panel and permission reasons; Rust is the sole desktop grant writer. Do not add app permission dialogs/stores, permission-error regexes or global-Allow shortcuts. Skills and manifests confer no authority.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
