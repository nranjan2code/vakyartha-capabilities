---
name: system-doctor
description: Check this Vakyartha install as a whole when the person asks for a health check, checkup or doctor, or something is wrong without a clear single cause; also a channel such as Telegram that keeps stopping, the sandbox helper, disk space and engine errors. Reads the live System health report and gives one exact fix per problem. Ollama and local model problems go to doctor-models; integrations and apps that cannot refresh go to doctor-integrations.

compatibility: Requires the built-in System health integration (on at first run). The same checks are in Admin console → Doctor and `npm run doctor`.
metadata:
  category: health
  author: Vakyartha
  version: "1.0.0"
  requires-read: "true"
  requires-values: "true"
  unavailable-message: "System health is unavailable. Open Settings → Integrations, turn on System health, then ask again. The same checkup is in Admin console → Doctor."
allowed-tools: read_skill_file use_skill vak_render vak_update vak_submit system-health__health_report system-health__recent_problems
---

# Diagnose this install

The System health report is the only evidence. Never guess the state of a model, key, integration or app from memory, from the conversation or from what usually goes wrong.

## Procedure

1. Call `system-health__health_report`. Ask for `areas` only when the person named one part ("Ollama is not working" → `["ollama", "models"]`); otherwise read all areas.
2. If the person mentions an error, a failure or "it stopped", also call `system-health__recent_problems` (default 20 lines).
3. Triage in this order: `fail`, then `warn`. `info` and `ok` are context, not problems; mention them only when they answer the question.
4. For each problem give, in this order and in plain sentences:
   - what does not work for the person (the effect, from the check's title and detail),
   - why (the detail, quoted values exactly: model names, counts, gigabytes, integration names),
   - the fix: the check's `fix` text, then its `command` if present, written as a code block for Terminal.
   When a check carries an `action`, say the engine can apply it from Admin console → Doctor with the button named by `action.label`; you cannot press it.
5. End with what to check after the fix: "run the checkup again" or the narrow `areas` call that confirms it.

When everything is ok, say so in one sentence with the count of passing checks and the check time. Do not invent advice.

## Chain to the specific procedure

- Models, Ollama, the decision model or a slow or failing local model: load `doctor-models`.
- An integration in error or needing setup, or an app that cannot refresh its data: load `doctor-integrations`.
- An app whose own runs fail, or a run marked uncertain: load `app-debugger`.
- Engine log lines with stack traces or repeated errors: load `debug-error` with the exact lines from `recent_problems`.
- Running a fix command for the person: only with the enabled `sandbox` procedure and its approvals; downloads and installs always ask first.

## Presenting a checkup on the canvas

When the person asks to see the checkup, or there are more than three problems, render one surface from the report with `interactive-ui` and `surface-design`: a verdict line (worst status decides: any fail is "Needs attention", any warn is "Working, with warnings", else "Healthy"), stat tiles for problems, warnings and passing, then a table of fail and warn checks with Area, Check, Detail and Fix columns. Use the report's own records; never add rows it does not contain.

## Boundaries

- Keys: the report says only whether a key is set. Never ask the person to paste a key into chat; send them to Settings.
- Never tell the person a problem is fixed until a new report shows it.
- Never blame the size of the local model; a failing local model is a setup, memory or timeout problem to diagnose.
- Do not change settings, policies or integrations yourself. Tool policies (Allow, Ask, Off) are the person's decision.
