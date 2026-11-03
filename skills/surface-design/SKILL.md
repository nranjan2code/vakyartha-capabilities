---
name: surface-design
description: Design visual and spoken canvas content: forms, tables, charts, cards, metrics, diagrams and mixed layouts. Combine with interactive-ui for data bindings and actions.

compatibility: Core required Vakyartha capability; active across desktop and web runtimes.
metadata:
  category: reports
  author: Vakyartha
  version: "1.0.0"
allowed-tools: vak_render vak_update vak_submit
---

# Visual and spoken surface design

Apply this shared contract whenever authoring a surface. Follow the user's requested format, current tool schema, caller constraints and target capabilities. For data mappings, bindings or submitted actions, use enabled interactive-ui. Domain skills own domain decisions, not a competing layout system.

## Compose from content

Choose the simplest useful reading order for the task and actual container. A single column, short card or form may be sufficient. Use sections for structure and cards for distinct content units; avoid nested decorative cards, empty nodes, spacer heights and forced metric/chart/table tiers. Ordinary actions keep clear labels and their natural width.

Use automatic grids for peers, explicit columns for meaningful grouping, and split layouts only when primary/detail content benefits. Retain primary content first when columns collapse. Use offered semantic maxWidth measures when needed; intentional full-width data panels and charts are valid. Follow the target's available components and degradation: linear channels do not need desktop grid geometry. Dense tables can scroll within their panel. Long lists/grids page locally; preserve the full canonical records while browsing.

Use semantic tones neutral, info, success, warning and danger when offered. Let the host supply fonts, theme, palette and control geometry. Do not invent CSS, colors, icon properties or executable expressions. Keep labels readable, controls identifiable and material status in text rather than only color or hover.

## Choose a chart for the question

- bar: compare categories or independently prepared bins; horizontal bars suit long labels.
- stacked: comparable additive parts in the same unit, not automatic normalization.
- line: correctly ordered observations over time; equal category spacing is not a continuous time axis.
- area: magnitude over ordered time; it does not compute cumulative values.
- pie: nonnegative parts of one meaningful positive whole; keep categories manageable.
- scatter: paired numeric x/y observations; it does not compute correlation or regression.
- heatmap: nonnegative intensity across dimensions, or supported dated calendar values; not signed divergence.
- radar: profiles on comparable scales; normalization is not automatic.
- candlestick: dated real open/high/low/close records, four series in that order; separate volume. Never infer candles from close-only observations.

Unsupported statistical/specialist plots need a supported alternative or an explicit limitation. Histogram bins must be calculated first; a bubble alias does not encode point size. Bars/areas include zero. Line/candlestick may fit observed ranges when that disclosed scale answers the question; use zero when it is the meaningful reference. Use orientation horizontal for long category labels, xScale time for dated labels at real intervals, colorBy sign only when sign carries meaning, and height to suit density. Name units, periods and basis in title, xLabel and yLabel. Keep exact detail values when they matter. Inspection controls supplement, not replace, the visible interpretation.

## Choose a component for the content

Pick the component whose shape matches the content before reaching for cards or charts:

- stat: one headline value with label, unit and optional delta; progress: value toward a max (budget, goal, score).
- table: exact records to scan or compare; list: short unordered points; tree: hierarchy or outline.
- timeline: dated events and histories; steps: ordered process state (done/current/todo/failed); gantt: planned work with start/end; calendar: events on days.
- board: items moving between stages, bound so moves stay in data; compare: two to five options with pros, cons, specs and a named best pick.
- diagram: workflows, architectures, sequences, state machines, decision trees and relationships; load the `diagrams` skill. Never force a topology into a chart.
- tabs or accordion: long alternative or optional content; alert: a material warning or status, in text.
- code, math, diff, map, gallery, media, timer: their literal content; copy supplied code and captions verbatim.

## Meaning and continuity

Keep the main finding, relevant timeframe, units and material caveat in short visible prose that remains meaningful when spoken. Speech projects the canonical surface; never author a separate narration store or tts payload. Do not duplicate every row in chat prose.

Before delivery, compare chart categories/series, table values and nearby interpretation. Name any displayed subset and where remaining records appear. Missing facts are not zero. Preserve independent surfaces and unsent edits; a layout change must not change facts or imply an external effect. A valid render is not proof of source or calculation correctness.
