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

## Quick capture

`parseCapture(text, today)` reads a day (today, tomorrow, a weekday name, "on sat", "next week", "in 3 days", "12 nov", ISO dates; a passed date without a year means next year), a time ("at 5pm", "17:30", "at noon"), a length ("for 45 min", rounded to the offered blocks), a repeat ("daily", "every week", "every monday") and a priority ("!high", "!", "urgent", "p1", "!low", "p3", "someday"). Short weekday forms count only after on, by, due, next or this. A time or repeat without a day means today. Fixed local rules: no model call. The rest is the title; `capturePreview` shows what will be saved while typing, and the capture form submits on Enter.

## Ordering and actions

Open lists sort late first, then by day, time and priority; undated tasks last, high priority first. Completed lists newest first. Row actions: Complete or Reopen, Tomorrow (late, due today or undated tasks), Edit, Delete with confirmation. Details adds Complete or Reopen, Move to tomorrow and Delete; deleting the open task returns to the list. Clear completed asks first. Empty states show only for empty lists, and tab titles carry their counts.


The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
