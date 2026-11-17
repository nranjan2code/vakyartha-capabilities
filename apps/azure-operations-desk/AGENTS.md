# Maintain Azure Operations Desk

Read README, ARCHITECTURE, SKILLS, then the catalog rules. Keep the app installable through the catalog and use the app host's Access, Background, voice and export controls.

- Keep tenant and subscription immutable after registration. Every imported record and nonempty target must belong to the declared subscription. Test two tenants and a mislabeled record.
- Preserve failed capture and missing coverage semantics. A source failure, pagination limit, and a successful empty result have different meanings. Reject older imports without changing the latest accepted capture.
- Keep source status and local triage independent. An unavailable capture removes that source's rows from current views. Previously saved local triage remains associated with the original signal ID.
- The sandbox must stay airgapped. The explicit terminal collector uses only Azure CLI reads against the selected subscription, and neither returns nor stores credentials.
- Keep the generated empty surface, dependencies between fields and views, CSV provenance, and spoken and visual counts in step. Use the shared local search and paging.
- Run catalog quick checks, verify the app registry journey in the real sandbox, and inspect a populated WebKit window wide and narrow. Test independent source values and export receipts. Report live Azure validation separately.

- Keep invoice reconciliation exact, scoped by billing currency and invoice, with raw CSV discarded after validation. Service work must stay within its registered subscription and close with evidence. Read exports exclude invoice, work and triage notes.
