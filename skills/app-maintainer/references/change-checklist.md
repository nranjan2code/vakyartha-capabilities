# App update and documentation checklist

Read the actual published package and four in-package documents before editing. Preserve the original source/fingerprint and current schema/state. Record expected values, source identity, action results and surface behavior before changing code.

| Code change | Documentation to revisit |
| --- | --- |
| New/changed view, action or navigation | README usage; AGENTS interaction invariants; ARCHITECTURE action flow |
| Source tool, endpoint or permission | README setup/provenance/freshness; AGENTS tool boundary; SKILLS domain/integration responsibilities; ARCHITECTURE network flow |
| Host Access or permission UX | Reuse the shared app draft and one atomic Save changes; check tool modes, destination Allow/Ask/None, all-item scope, cancelled/stale/invalid batches, mixed/saved/unsaved selection states and light/dark wide/narrow geometry. Align authoring/operator/admin/debugger skills, template/scaffold and ADR-066. |
| Database schema, calculation, units or retention | README data/formula/migration contract; AGENTS invariants; ARCHITECTURE single-writer/schema map |
| Refresh cadence or scheduling | README Keep running/startup/refresh timing/recovery and awake/missed-run limits; ARCHITECTURE shared host ownership |
| Exported tool, feed or published skill | README exports/feed setup; AGENTS tool/feed boundaries; SKILLS exported domain skills; ARCHITECTURE inter-app MCP flow |
| In-app studio, AI content proposal or acceptance | README explicit Send/cost/Stop/setup; AGENTS revision and draft boundary; SKILLS shared loader/MCP responsibilities; ARCHITECTURE studio/chat versus app invocation; test permissions and no automatic publication |
| New dependency/runtime capability | Applicable approval first; README setup/limits; AGENTS maintenance boundary; ARCHITECTURE placement |
| Failure/recovery fix | README troubleshooting; AGENTS frozen regression; ARCHITECTURE uncertainty/recovery; SKILLS debugging procedure |

Save an inert draft containing complete updated docs/source. Rehearse without external-tool access. Verify real authorized source/value/interaction/persistence separately. Inspect native WebKit at supported wide/narrow sizes and retain failed reports. Do not reset data, weaken outcome checks, enlarge limits or replace a renderer with app-specific patches to obtain a pass. Document verified results and remaining limits, not a blanket completion claim.

Review both draft and published-base fingerprints before publication. Check schema compatibility explicitly; publication is not an automatic migration system and stops background operation for renewed review. Update in-package verification instructions and the host project's handover/evaluation when available. Missing required docs mean the update is incomplete; create truthful missing documentation for legacy packages before claiming they are maintained reference apps. Files do not grant permission or automatically install named skills.


For interaction changes, inspect each field's SQL/tool dependencies and every consuming view. Preserve unchanged view versions, canonical source values, spoken projections, page/filter/scroll and drafts. Exercise an isolated populated record through partial save, background refresh, validation failure/correction, navigation and reopen. Record cold and warm timings separately and state which package/executable was exercised.
