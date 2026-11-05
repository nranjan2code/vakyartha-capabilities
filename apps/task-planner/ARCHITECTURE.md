# Task Planner architecture

## Ownership

The app's `context.state.tasks` array is the single canonical data owner. `server.ts` validates and normalizes each incoming state, handles explicit capture, edit, completion and delete actions, and derives the `main` and `details` surfaces. The app host checkpoints successful state changes and owns the worker lifecycle.

## Data flow

```text
typed or dictated capture / submitted detail form / task action
  -> normalized local task state
  -> derived Today, calendar events, task lists, counts, charts and speech
  -> host checkpoint and surface update
```

The calendar receives date-only task events with optional local `HH:MM` start/end times and owns month/week/day/agenda navigation locally. It does not call the backend for navigation, and it does not write an external calendar. Charts and spoken summaries use the same task records. Dictation, read-back and header Listen are host Voice actions; transcription enters as ordinary field text, and the app retains no audio. The app has no model, MCP tool, SQL, notification or timer path.

## Recurrence

Each completed recurring task remains as a completed record. Completion creates one next open task with the same `seriesId` and the next date. Daily and weekly cadence use date arithmetic; monthly cadence retains its original day-of-month (so January 31 advances to February's last day, then March 31). Rendering is pure and never advances a series. Reopening a completed task does not remove or create occurrences.

## Files

- `app.json`: package identity, local-only access and optional skill declaration.
- `server.ts`: canonical state validation, action handling and derived views.
- `surface.json`: empty-state snapshot generated from `surfaceFile()`.
- `skills/task-planner-guide/SKILL.md`: optional assistant procedure, not execution authority.
