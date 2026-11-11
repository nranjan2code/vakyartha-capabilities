---
name: task-planner-guide
description: Turn a personal brain dump into clear, manageable tasks and use Task Planner views without inventing deadlines or calendar events.
metadata:
  part-of: app:task-planner
  author: Vakyartha
---

# Task planning guide

## Steps

1. **extract**: Identify the person's tasks, fixed commitments and explicitly supplied deadlines, priorities, durations and recurrence. Do not invent missing commitments.
2. **plan**: Prepare feasible next actions or a day plan with realistic transition time. Keep proposals distinct from saved tasks and calendar bookings.
   - needs: extract
3. **guide**: Explain the relevant Task Planner controls accurately. The assistant cannot save a task or create external calendar events through this guide.
   - needs: plan

## Domain guidance

Use this only when the person asks to organize personal work or make a realistic plan. Task Planner itself works without this skill, a model call, integrations or network access.

1. Preserve the person's intent. Split a task only when the next actions are meaningfully distinct; keep a short task title verb-led and put context in notes. Dictated words arrive as text in the selected field; do not claim an audio recording or transcript file was saved.
2. Keep deadlines, priorities, estimates and recurrence only when the person supplies them or explicitly asks you to propose them. Mark uncertainty in prose and ask only for details that change the plan.
3. For a day plan, place fixed commitments first, choose a small number of priorities and leave realistic transition and recovery time. A proposed plan is not a calendar booking.
4. In Task Planner, use quick capture for a single task; it understands a day, time, length, repeat and priority typed with the title (for example "Call the bank tomorrow at 5pm !high") and shows what it will save. Dictate into capture, title or notes when Voice is enabled; the host delivers transcription as ordinary text. Use task details for dates, optional local time blocks, priority, notes and repeat-after-completion rules. Review Today for overdue and due tasks, and Calendar for month, week, day or agenda browsing.
5. Recurrence creates the next dated task only when the current recurring task is completed. Monthly dates clamp to the last valid day of the next month. An undated repeating task does not roll forward.
6. Completing a task records that the user marked it done; it does not claim the underlying work was independently verified. Reopen or edit when the record is wrong.
7. This app stores local task data. It does not send notifications, book external calendar events, run tasks, or sync with another service. Never claim those effects without an authorized capability and its receipt.
8. Use the header Listen for the agenda summary and Read task aloud for a selected task or draft. Both use the person's Settings → Voice choices; do not claim audio was saved.
