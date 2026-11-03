---
name: doctor-integrations
description: Find out why an app such as News Desk, Market Terminal or RBI Desk cannot refresh or load its data (its integration off, not ready, or its own access rules need review), and fix integrations in error, waiting for setup or not installed, and channels that stopped. Uses the live System health report; for reading the news or rates themselves use the app reader skills.

compatibility: Requires the built-in System health integration.
metadata:
  author: nranjan2code
  version: "1.3"
  requires-read: "true"
  requires-values: "true"
  unavailable-message: "System health is unavailable. Open Settings → Integrations, turn on System health, then ask again."
allowed-tools: read_skill_file use_skill system-health__health_report system-health__recent_problems
---

# Fix integrations and app data access

Call `system-health__health_report` with `areas: ["integrations", "apps", "channels"]`.

## Integrations

- `fail` (error): the integration did not start; quote its error. Admin console → Doctor can restart it (Restart integration). If it fails again, its setup is wrong: Settings → Integrations → that integration.
- `warn` waiting for setup: name the missing settings exactly as the check lists them. Keys are entered only in Settings; never ask for a key in chat.
- `warn` not installed: install it from its page in Settings → Integrations. Versions are pinned by the catalog; never suggest installing a server another way.

## Apps that cannot refresh

App tool calls require the app’s own package/tool/mode/destination grant. Open that app’s header Access shield; integration setup stays inside the same panel. Ask means review is required; do not turn a shared integration to Allow merely to make one app work. Integration Off and unavailable setup still block the app. Foreground Allow does not authorize background work or another app. New destinations and changed packages require review. Native/shared transport limits remain explicit in APP-ACCESS.md.

Apps paused ("App runs are paused") resume from Admin console → Doctor (Resume runs) or the Admin console's Resume Runs button. An app whose own runs fail, or a run left uncertain, goes to `app-debugger`.

## Channels

A channel in error can be restarted from Admin console → Doctor (Restart channel). If it stops again, check its token and model in Settings → Channels. A channel waiting for a token needs it added in Settings.

After any fix, run the checkup for the same areas again and report only what the new report shows.

## Shared access and update review

Use the host Access shield on the app card/header and its Settings tabs. Review this app’s exact tools, approved destination hosts and separate foreground/background modes. Integration setup and the integration’s consumer rules open inside the same panel; shared changes disclose effects on other callers. Do not implement permission UI/storage, parse permission errors, widen global defaults or infer consent from source preferences. Declare toolActions as subsets of mcpTools for granular action preflight; declarations grant nothing. Ask pauses for in-panel review; exact-operation Allow once and waiting for approvals inside an app worker are unsupported.

Review the complete update fingerprint and added/removed tools, action requirements, storage, triggers and exports. Preserve domain data and edited/disabled/removed skills. Changed packages stop Background and need matching access review; never silently publish updates or reuse a stale review. App queries cannot call mutating/unclassified downstream tools. Follow the canonical docs/features/APP-ACCESS.md and its explicit shared-transport/native-audit limits. Verify useful allowed journeys and denied cross-app/mode/destination/package cases independently.

Make needs visible: declare toolPurposes with a plain-language reason and optional flag for every tool, plus action subsets in toolActions. Missing setup/access/destinations must be distinguishable from source errors. Changed host-observed schema/source/configuration requires fresh app consent. Declare entrypoints.render and export renderApp(context) to rebuild views from retained data during reviewed upgrades; it must make no tool/model request, and its state/database mutations are discarded. A failed rebuild leaves the old package intact.

Preserve compact inline Allow / Ask / None controls. All app tool and destination edits, including all-tool/all-destination shortcuts, stage one draft across pages and filters. One Save changes action reviews and atomically commits the changed app rules with one expected revision; invalid rules or conflicts apply nothing. Discard is explicit, unsaved edits survive tabs, and closing asks before discarding. Preserve page, page size, filter, expansion and scroll.

Review each exact host once in the deduplicated app Destinations list, with Allow / Ask / None per host and a warned shortcut for all currently listed destinations. Allow adds continuing host access, Ask requires review before access, and None explicitly denies it. Tool modes remain separate. Per-tool overrides reuse these choices without repeated hostname entry. New or future hosts are never implicitly granted. Ask does not suspend or automatically replay an app run.

Permission selections must show the saved policy on opening. Use theme-aware Allow (green), Ask (amber) and None (red), a visible border/checkmark and readable text contrast in light/dark modes; mixed choices select no option. Mark unsaved edits distinctly. Verify native WebKit geometry and selection state in both themes.
