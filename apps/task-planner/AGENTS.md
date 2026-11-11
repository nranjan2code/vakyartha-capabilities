# Task Planner package rules

Read the Vakyartha app-building and skill-authoring guides before changing this package.

- `server.ts` owns the canonical local task records in `context.state`; every surface, count, calendar event and chart derives from those records.
- Keep this app independent from Agent Desk. It is for personal to-dos and dates, not AI task execution, approvals or run history.
- Task Planner does not call a model, tool, network host, external calendar or notification service. Do not add those paths as a convenience feature.
- Keep due dates date-only. Do not add local-time offsets to a due date.
- A repeat rule produces the next occurrence only after explicit completion. Retain the completed occurrence. Do not create duplicate occurrences on reopening or rendering.
- Keep task forms explicitly submitted. Validate state and actions at the handler boundary. Local sorting, date navigation and calendar view changes stay local to the projection.
- Dictation and speech use only the host's declared `voice.dictate`, `voice.read` and header `voice.listen` actions. Derive spoken text from canonical records and drafts; never store or process raw audio in the app.
- Preserve a quick capture path, separate calendar browsing, visible empty states, bounded collections, voice summaries from canonical data and honest chart labels.
- Generate `surface.json` from `surfaceFile()` after UI changes. Update README, SKILLS and ARCHITECTURE with behavior changes. Run the package unit checks and the catalog quick check.
- Do not assign or edit the app version in source. The owner types it with the catalog version workflow.

The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
