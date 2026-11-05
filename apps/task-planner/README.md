# Task Planner

Task Planner is Vakyartha's local personal task manager. Capture a task quickly, then add a due date, priority, notes or a repeat-after-completion rule when useful. Browse Today, Open tasks, Completed and a calendar with month, week, day and agenda views.

## Calendar and recurring tasks

Due dates are date-only values, so they do not shift across time zones. Optionally add a local start time and a 15-minute to two-hour time block; week and day calendars show it as a timed entry. The calendar is a view of saved tasks, not an external calendar connection. Marking a recurring task complete creates its next dated occurrence and keeps the completed occurrence in history. Daily and weekly repeats advance by one day or seven days; monthly repeats use the same day where possible and otherwise the month's last day. A recurring task without a due date does not create another occurrence.

Today highlights overdue tasks and tasks due today. Calendar events can be browsed in the native month, week, day and agenda views; task actions remain in the adjacent saved task lists. Insights shows an open/completed count and completions by day for the last 14 days. All counts and charts are derived from the same local task records.

## Data and boundaries

The app stores task records in its local app state. Its task operations make no model requests and use no integrations, direct network access, SQL database, external calendar writes, background trigger, push notification or execution queue. Due and overdue state is computed when the app renders. The host owns the app sandbox and its lifecycle. The included `task-planner-guide` is optional assistant guidance; the app remains fully functional when the skill is disabled or no assistant is used.

## Voice

Use **Dictate** for quick capture, or the task-title and notes dictation actions in task details. The host transcribes into the focused field and the app saves the resulting text through its normal local state path. **Listen** in the app header reads the current agenda summary; **Read task aloud** reads the selected task or unsaved draft. Both use the person's existing Settings → Voice provider and are explicit actions. The app never records or retains raw audio; it stores only the accepted text. With Voice disabled, typing and the rest of the app continue to work.

The catalog release version is assigned through the owner-run version command. The app is not installable from a signed catalog until the owner types its initial version, the package checks pass, and the release is signed and published.
