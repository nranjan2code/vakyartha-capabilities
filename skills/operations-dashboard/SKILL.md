---
name: operations-dashboard
description: Create a service or delivery dashboard for backlog, throughput, aging, blockers and service targets from supplied operational records.

compatibility: Works with issue trackers, ticketing systems, delivery logs, and canvas projection.
metadata:

  category: reports
  author: Vakyartha
  version: "1.0.0"
allowed-tools: use_skill
---

# Operations & Service Delivery Dashboards

## Steps

1. **scope**: Identify the operational population, reporting period, units, queue definitions and available supplied records.
2. **analyze**: Calculate supported throughput, backlog, cycle time and SLA measures with explicit denominators and missingness. Distinguish stocks from flows.
   - needs: scope
3. **check**: Verify arithmetic, source coverage and interpretation. Do not claim an operational action, cross-filter or source refresh without its receipt.
   - needs: analyze

## Domain guidance


Operational methodology for monitoring workload queues, incident response, team throughput, ticket aging, SLA compliance and service bottlenecks.

## Overview & Chaining

- **Purpose**: Use this skill when asked to evaluate team delivery performance, track customer support ticket queues, monitor incident resolution SLAs, or audit operational backlogs.
- **Skill chaining**:
  - Load `task-tracker` when the primary focus is managing individual tasks and assignees rather than aggregate operational metrics.

## Operational Metrics & Throughput Rules

1. **Queue lifecycle metrics**:
   - **Active Backlog**: Snapshot count of all currently open, pending or in-progress work items.
   - **Throughput / Velocity**: Count of tickets or tasks successfully resolved/closed within the stated reporting window.
   - **Work In Progress (WIP)**: Count of items currently under active execution.
2. **Aging & Cycle time**:
   - **Ticket Age**: Elapsed time from creation to present for open tickets.
   - **Cycle Time / Lead Time**: Elapsed time from ticket initiation to completion for closed tickets.
   - *Rule*: Distinguish missing creation timestamps from zero age. Never calculate average resolution time by mixing open and closed items.
3. **SLA compliance & Service targets**:
   - Evaluate SLA breaches strictly against explicit contractual or team thresholds (e.g. Severity 1 response $< 1$ hour).
   - Do not mark a ticket "Overdue" or "Breached" unless an explicit deadline, due date or SLA rule is defined.

## Action Handling & System Boundaries

- **Interactive triage**: Provide bound filters (`select`, `checkbox`) for Team, Severity, or SLA Status in a compact form (`maxWidth: "md"`) with an explicit submit action (`submit: "triage_filter"`).
- **Coherent recalculation**: Submitting a filter must recalculate backlog counts, update charts, refresh the exception list and revise the natural-language summary together.
- **External ticketing sync**: Rendering an operational dashboard does not update tickets in Jira, ServiceNow, Zendesk or GitHub Issues unless an authorized tool returns a verified receipt.
