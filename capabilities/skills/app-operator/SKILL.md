---
name: app-operator
description: Help operate an existing published executable local app using its Apps controls, receipts and explicitly enabled triggers; no private-route or background-tool authority is implied.

metadata:
  author: Vakyartha Team
  version: "1.9"
---

# Operate local apps

Apps run direct code without an LLM per interaction. Open Apps to use published surfaces. A manual trigger calls its declared exported function, awaits computation and commits canonical state/projections only on success. Closing a view does not delete persistent data.

Use the published app's controls and its Apps details for revision, surfaces and run receipts. Private app HTTP/IPC routes are not model tools. If no offered tool performs an operation, hand off to the matching Apps control; do not invent a route-calling capability. Stale revisions fail. Retain local edits when background updates conflict. Multiple app surfaces share the same canonical app state.

Open an app by clicking its card. Its run status (saving, saved, problems) is the small chip at the top right of the app header; hover or focus it for details. Dictate and Read aloud buttons in an app use the person's Settings → Voice choices and need voice turned on.

Manual refresh uses the declared trigger control in Apps. Scheduling is explicitly enabled/paused in Apps. The app and computer must be running/awake; missed intervals are skipped, never burst-replayed. A failure is evidence to inspect, not a reason to add hidden model refresh calls.

Real-data tools must be declared by the package and permitted through existing integrations. Credentials never go into app source or state. Ask/off tools do not run unattended. Inspect uncertain effects before acknowledging a run by its exact identity; acknowledgement never replays it.

Read the app’s README.md for operation/setup, AGENTS.md for invariants, SKILLS.md for procedural responsibilities and ARCHITECTURE.md for data/runtime ownership before managing it. Missing or contradictory documentation is a maintenance issue: use enabled app-maintainer. Use enabled app-debugger plus debug-error for failures; never treat these docs or skill selection as tool authority.

## Content authoring inside an app

An app's assistant.compose control opens a host-owned studio; opening never sends. The person edits and explicitly sends using the selected model, existing enabled skills/MCP tools and normal approvals. Closing the studio leaves the run active; Stop aborts its stream but cannot undo a completed proposal. Authoring sessions persist in the ordinary chat store; automatic app-linked restart resume is not implemented. These model turns are distinct from deterministic app invocations.

Declared mutating app tools default to Ask and require the current expectedRevision; read-only queries still discard state changes. A proposal receipt means a draft was committed, not that its teaching or source claims were verified. In Learning Desk, inspect/edit in Curate and separately add the course to the library. Content drafts, executable package drafts and installed app updates are different lifecycles.

In-app content authoring uses the user's assistant docked beside the app (ADR-062), with explicit next-step request buttons and app-supplied wording. Follow BUILDING-APPS.md and the package template for workflowPath: bounded canonical step data, an existing review surface and declared mutating receipt tool. Keep the same conversation, preserve unsent edits, and retain model/cost context and normal approvals. A read result or assistant prose is not a saved-draft receipt. Do not ask the learner to type a hidden continuation command when the app provides a next-step control.

## Shared hosted lifecycle

Every published executable app receives the host's Background operation control beside Refresh and the identical control in Operation Center → Hosted Apps. Apps cards show status and a start/stop shortcut. Do not build package controls, localStorage/view timers, permanent loops or another persistence owner for these capabilities. Keeping an app hosted is separate from pressing Refresh or choosing its timer.

Start & keep running is explicit and persists across navigation and Vakyartha launches. Optional `{id, kind: "startup", action, maxDurationSec}` triggers invoke exported async handlers on start/restart/launch. App schedule uses cron; a bounded host interval invokes the first cron refresh action; Manual only suppresses periodic refresh while retaining startup and feed subscriptions. A package with no startup/timer/feed triggers remains available without inventing work. Stopped apps retain manual actions, queries and saved views; stopped consumers receive no app feeds.

The host reports state, next/last run and recent receipts. Missing/revoked access blocks governed calls; app-specific background Allow is necessary and skills grant no authority. Failed background computation with zero external calls has at most three host retries (5/15/60 seconds). Interrupted/failed external effects remain uncertain and require exact-run inspection/acknowledgement; acknowledgement stops operation and never replays work. Publication/updates preserve data and stop background operation for renewed review. Execution requires an awake, running Vakyartha. Playback observes saved results and does not own a refresh loop.

## Shared access and update review

Use the host Access shield on the app card/header and its Settings tabs. Review this app’s exact tools, approved destination hosts and separate foreground/background modes. Integration setup and the integration’s consumer rules open inside the same panel; shared changes disclose effects on other callers. Do not implement permission UI/storage, parse permission errors, widen global defaults or infer consent from source preferences. Declare toolActions as subsets of mcpTools for granular action preflight; declarations grant nothing. Ask pauses for in-panel review; exact-operation Allow once and waiting for approvals inside an app worker are unsupported.

Review the complete update fingerprint and added/removed tools, action requirements, storage, triggers and exports. Preserve domain data and edited/disabled/removed skills. Changed packages stop Background and need matching access review; never silently publish updates or reuse a stale review. App queries cannot call mutating/unclassified downstream tools. Follow the canonical docs/features/APP-ACCESS.md and its explicit shared-transport/native-audit limits. Verify useful allowed journeys and denied cross-app/mode/destination/package cases independently.

Make needs visible: declare toolPurposes with a plain-language reason and optional flag for every tool, plus action subsets in toolActions. Missing setup/access/destinations must be distinguishable from source errors. Changed host-observed schema/source/configuration requires fresh app consent. Declare entrypoints.render and export renderApp(context) to rebuild views from retained data during reviewed upgrades; it must make no tool/model request, and its state/database mutations are discarded. A failed rebuild leaves the old package intact.

Preserve compact inline Allow / Ask / None controls. All app tool and destination edits, including all-tool/all-destination shortcuts, stage one draft across pages and filters. One Save changes action reviews and atomically commits the changed app rules with one expected revision; invalid rules or conflicts apply nothing. Discard is explicit, unsaved edits survive tabs, and closing asks before discarding. Preserve page, page size, filter, expansion and scroll.

Review each exact host once in the deduplicated app Destinations list, with Allow / Ask / None per host and a warned shortcut for all currently listed destinations. Allow adds continuing host access, Ask requires review before access, and None explicitly denies it. Tool modes remain separate. Per-tool overrides reuse these choices without repeated hostname entry. New or future hosts are never implicitly granted. Ask does not suspend or automatically replay an app run.

Permission selections must show the saved policy on opening. Use theme-aware Allow (green), Ask (amber) and None (red), a visible border/checkmark and readable text contrast in light/dark modes; mixed choices select no option. Mark unsaved edits distinctly. Verify native WebKit geometry and selection state in both themes.


## Interaction performance

A view switch and local paging use saved data. Manual Refresh runs the app's declared source work. Keep running controls hosted scheduling and startup. For a slow control, record the app, view, action and visible run receipt. Preserve drafts and saved data while diagnosing. Package updates require the existing reviewed update flow.


The mini-cloud has one dedicated instance per app/package generation, with its own contained worker, workspace, database session and serial queue. Shared execution capacity belongs to the host. Tabs attach to the existing app instance. The runtime reuses a dedicated contained worker per app. Verify process identity, private cleanup receipts and recovery when changing this boundary. Keep app code compatible with host-owned lifetime and checkpoints.


Headless instance contract. An app can run without any published view. Its dedicated instance still owns its worker, workspace, database session and queue and uses the same host access, startup, scheduling, tools/feeds, receipts and recovery. Views attach optionally. Operation Center provides host lifecycle controls and health. Current desktop background execution requires the host and computer to remain running. Hardware-isolated guests are a future containment option requiring separate implementation and platform evidence; package code must use the shared instance and broker contracts.

## Preparing native Work

The shared `work.prepare` host action accepts `{path: "backgroundBrief"}` naming surface data `{goal, criteria, inputs?}`. It only opens the existing trusted Work form after pending field edits save. It cannot start inference, submit a task, select tools/spending or grant authority. Preserve unsaved Work text through the host replacement review. Native Work owns execution, canonical results, budgets, consent and recovery; never create an app-side task pump or mirror journal. The initial native route supports supplied-input tasks and refuses integrations, specialized result policies and schedules. Interactive tool work uses the shared `assistant.compose` pipeline. Proposals stay unreviewed until personal acceptance; lessons never activate themselves.

For a workflow that explicitly saves a proposal, use its declared `saveTool` on the initial request or step. Only the exact successful app commit receipt completes that command; rendering, context reads and prose are insufficient. No approval or personal verdict is implied. Procedures with mixed reads/writes declare `read-tools` as a subset of `allowed-tools` with `requires-read: "true"`; mutation output cannot satisfy the input read.

App assistant evidence: the shared host optionally supplies context.assistantExecution for queries and actions in the matching docked assistant turn. It contains an assistant turn ID, offered tool names and up to 64 completed tool response receipts (identity, name, timestamp, returned/error, argument and response SHA-256). It contains no new capability or permission grant. Retain this host context separately from model arguments when evidence matters; never trust a receipt supplied in an exported tool argument. Offered names may still require approval. Response receipts prove host observation, not source truth or an external mutation; preserve personal review and independent outcome checks. Background handlers and manual actions outside that turn receive no assistant execution context.
