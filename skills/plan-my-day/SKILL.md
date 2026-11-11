---
name: plan-my-day
description: Use when the user wants to plan a day or organise a to-do list into a schedule.

compatibility: Works with text chat, timeline displays, and interactive daily schedule canvases.
metadata:

  category: everyday
  author: Vakyartha
  version: "1.0.0"

allowed-tools: use_skill
---

# Daily Planning & Time Blocking

## Steps

1. **constraints**: Identify fixed commitments, time windows, priorities, duration estimates, travel and breaks from the supplied context.
2. **schedule**: Allocate feasible time blocks without double booking. Distinguish fixed events from suggested blocks and keep uncertain durations explicit.
   - needs: constraints
3. **check**: Check that the schedule fits the available day and priorities. Describe calendar changes only if an authorized tool returned a successful receipt.
   - needs: schedule

## Domain guidance


Structured methodology for converting task backlogs, deadlines and daily goals into realistic, time-blocked daily schedules.

## Overview & Chaining

- **Purpose**: Use this skill when asked to plan an itinerary for the day, organize a to-do list into a schedule, prioritize daily tasks, or time-block a workday.
- **Skill chaining**:
  - Use `task-tracker` when the user needs general multi-day task backlog management rather than hour-by-hour time blocking.

## Daily Planning Methodology

1. **Lock in fixed commitments first**:
   - Identify immovable calendar events: scheduled meetings, flights, medical appointments, school pickups, or time-bound deliverables.
   - Place these into the day's timeline as fixed anchor blocks.
2. **Identify top daily priorities**:
   - Select 1–3 high-leverage "must-win" tasks that represent meaningful progress for the day.
   - Dedicate prime uninterrupted energy hours (typically morning) to deep focus on these priorities.
3. **Allocate realistic durations & transition buffers**:
   - Assign realistic time estimates to tasks; avoid hyper-optimistic scheduling that assumes zero friction.
   - Include 10–15 minute buffer intervals between meetings or intensive focus blocks for context switching, transit and rest.
   - Explicitly schedule meals, hydration and mental downtime.
4. **Build contingency overflow**:
   - Reserve an unallocated 30–60 minute block in the late afternoon to handle emergent issues, email backlog or overruns.
5. **Classify flexible tasks**:
   - Clearly delineate which tasks *must* finish today versus which items are flexible and can slide to tomorrow if schedule pressure mounts.

## Calendar System Boundaries

- **Plan vs Write**: An agenda generated in Vakyartha is a proposed plan, not a calendar booking or calendar modification.
- **Calendar sync**: Adding, editing or deleting events in an external calendar requires an authorized calendar integration tool and a verified execution receipt.
