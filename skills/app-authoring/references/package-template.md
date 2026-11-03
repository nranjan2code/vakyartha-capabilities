# Executable app package template

Use this structure for every new executable application. Read the current offered tool schema and runtime contract first. Adapt names/data/actions to the actual request; do not copy unsupported capabilities or leave template claims as completion evidence.

## Required package files

```text
app.json
server.ts
surface.json
README.md
AGENTS.md
SKILLS.md
ARCHITECTURE.md
```

Include every relative source module used by the backend. Add inert domain references or a verification procedure when needed. The documentation belongs inside the app package and travels with draft, source review and publication. No runtime permission comes from these files. `SKILLS.md` describes procedural support; it is not an executable skill-loader manifest.

## app.json contract

Declare a stable lowercase ID, exact semantic version, name/description, the supported Node backend (`runtime.engine: "node26"`) and surface entrypoint. Start with no tools, no schedule and no external credentials. Add only actual exact offered MCP tool names (or internal app tools via `app-<sourceAppId>__<toolName>`). Use `network: {mode: "brokered", allowedDomains: []}` for governed tools; raw HTTP/DNS grants are unsupported. Opt into bounded DuckDB only if the app needs persistent SQL. Manifest memory/storage numbers do not establish process quotas. Hosted operation is explicit opt-in after publication and run only while the host is awake/running.

Declare inter-app exports and subscriptions when exposing or consuming cross-app data:
- `exports.tools`: Array of `{ name, title?, description, inputSchema, readOnly? }` for MCP tools exposed through the existing integration lifecycle. Read-only tools use handleQuery; explicit readOnly false actions require integer expectedRevision and use handleAction.
- `exports.feeds`: Array of `{ id, description, dataPath? }` for reactive event snapshots emitted by this app.
- `exports.skills`: Array of `{ name, description, path? }` referring to a packaged skill file to publish domain reasoning skills into Vakyartha's Skills catalog.
- `triggers`: Array of `{ id, name, kind: "cron", expression, action }` for periodic refresh, `{ id, kind: "startup", action, maxDurationSec }` for start/restart/host launch, or `{ id, name, kind: "app-feed", sourceApp, feedId, action }` to reactively subscribe to another app's feed.

## Backend method

1. Define source-record identities, controls, nullable facts and units before layout.
2. Choose one canonical data owner: `context.state` for ordinary bounded state; `context.database` for opted-in SQL records. Derived surface data is a projection, not a second writer.
3. Validate all action IDs, enum selections, record identities and numeric/date inputs. Bind SQL values rather than interpolating them. Validate the actual source tool result before storage; record source/retrieval times and failures separately.
4. Export `async handleAction(controlId, value, context, action)`. Each promised refresh export must fetch or compute something real. Do not add a timer or pretend a counter is real external synchronization.
5. For read-only exported tools, export `async handleQuery(toolName, params, context): Promise<unknown>`. The host discards query state/database changes and never advances the revision. For declared readOnly false tools, require integer expectedRevision in inputSchema and route the exported name through handleAction; the host checks/removes expectedRevision before invocation. These actions default to Ask and commit through the existing writer.
6. For reactive feed triggers (`kind: "app-feed"`), the declared action receives `context.triggerPayload` containing the emitted feed event. Validate the payload, update `context.state`, and return surface updates.
7. Return all affected independent surfaces through `{updates:[{surface,data,nodes?}]}`. Explicit navigation can additionally name a validated `focusSurface`. Preserve unrelated views and user edits.
8. Use `context.callTool` only for declared, actually permitted tools (external integrations or internal app tools like `app-<sourceAppId>__<toolName>`). Parse returned JSON text. Keys stay in the host. Rehearsal has no external-tool authority. Empty/offline/error results are explicit, not invented successful observations.
9. Strict airgap: All app virtual MCP tools, inter-app queries, and feed events run strictly in-process and in-memory inside Vakyartha. No network listeners, daemon processes, or TCP/UDP ports are ever opened; external systems on the internet cannot discover or call these tools. Host Settings manages policy (Allow/Ask/Off).
10. For SQL use `context.database.run(sql, parameters?)` and `query(sql, parameters?)`; keep queries/snapshots within current limits and plan migrations explicitly. No direct driver imports, persistent local volumes or arbitrary dependencies.

## Interface method

1. One canonical owner (`context.state` or `context.database`); normalize state at the start of each run because it is untrusted and older versions may have written other shapes.
2. Put records in surface data and repeat them with `children: {each: "/records", template: "row"}` (template binds `"{field}"`, `bind: "done"`, `payload: {id: "{id}"}`); never one node per record. A pure `view(state)` returns every surface's complete nodes and data; return them all in `updates`. Emit only the nodes that apply now (no editor without an open record); stable node ids from record ids.
3. Interactions: buttons arrive as `(action, payload)`; bound fields as `(bindPath, value)`, batched after typing pauses and before the next action, so fields may autosave.
4. Lint rules the host enforces: each bound input has a button or form in its enclosing container; each `{/path}` exists in the data. Keep alert/card bodies to plain sentences.
5. Host capabilities: assistant.compose opens an inert, editable in-app authoring request through the existing chat pipeline; header refresh and manifest `voice.listen` (a factual script, or a programme for Listen and Watch, at a surface data path, with a shared per-app voice picker); `voice.dictate` `{into: input node id}` and `voice.read` `{text: "/pointer"}` buttons (payload pointers arrive as their values); several surfaces become tabs; `focusSurface` switches after an action; errors you throw show in the header status chip.
6. An explicit CSV export button may use `{action:"file.save",payload:{name:"report",text:"/export/csv"}}`. Derive bytes from canonical records with units/provenance. The shared host and Rust own safe Downloads export and receipts; apps receive no filesystem authority.
7. Ship surface.json as `view` of the empty state, and test that they match.

## README.md template

- Purpose and actual implemented capabilities.
- Setup: required integrations, exact read/write tools and per-tool permissions; no secrets in source.
- Main views and actions: what edits, submissions, refresh and navigation do.
- Data contract: provenance, units, dates/timezone, freshness, retention and missingness.
- Scheduling: cadence, opt-in, awake/running requirements, missed/failed run behavior; distinguish polling from streaming.
- Persistence and schema version/migration/reset policy.
- Error/recovery instructions and evidence/verification steps.
- Unsupported capabilities and current verification status. Never mark placeholders as implemented.

## AGENTS.md template

- Read order: this file, README.md, SKILLS.md, ARCHITECTURE.md, applicable repository rules.
- Canonical data owner, schema version, invariant fields, units and identities.
- Allowed action/tool contract and forbidden permission/credential shortcuts.
- Layout/independent-surface/interaction contracts that maintenance must preserve.
- Change method: inspect full source, preserve fingerprints/state, create draft, verify, review and publish.
- Required checks and frozen source/value/interaction/receipt expectations. Retain failures.
- Update the docs when code changes; explain unsupported capabilities truthfully.

## SKILLS.md template

List the relevant existing enabled skills and their actual responsibilities:
- `app-authoring`: complete package and reviewed draft construction.
- `app-maintainer`: updates, schema compatibility, preservation and rollback decisions.
- `app-debugger` plus `debug-error`: app-specific diagnosis with retained receipts.
- `app-operator` / `app-admin`: execution, scheduling and recovery.
- `interactive-ui` and required `surface-design`: canonical bindings, appropriate chart/layout/interaction choices.
- Only relevant domain skills, source integrations and when to use each.
- If the app publishes domain skills (`exports.skills`), describe their specialized reasoning procedures and how the primary agent uses them.

Explain that skill names/descriptions are selected first, supporting text loads through `read_skill_file`, and skills grant no execution/tool authority. App actions execute ordinary code without a model request. Do not invent skill names or automatic chaining guarantees. State how to maintain this file after adding/removing a capability.

## ARCHITECTURE.md template

- File map and responsibilities.
- Flow: UI action / cron refresh / feed event → serialized app owner → supervised sandbox → permitted integration/SQL → validated canonical updates → atomic persistence → projections.
- Inter-app data flow: incoming read-only queries (`handleQuery`) run in supervised isolation with mutations discarded; outgoing cross-app tool calls (`context.callTool`) resolve via in-process virtual MCP; reactive feeds dispatch events to subscribed apps via `context.triggerPayload`.
- Separate UI state/controls, source facts, derived data and receipts.
- Runtime/data/network boundaries: strict internal airgap (no network listeners or internet exposure), documented bounds and single-writer ownership.
- Schema evolution, errors, uncertainty, recovery and cancellation.
- Extension points: which changes belong in app code, Projection, integration lifecycle or sandbox helper.

## Verification and completion

Check package completeness, valid manifest/surfaces, actual handler exports, initial empty/error state, known-value calculations and every advertised action. Rehearse without external access, then independently check authorized real sources, controls, durable reopening, refresh and output receipts. Inspect native WebKit at wide and narrow widths; test keyboard/touch paths and visible source/empty/error states. A schedule declaration is not proof that an unattended run works.

Confirm all six required source/document files are in `save_app_draft.files` and app.json is supplied through the manifest argument, with no blank headings, unresolved TODOs or unsupported claims when declaring the app ready. Retain incomplete drafts as incomplete. Report separately: source saved, rehearsal result, source/value checks, publication receipt, scheduling state and installed-runtime scope. Source text alone proves none of those outcomes.

## Host settings and event ownership

Every executable app has a host-owned Settings entry for effective connection readiness, app-specific foreground/background/tool/destination controls and in-place integration setup, schedules, last-run status and package/data details. Exported app tools automatically provision into Settings → Integrations under category "Application" as in-process tools requiring zero credentials; users can inspect them and set execution policy (Allow / Ask / Off). Put domain preferences (sources, criteria, repository) in the app’s canonical views and name them in README.md. Do not copy credentials or create an alternate permission store. Missing action requirements are visible before refresh; integration Ask can be satisfied by scoped app consent without changing its global default, while Off remains a ceiling. Ordinary app actions/edits stay with their app runtime; local table controls remain local; model-backed chat/task controls continue only through their actual mounted owner. Status belongs to the app runner or Canvas top status region, not an unrelated chat.

## Final review

Use only supported Projection components and props; no bespoke HTML/CSS, decorative spacers, fixed hero height or nested ornamental cards. Conditional nodes and their parent references share the same condition. Keep navigation stable, filter actions beside filters and shared actions in the header. Use real dated records for `xScale:"time"` charts, exact tables for inspection and bounded local paging. Spoken text uses those records with short sentences, dates, units and attribution. Reader skills can load the existing domain skill as a companion; keep exported names, frontmatter, schemas, handlers and all four package docs synchronized.

For compact reading collections, use public card `imageLayout: "thumbnail"` (72 px side image) and optional `titleLines: 1..4`. Preserve full titles in canonical data and a detail view; the renderer retains accessible text and a full-title tooltip. Missing images must not create blank placeholders.

A listening app may publish a **programme** at `voice.listen.path` (`{title, segments}`; `shared/programme.ts`) to get Listen and Watch: one part per record with `delivery`, optional `cue` (intro, sting, outro) and `break`, and the record's own `kicker`, `heading`, https `image`, `source`, `at` and `link`. Derive it in `view(state)` from canonical state, write plain sentences, and follow the enabled `broadcast-programme` skill. To share it, return it from a read-only exported tool; a consumer republishes it at its own listen path.

A listening app may declare `voice.listen.selector: {bind: "/channel", options: "/channelOptions", label: "Channel"}`. These paths resolve on `voice.listen.surface`; options are `{label,value}` records. The header places the compact selector before the radio, and sends selection as the usual autosaving bound-field action through the serialized owner. Keep the selected value and spoken script derived from the same canonical state. Do not duplicate a large selector in page content or store a separate header preference. Selection does not start playback.

For compact filter toolbars, use labelled single-choice `select` fields with `presentation: "dropdown"` in a wrapping horizontal stack. This keeps short option lists collapsed too. App listening switches the header radio to Stop during preparation/playback; the floating control appears only away from the owning app header.

## Assistant-assisted content

Use the host action assistant.compose with a text payload to prepare an editable request (1–8000 characters) in the host-owned in-app authoring studio; it never sends or grants model permission. A payload path such as authorRequest (without a leading slash) reads current data after field edits commit. The studio reuses the normal chat pipeline, selected provider, counted skills, MCP approvals and independent live Projection surfaces. Reuse enabled skills and governed MCP tools. Apps still cannot call providers directly. For draft proposals, export an explicitly readOnly false tool with a required integer expectedRevision; the registry checks it before dispatching handleAction. Context queries may return context.appRevision. Keep proposal and personal acceptance separate, with bounded input validation and truthful source/review status. Read-only exports continue through handleQuery and discard state. Keep all four package documents synchronized and verify refusal of stale or read-only mutation attempts.

Give exported tools a short optional title describing the actual operation, such as Save a course draft, so permission controls use ordinary language. Titles grant no permission and must agree with the handler.

The user's assistant opens as a host-drawn panel docked inside the app (ADR-062): beside the app's view on wide windows, a sheet below it at 720 px and narrower. The app stays visible and live; its view refreshes in place when an export saves, and Review switches the app's view without closing the panel. Apps never draw the conversation or approval controls. Each turn carries the app id for FinOps; an unknown id is dropped and grants nothing. During a turn from an app's panel, the model is offered the app's own exports, another app's exports only when this app's manifest lists them in `entitlements.mcpTools`, and servers the person installed (with their own approvals); the host's app-building tools are not offered. The scope ends with the turn. Optional payload `model` (`"local"` or a model id) is a hint, honoured only when the person has that model available; otherwise their selected model is used, and the panel's choice never changes the main chat's model. Optional payload workflowPath names canonical workflow data: `{title?, stages?:[...], brief?, boundary?, saved?, guide?:{start,responded,saved:{heading,hint}}, steps:[{id,label,message,mode:"send"|"edit",stage?}], review:{label,surface,tool,stage?}}`. All panel wording comes from this data; the host panel has none of its own. Stages are one to four labels; a step's or review's `stage` must name one. The host bounds one to four steps and validates the existing review surface and a declared readOnly false tool. Send steps explicitly request a normal assistant turn with the same session, provider/cost context and approvals; edit steps only prepare text. Opening and returning never send. Preserve unsent text. Review appears only after the named tool returns an exact saved/appId/positive-revision commit receipt, including its integration-labelled envelope; read-only output and assistant prose cannot establish a save. Closing preserves in-memory work and does not cancel a running turn. Restart resume remains open.

### Media attachment from an app editor

A button may use `media.attach` with `{into:"edit/mediaUrl",kindInto:"edit/mediaKind",titleInto:"edit/mediaTitle"}` (data keys, no leading slash). The host opens an explicit audio/video file picker, enforces the existing 20 MB import limit, imports into the existing Media owner, and autosaves the `media:UUID` into an existing string field. Optional kind/title fields must also exist; type is inferred from the verified imported MIME, and a nonempty title is preserved. No selection means no import; changing apps during import does not attach the asset to another editor. The package still validates and saves its draft separately. Shared assets are not deleted when a course is removed. Use public Projection media, never a second renderer/store or raw filesystem grant.

## Default host lifecycle (every app)

Background operation is supplied by the host beside Refresh and in Operation Center → Hosted Apps. Do not author duplicate controls, view timers, localStorage timing or a recovery daemon. Start & keep running persists across host launches; Refresh timing independently chooses declared cron, Manual only, or the host interval for the first cron handler. Declare startup handlers only for real initialization/initial refresh; they receive committed state in a fresh bounded invocation. Startups and feed subscriptions also require Keep running. Manual actions/queries remain available when stopped.

Document these controls and declared actions in all four package documents. State startup's sources/effects and idempotency explicitly. The host retries failed background computation with zero external calls at most three times (5/15/60 seconds), preserves committed data and exposes receipts. Never retry uncertain external effects; exact-run acknowledgement stops operation without replay. Missing/revoked access blocks rather than granting permissions. Updates stop background operation for renewed review. Vakyartha and the computer must remain running and awake; no permanent process is implied.

## Access requirements and upgrades

The host owns Access on every app card/header and the Settings Access/Background/Package & updates/App preferences tabs. Integration setup stays inside this app’s panel. Declare exact mcpTools and optional entitlements.toolActions (an action-to-declared-tools map); keep ordinary startup/refresh requirements separate from optional specialist actions. Every actual call rechecks access. Never implement grant stores/dialogs, permission-error regexes or a hidden global-Allow change. App foreground/background rules are package-bound and destination hosts are exact, not path/method grants. Local-only apps show their actual local storage and host-mediated Voice/export boundaries.

Updates show source plus added/removed tools, changed action requirements, storage, triggers and exports. Match base/candidate fingerprints and current revision; preserve saved domain data, stop Background and require matching access review. Do not blindly install package or skill changes. Ask currently blocks for in-panel review; no exact-operation Allow once or in-worker approval wait is implemented. The canonical docs/features/APP-ACCESS.md retains shared stdio and broader authority-audit limitations. Keep all four package docs and selected lifecycle skills synchronized.

For every mcpTools entry, declare toolPurposes: `{ "server__tool": { "reason": "Explain the feature and resource", "optional": false } }`. Mark specialist features optional and keep them outside core refresh preflight. The host shows needs separately from grants and binds grants to observed tool/source contracts. Declare entrypoints.render: "renderApp" and export async renderApp(context), returning normal updates from retained state and read-only database work, with no callTool/provider/voice operations. Publication uses only its validated projections and discards any state/database changes. Missing render support for retained data or a failed render keeps the entire old package.

Host Access uses compact Allow / Ask / None controls, preserves browsing on save, and provides confirmed all-tool shortcuts. Reuse it; do not build package-owned permission controls.

App tool policies stay visible inline. Review a shared destination once in the app’s deduplicated Destinations list; show the affected tools and apply through their existing revision-checked grant writer. Use per-tool Allow / Ask / None destination overrides without repeated hostname entry. Never require repeated entry of the same host. Destination changes preserve tool policies; policy shortcuts never silently approve new hosts.

Host Access has one atomic Save changes for staged tool and destination edits. Both tools and destinations expose Allow / Ask / None, including warned all-item shortcuts. Reuse the host; do not introduce per-tool Save buttons or another permission store.


## Responsive app interactions

Design a dependency map from each editable field and action to its data reads and affected views. Keep one canonical state/database owner. A draft with no derived consumers can return a focused data update while preserving the view's retained records and calculations. A changed filter or domain record must update every affected visual and spoken projection. Never fill an unrelated view with empty ledger/history samples to avoid a read. Package update rendering still rebuilds all views from retained canonical data.

Use the shared Apps runner for view navigation, draft debounce, status, Background operation and refresh. It retains the shell, merges changed view receipts and retrieves changed snapshots by version. Local search and paging use Projection's local controls. A click that only selects a view must not call an integration or run a refresh. Each app reuses its dedicated contained worker across successful commands. Keep running persists eligibility for hosted work and startup. Module memory survives healthy commands but durable data belongs in host checkpoints. Open SQL only when an operation needs it.

Check a populated saved app at wide and narrow WebKit widths. Preserve selected view, local filters, page, scroll, unsaved fields and assistant state. Measure cold open, tab click through paint, draft commit and actual source refresh separately. Count tool calls and SQL reads as well as elapsed time. Verify a partial update followed by navigation, a missed background revision, failed validation/correction, reopen and reviewed package update. Retain original failed evidence. Published source, installed package and desktop executable versions need separate verification.


Dedicated instance contract. Each app owns one contained instance per reviewed package generation, including worker, workspace, database session and serial queue. Shared capacity controls concurrent commands. Tabs attach to the same app instance. Rust owns process lifetime and private transport; the registry owns checkpoints. The worker is retained until stop, restart, failure, package replacement or host shutdown.


Headless instance contract. An app can run without any published view. Its dedicated instance still owns its worker, workspace, database session and queue and uses the same host access, startup, scheduling, tools/feeds, receipts and recovery. Views attach optionally. Operation Center provides host lifecycle controls and health. Current desktop background execution requires the host and computer to remain running. Hardware-isolated guests are a future containment option requiring separate implementation and platform evidence; package code must use the shared instance and broker contracts.

## Preparing native Work

The shared `work.prepare` host action accepts `{path: "backgroundBrief"}` naming surface data `{goal, criteria, inputs?}`. It only opens the existing trusted Work form after pending field edits save. It cannot start inference, submit a task, select tools/spending or grant authority. Preserve unsaved Work text through the host replacement review. Native Work owns execution, canonical results, budgets, consent and recovery; never create an app-side task pump or mirror journal. The initial native route supports supplied-input tasks and refuses integrations, specialized result policies and schedules. Interactive tool work uses the shared `assistant.compose` pipeline. Proposals stay unreviewed until personal acceptance; lessons never activate themselves.

### Required proposal saves

Workflow data may set optional `saveTool` on the initial request and individual steps, naming this app's own mutating export. The host labels an explicit Send and save, validates that declaration, and requires the exact successful committed app receipt before final completion. A tool result, read-only response, rendered surface or assistant prose cannot stand in for a save. Follow-up free text clears this command unless a declared step requests it. Stale revisions, denial and missing tools remain failures; the host never grants or retries a mutation automatically. The shared execution context passes the checked `appRevision` into every action; the export bridge consumes the caller's `expectedRevision` at the writer boundary.

App assistant evidence: the shared host optionally supplies context.assistantExecution for queries and actions in the matching docked assistant turn. It contains an assistant turn ID, offered tool names and up to 64 completed tool response receipts (identity, name, timestamp, returned/error, argument and response SHA-256). It contains no new capability or permission grant. Retain this host context separately from model arguments when evidence matters; never trust a receipt supplied in an exported tool argument. Offered names may still require approval. Response receipts prove host observation, not source truth or an external mutation; preserve personal review and independent outcome checks. Background handlers and manual actions outside that turn receive no assistant execution context.
