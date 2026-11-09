# Project Activity Desk

A working view of a public repository: recently updated issues, open pull requests and recent commits, charts of the sample, and local triage lanes for planning your attention. Records are read through the governed Web pages integration from the public repository API; triage never writes back, and actions make no model request.

## Connect

Open the header **Access** shield, finish **Web pages** setup inside the panel and review this app’s foreground tools and repository source destination. Review background access separately. Open **Apps → Project Activity Desk**, type a public `owner/repository` (a full repository URL also works) and press **Refresh**. Until a read succeeds the Triage view says exactly this.

## Views

| View | What it shows |
| --- | --- |
| **Triage** | Repository field and **Refresh**; counts for open and closed issues, open pull requests and commits in the sample; charts of issues by state (pie), by label (select a bar to view matching issues) and by last-update day; a board of open issues in Review, Next and Watch lanes (drag, or use the keyboard); the issue table with numbers, labels, authors and update times. |
| **Activity** | Commits per day; recent commits as a timeline with author and short SHA links, beside the open pull requests table. |
| **Sources** | The latest 24 reads with URL, retrieval time, rows and status. |

Moving a card saves immediately. Changing the repository takes effect when you press Refresh and starts a fresh sample and empty lanes. A refresh in which some reads fail shows a warning naming the first failure and keeps earlier records.

## Sample and limits

Each refresh reads up to 20 recently updated issues (pull requests excluded), 10 open pull requests and 10 commits. Counts and charts describe this sample, not the whole backlog or throughput. Unauthenticated public API rate limits apply. A 15-minute refresh is declared but off until you choose **Start & keep running** under **Background**.

## Data

Records, lanes and receipts live in app state and are saved only when a run succeeds. Lanes are kept for issues that are still open in the sample.

## Hosted operation

The shared Background control in this app and Operation Center owns Keep running, startup, refresh timing, recovery and receipts. Start & keep running invokes startup-refresh now and on Vakyartha launch, using the saved repository. Configure the repository and integration access first. Manual refresh remains available when background operation is stopped; Manual only timing still permits startup and app feeds. Do not duplicate host controls or timers in package views.

Startup and the default 15-minute refresh execute ordinary bounded refresh code with this app’s explicit background tool access. The host retains committed state and retries failed background computation without external calls at most three times; uncertain effects block replay for exact-run review. Updates preserve saved data and stop background operation for renewed review. Vakyartha and the computer must remain running and awake.

## Shared Access and package review

This package declares 1 integration tool. Its action requirements are listed in entitlements.toolActions; review tools and destinations in Access, with separate foreground/background choices. Source and domain preferences do not grant access. Keep saved records and source freshness separate from permission readiness.

Use the host shield on the app card/header and the Settings Access, Background, Package & updates and App preferences tabs. Integration setup stays inside this panel. Revoke affects this app/tool; shared integration settings disclose their wider scope.

Review complete package source/fingerprints and the access delta before updating. Preserve domain data, stop Background and review access for the changed package; do not blindly update packages or edited/disabled/removed skills. Ask currently blocks for in-panel review, not a waiting sandbox approval. Follow the root docs/features/APP-ACCESS.md contract, including shared stdio/native-audit limitations and independent source/outcome gates.

The manifest marks every declared tool with a plain-language purpose and optional/needed status. `renderApp(context)` is this package’s effect-free update projection: it reads retained copies and returns the same canonical views without source calls. The host discards renderer state/database mutations, refuses a failed rebuild and keeps the original package/data/views.


## Interaction and refresh cost

The shared Apps host retains its header and assistant dock across view changes and reconciles only changed canonical views after actions or background refresh. Local search and paging stay in the surface. Field handlers save normalized drafts without external reads. Return all views affected by a domain change, including spoken projections. Prefer a focused update for a draft with no other consumers and preserve saved computed values. Keep SQL and source calls for operations that need them. Each app retains its own contained worker across successful commands. Keep running controls hosted scheduling and restart eligibility. Durable state belongs in host checkpoints. Measure saved-data clicks, draft saves, source refresh and cold open separately before claiming a latency improvement.
