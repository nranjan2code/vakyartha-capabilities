# Architecture

- `app.json` declares the development app, Node 26 runtime, tool-free render and header listening. There are no declared schedules, external tools or network destinations.
- `capture.ts` is a terminal utility run explicitly by an engineer. It probes ARM subscription identity and makes independent scoped reads. It projects a fixed allowlist of fields, validates pagination, returns schema 1 JSON, and emits source-specific unavailability when a source fails. Its known continuation is restricted to the same Azure host, subscription and path.
- `data.ts` owns identifiers, limits, capture/source record validation, timestamps and CSV escaping. A capture is untrusted input. Tenant and subscription matching, provider IDs, timestamps, bounds and duplicate IDs are checked before any accepted write.
- `server.ts` validates the retained checkpoint and derives all views from it. The host's serialized writer persists subscriptions, latest scoped results and triage. Unavailable and stale observations are distinguished from an available source with zero rows. The package retains one accepted observation per source and a validated pending capture while the person edits the form.
- `surface.json` is generated from the empty retained state. A tool-free render rebuilds the visual and spoken projections when the host reviews a package update. CSV goes through the shared explicit Downloads action.

A scope save updates customer labels, queue and selections across the desk. An import updates customer coverage, inventory, the queue and its spoken text, and the capture receipt table. Queue selection, its filters and local triage affect only the queue. Inventory selection affects only inventory. Capture scope and pending JSON edit only the capture view. The capture helper is never loaded by the backend, and the runtime never owns credentials, permissions, connection timers or background polling.

Once a scope is registered its IDs remain fixed. Timestamp checks reject older observations. A failed import leaves the prior accepted state intact, while an accepted unavailable observation removes the older source rows from the queue or inventory and retains locally saved triage for future matching IDs.

`work.ts` validates scoped work-log records and closure evidence. The service review derives current source coverage, alert severity, and open work by type from their owners. `billing.ts` parses invoice CSV, aggregates with exact fixed-point arithmetic, and saves only validated invoice and customer aggregates. Work and invoice drafts affect only Service review. Saved scope metadata affects all views, and triage changes update both the queue and review.

Two read-only tools expose scope metadata and one capture. Tenant and subscription must match for the scoped read. The host discards query-context changes. Billing aggregates, work notes, and triage notes are outside both tools' results.
