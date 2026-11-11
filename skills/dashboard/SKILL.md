---
name: dashboard
description: Build an operational or enterprise dashboard from supplied records or available governed data tools, with metrics, trends and detail views.

compatibility: Uses supplied records and governed domain tools; Vakyartha owns presentation.
metadata:
  presentation-support: "true"

  category: reports
  author: Vakyartha
  version: "1.0.0"
allowed-tools: use_skill
---

# Decision-focused dashboards

## Steps

1. **scope**: Identify the decision, reporting window, timezone, population, units and available supplied records. Ask for essential missing data rather than fabricate observations.
2. **analyze**: Retain complete relevant records and source freshness. Separate source facts, user criteria and checked derived results. Missing periods are missing comparisons.
   - needs: scope
3. **check**: Check source values, arithmetic, coverage and requested actions. Explain the central finding and limits. A report does not establish scheduling or an external update.
   - needs: analyze

## Domain guidance


Use for an overview from supplied records or successful governed reads. Load enabled domain procedures for their metric definitions for source access and metric definitions. Vakyartha owns presentation.

Resolve the decision, reporting window, timezone, population, units and source freshness. Separate source facts, editable criteria and checked derived results. Include only measures and views answering the question. Missing prior periods are missing comparisons, not invented baselines. A small summary may be sufficient; retain exact detail records when inspection matters.

Map related views to one canonical collection; keep independent outputs separate. Bind global criteria in an explicit submitted form. On submission, update affected metrics, charts, detail records and visible interpretation together; preserve unrelated surfaces and drafts. Local table browsing does not cross-filter other views. Source refresh requires a successful source read; a dashboard does not itself create scheduling or external updates.

State the central finding, period, units and coverage caveat visibly so screen and speech agree. Independently check source values, calculations and interactions before claiming completion. A valid surface is not a receipt for an external effect.
