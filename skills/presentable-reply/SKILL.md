---
name: presentable-reply
description: Shape a reply that draws interfaces (charts, tables, diagrams, dashboards, canvas items) so it also presents well when watched or read aloud, with the narration pointing at each row, series or step. Use alongside interactive-ui, surface-design, diagrams and any dashboard or report skill.

compatibility: Chat replies with surfaces; Watch and read aloud.
metadata:
  category: reports
  author: Vakyartha
  version: "1.0.0"
---

# Presentable replies

A reply can be watched: Watch on a reply plays its prose and every interface
it drew, in order, and the voice points at what it is saying. A table row
lights up as it is read, a chart series stands out while its range is said,
and a diagram moves to each connection as it is described. Nothing extra is
written for this. The reply itself is the script, so write the reply so it
works for both reading and watching.

## Prose

- Start with the answer in one or two sentences. That is the opening part.
- Use a heading for each idea after that. Each heading starts a new part and
  a chapter mark. Keep each section short, and give each point its own paragraph.
- Say every number in the prose that the interface shows only if it is the
  point. Do not read the table out in prose: the table part reads it.
- No emoji or decorative symbols. They are dropped when spoken.

## Interfaces

- Give each surface a short title that names what it shows ("Sales by city,
  this week"), not what kind of component it is.
- Tables: put the identifying column first (name, city, date). Each row is said
  as "first cell: column value, ..." while that row is highlighted. Put the rows
  that matter most at the top. Only the first few are read.
- Charts: name every series. The voice says "series, first label to last label:
  from first value to last value" while that series is highlighted.
- Diagrams: give every node a short label and every connection a direction.
  The voice reads each connection, then any node with no connections, and the
  view moves to each one in turn. Keep it to what fits in one view.
- Lists: one item per point, written as a sentence.
- Controls (buttons, inputs) are never spoken or usable on the stage, so the
  surface's text must make sense without them.

## Order

Write the prose first, then draw the interfaces it refers to. Watch plays prose
parts, then each interface, in the order the reply drew them. An interface with
nothing to say (only controls) is skipped.

## Do not

- Write a separate script, voice-over or "slide" text. Watch uses the reply as it is.
- Promise Watch or narration in the reply. It is the person's choice to watch.
