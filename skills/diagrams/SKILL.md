---
name: diagrams
description: Design diagrams of any domain on the canvas: flowcharts, system architectures, sequences, entity relationships, state machines, decision trees, data pipelines and concept maps, readable on screen and when spoken.

compatibility: Projection diagram component; desktop canvas, channels and spoken projection.
metadata:
  requires: "skill:interactive-ui skill:surface-design"
  loads-with: "interactive-ui"
  requires-canvas: "true"
  category: reports
  author: Vakyartha
  version: "1.1.0"
allowed-tools: read_skill_file use_skill vak_render vak_update vak_submit
---

# Diagrams

Use for a diagram, flowchart, architecture, sequence, schema, state machine, pipeline, decision tree, org chart or concept map, or when a multi-stage process is clearer as a picture. Required surface-design owns the surrounding layout; load interactive-ui when the diagram sits beside forms or filters. `references/diagram-templates.json` holds one example per kind (flowchart, architecture, pipeline, feedback loop, state machine, entity relationship, sequence, mind map, swimlane); read it with read_skill_file when a starting shape helps.

## Pick the archetype

- Flowchart or procedure: steps, decisions, start/end terminals, retry loops.
- Architecture: services and stores grouped by tier or boundary in subgraphs.
- Sequence or protocol: participants as nodes, numbered action labels on edges ("1. sends token").
- Entity relationship: entities as nodes, columns in fields, cardinality on edge labels ("1:N owns").
- State machine: states as nodes, event and guard on each transition label.
- Pipeline: sources through ingestion, transform, storage and serving.
- Swimlane: subgraphs per owner (team, system, person).
- Decision tree: a root question, diamond conditions, pill outcomes.
- Concept map, org chart or feedback loop: a root with branches, or a loop whose measurement feeds back to the goal.

A diagram shows structure. Quantities over time or across categories belong in a chart, dated events in a timeline, process progress in steps.

## Build it

Set `kind` to match the archetype: flow (flowcharts, architectures, pipelines, decision trees, org charts; default), sequence (participants with messages in order), state (start and final states are marked), er (entity cards; list columns in node `fields`), mindmap (first node is the root), swimlane (each subgraph is a lane). The component is `diagram` with props `kind`, `nodes` [{id, label, group?, shape?, note?, fields?}], `edges` [{from, to, label?}], optional `subgraphs` [{id, label, nodes: [ids]}] and `directed` (default true; false only for symmetric relationships). The renderer chooses top-down or left-to-right layout from the frame, routes back-edges around the outside, colours by group, and lets people pan, zoom, drag and select a node to read its note. Do not author coordinates, direction, colours or CSS.

- Labels: two to four plain, pronounceable words. Detail goes in note or nearby text.
- Shapes: box (step, service; default), diamond (decision, check, approval), cylinder (data store, archive, memory), pill (start, end, event, external actor). Set shape explicitly; otherwise it is guessed from words in the label and group.
- Edges: every edge names the action, data or condition ("validates token", "yes", "on error"). Every node connects to at least one edge unless the diagram is a set of independent items.
- Groups and subgraphs: a group is a category shared across the diagram (one to six groups); a subgraph is a boundary containing specific nodes. Use subgraphs instead of a flat web when there are more than about twelve nodes.
- Keep supplied names and relationships exactly; do not invent components, protocols or steps the source did not give. Mark assumed parts as assumed in the note and in the summary.

## Screen and speech

Put a visible one-to-two-sentence summary before the diagram, in a section description or text: what the system or process does, its main path and any material risk or limit. Speech reads that summary, then one line per edge ("Gateway → validates token → Auth service") and the unconnected nodes; notes on connected nodes are not read, so a caveat that matters must be in the summary. Size: a diagram usually fits maxWidth md or lg; wide architectures may use full.

Before delivery check: archetype fits the question, every edge has a label, shapes match roles, node and edge names agree with the summary, and no fact appears only in colour or position.
