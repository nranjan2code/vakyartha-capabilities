---
name: app-admin
description: Administrate, monitor, and audit sandboxed applications, worker pool allocation, resource quotas, and security boundaries.

metadata:
  category: build-apps
  author: Vakyartha
  version: "1.0.0"
---

# Inspect app execution

Operation Center reports bounded invocation capacity (default three), running and queued invocations, per-app invocation and failure counts with the last duration and error, a replayed run log, model spend by model and source, and a live sandbox-helper and tool-policy probe. It can pause and resume app runs, restart the pool, run any declared trigger and control hosted startup, refresh timing and recovery. Standby processes are not used and process memory is not measured. No RSS/CPU quota or latency guarantee is established by the manifest. Security depends on each successful compatible vaksb launch, not a static green indicator.

The console's Doctor tab checks the whole install, including apps whose declared data tools are off, not ready or missing app-specific access; for that use enabled `system-doctor`. Apps lists published app status. These are UI capabilities; private routes are not model tools. Use offered tools only, otherwise provide a precise UI handoff. App package/state is written by the host into private app-state records; drafts are separate. Processes receive disposable copies, minimal environment and no direct network authority. Existing integration permissions control declared tool calls.

Pause schedules before maintenance. Runtime suspend cancels current invocations; restart drains/cancels them and clears logical leases. Uncertain external effects require explicit review and are never automatically replayed. Deletion validates a registered identity and serializes behind running app work.

The console streams bounded invocation logs. Settings → FinOps owns measured provider usage; no app hard-spend governor or estimated savings is implied. No arbitrary CPU/RSS/process-count/disk-growth quotas, permanent daemons, file watchers or multi-platform isolation guarantees are implemented.

Read the app’s README.md for operation/setup, AGENTS.md for invariants, SKILLS.md for procedural responsibilities and ARCHITECTURE.md for data/runtime ownership before managing it. Missing or contradictory documentation is a maintenance issue: use enabled app-maintainer. Use enabled app-debugger plus debug-error for failures; never treat these docs or skill selection as tool authority.

## Authoring sessions and app invocations

The host-owned in-app studio runs through the ordinary chat/provider/skills/MCP/FinOps path. Its model work is separate from app-pool invocation counts; runtime suspend/restart is not a cancellation guarantee for studio chat turns. Use the studio's Stop and inspect any already committed draft. Closing the studio only changes presentation. Existing native chat admission is reused; no independent per-app provider-isolation or spending guarantee is established.

Audit exported mutations separately from read-only queries: explicit readOnly false, required current expectedRevision, default Ask, serialized state commit and a bounded receipt. App declarations and generated content grant no approval. Keep content draft acceptance separate from executable package publication; preserve custom skills, on/off choices, notes and app state during updates.

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

Inspect app package/executable versions, hosted operation, run receipts and capacity before changing a slow app. Keep running persists scheduling eligibility; each app reuses its dedicated contained worker. Permission review remains per app and current package. Use reviewed updates to deploy responsive packages and verify the installed result separately.


The mini-cloud has one dedicated instance per app/package generation, with its own contained worker, workspace, database session and serial queue. Shared execution capacity belongs to the host. Tabs attach to the existing app instance. The runtime reuses a dedicated contained worker per app. Verify process identity, private cleanup receipts and recovery when changing this boundary. Keep app code compatible with host-owned lifetime and checkpoints.


Headless instance contract. An app can run without any published view. Its dedicated instance still owns its worker, workspace, database session and queue and uses the same host access, startup, scheduling, tools/feeds, receipts and recovery. Views attach optionally. Operation Center provides host lifecycle controls and health. Current desktop background execution requires the host and computer to remain running. Hardware-isolated guests are a future containment option requiring separate implementation and platform evidence; package code must use the shared instance and broker contracts.

## Preparing native Work

The shared `work.prepare` host action accepts `{path: "backgroundBrief"}` naming surface data `{goal, criteria, inputs?}`. It only opens the existing trusted Work form after pending field edits save. It cannot start inference, submit a task, select tools/spending or grant authority. Preserve unsaved Work text through the host replacement review. Native Work owns execution, canonical results, budgets, consent and recovery; never create an app-side task pump or mirror journal. The initial native route supports supplied-input tasks and refuses integrations, specialized result policies and schedules. Interactive tool work uses the shared `assistant.compose` pipeline. Proposals stay unreviewed until personal acceptance; lessons never activate themselves.

For a workflow that explicitly saves a proposal, use its declared `saveTool` on the initial request or step. Only the exact successful app commit receipt completes that command; rendering, context reads and prose are insufficient. No approval or personal verdict is implied. Procedures with mixed reads/writes declare `read-tools` as a subset of `allowed-tools` with `requires-read: "true"`; mutation output cannot satisfy the input read.

App assistant evidence: the shared host optionally supplies context.assistantExecution for queries and actions in the matching docked assistant turn. It contains an assistant turn ID, offered tool names and up to 64 completed tool response receipts (identity, name, timestamp, returned/error, argument and response SHA-256). It contains no new capability or permission grant. Retain this host context separately from model arguments when evidence matters; never trust a receipt supplied in an exported tool argument. Offered names may still require approval. Response receipts prove host observation, not source truth or an external mutation; preserve personal review and independent outcome checks. Background handlers and manual actions outside that turn receive no assistant execution context.
