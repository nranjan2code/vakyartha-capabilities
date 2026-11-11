# Agent Desk architecture

app.json declares a node26 contained package, airgap network, no integration tools, no DuckDB, no triggers, one header listen path and two app exports. get_task_context is immutable. propose_attempt is a revision-checked Ask mutation and only appends an unreviewed candidate. The shared host owns its Access shield, Settings, Background operation, dedicated worker, serial queue, model selection, approvals and output export.

model.ts validates and normalizes JSON state: bounded task contracts, frozen criteria, retained attempts, independent review entries, selection, brief draft, approach and task-local lessons. It derives bounded studio requests and workflow wording. There is no separate retrieval or memory database, harness runtime, tool adapter or background scheduler. A lesson is an ordinary checkpoint associated with one task; it is never automatically activated elsewhere.

server.ts handles local field edits and user actions. It validates proposal revisions and criterion identity, initializes personal review to unchecked, refuses accepted-task proposals and prevents incomplete acceptance. renderApp rebuilds complete surfaces without tools. surfaceFile supplies exact empty views for surface.json. No handler calls a provider, an integration or SQL.

views.ts derives Tasks, Workspace, Evidence and Compare from the same records. Repeaters and tables retain canonical collections with local search/paging. Speech comes from the selected task and review counts. Markdown export contains the same original criteria, selected attempt, references and review notes; host file.save owns delivery. Stable node identities retain local interactions. Independent draft edits update only affected views; data changes update all summaries and spoken consumers.

assistant.compose opens the existing host-owned dock. Send invokes the existing provider/skill/MCP/approval path; the assistant can perform research and coding with its configured integrations before proposing a candidate. work.prepare is an inert host action that validates a bounded goal/criteria pair and opens the existing trusted Work form. Only the person's normal form submission creates a native task. Native execution has separate authoritative state and canonical result surfaces. Agent Desk does not mirror those runtime records or promise automatic synchronization.

Current native Work scope is supplied-input reasoning with exact-byte provider consent, bounded execution, contained reasoner, separate canonical publication, native output evidence and personal result review. Native integration tools, specialized result policies and automatic recursive optimization remain unsupported. Interactive assistant execution is the route for source and sandbox tools. Package source, installed package and installed desktop executable are verified separately.

Every pass claim requires a nonempty source or calculation reference; absence of evidence must be unknown or fail. References and candidate prose remain unverified assistant claims, including claims of tool use. Personal evidence review must check actual receipts. The worker procedure declares get_task_context as its input read; propose_attempt is the separately approved, revision-checked save. Shared workflow saveTool keeps Send and save open until the real commit receipt; no proposal can set personal verdicts or acceptance.

Native Work accepts text, code or interactive candidates, reads bounded UTF-8 text/source snapshots on demand and can load frozen selected skills through the shared loader. It imposes no task-specific layout, comparison ban or flat data model. Native integration tools, decision shaping, real delegation and automatic improvement remain unfinished. Interactive research/coding uses the shared assistant and its existing governed tools. Saved code is not evidence that it ran. Keep original failed outcomes open and lessons inactive until separately reviewed.

Host response evidence: context.assistantExecution is supplied outside model arguments for the matching app assistant turn. get_task_context exposes the currently offered tool names (not permission grants) and completed response receipts. propose_attempt retains this context as execution; it ignores similarly named model arguments. Each receipt contains host identity, tool name, time, status and SHA-256 of the actual arguments and response, without copying their private contents. An in-flight save is not a completed receipt. Evidence, speech and Markdown export distinguish these observations from prose claims and personal verdicts. These receipts do not verify source truth or an external mutation. Missing context remains explicitly absent.

Context queries retain the complete canonical state while returning the frozen contract and a compact attempt index by default. Supply exact attemptId to inspect one full candidate; missing or foreign IDs fail without mutation. This avoids copying all retained results into each primary-model read. Criterion IDs follow the app-created c1 through c8 domain in both schema and validation; error feedback names the exact frozen IDs without remapping claims. Host receipts use a searchable, locally paged table; export retains all receipts and speech uses the same canonical count. Saving content alone does not force another model-authored canvas; explicit canvas procedures remain discoverable.

Field/action dependency map:

| Change | Affected canonical views |
| --- | --- |
| New-task draft field | Tasks |
| Approach | Workspace, including prepared assistant request |
| Review note/verdict with unchanged personal pass count | Evidence and its Markdown export |
| Review note/verdict changing personal pass count | Workspace (attempt counts and speech), Evidence, Compare |
| Selected attempt | Workspace speech and Evidence |
| Task-local lesson | Evidence and export |
| Create/select task, append attempt, accept result | All four views, including speech and export |

Local table search, sort and paging remain projector interactions without a model, source read or package handler. No independent draft performs an external read or SQL.

The packaged assistant skill uses checked domain steps for its declared tools and interpretation. Vakyartha supplies the shared presentation procedure over retained results; this skill does not author report layout. Text requests remain text, and proposal writes still require the existing permissions and personal review.
