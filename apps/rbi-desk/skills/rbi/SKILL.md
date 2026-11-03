---
name: rbi
description: Read official Reserve Bank of India rates, CRR, SLR, rupee reference rates, rate changes, weekly forex reserves, Master Directions and KYC rules, circulars, bank penalties and gold bond redemption notices from RBI Desk.

compatibility: Requires the RBI Desk built-in app, refreshed at least once (Web pages integration with fetch_page set to Allow).
metadata:
  author: Vakyartha
  part-of: app:rbi-desk
  loads-with: "interactive-ui"
  requires-read: "true"
  requires-canvas: "true"
  requires-citations: "true"
  requires-values: "true"
  unavailable-message: "RBI Desk is unavailable. Open Apps, install or enable RBI Desk, then Refresh."
allowed-tools: read_skill_file use_skill vak_render vak_update vak_submit app-rbi-desk__get_rbi_briefing app-rbi-desk__get_rbi_rates app-rbi-desk__get_rate_history app-rbi-desk__get_rbi_updates app-rbi-desk__get_forex_reserves app-rbi-desk__find_master_direction
---

# RBI rates and notices

Answers come only from RBI Desk, which reads rbi.org.in. Never state an RBI rate from memory. RBI Desk does not read RBI speeches or publications; say so if asked.

## Dispatch

| The user asks about | Call |
|---|---|
| A current rate: repo, SDF, MSF, bank rate, reverse repo, CRR, SLR, dollar/rupee or other reference rate, T-bill, call money, base rate, MCLR, deposit rates | `app-rbi-desk__get_rbi_rates` with `rate` = the asked key (repo, crr, slr, usd, etc.); omit only for the whole panel |
| Whether a rate changed, or its trend | `app-rbi-desk__get_rate_history` with `rate` = repo, sdf, msf, bank, crr, slr or usd |
| India's forex reserves this week, or reserve components | `app-rbi-desk__get_forex_reserves`; keep US$ million and INR crore distinct, and give `weekEnding` |
| Standing rules or a Master Direction on a topic | `app-rbi-desk__find_master_direction` with `query`; for KYC use "Know Your Customer" |
| A spoken RBI update or briefing | `app-rbi-desk__get_rbi_briefing`; give its `text` as written |
| RBI news, circulars, notifications, penalties on banks, gold bond prices, auctions, KYC, payments, forex reserve releases | `app-rbi-desk__get_rbi_updates` with `tag` (policy, penalty, gold-bond, auction, deposit-rates, kyc, payments, forex-reserves), `feed` or `query` |

## Grounding

1. Quote values exactly as returned, with that record's `date` and `dateBasis`, and its `sourceUrl`. Never take the date of a different rate. Policy rates and reserve ratios have no effective date on RBI's panel: say "as read from rbi.org.in on <date>".
2. If `stale` is true, say the values may be out of date and suggest refreshing RBI Desk.
3. Changes: report only `changes` from the tool. Before `trackedSince`, say RBI Desk has no record; do not guess past decisions.
4. Updates: give the title, date and link exactly. Describe only returned `excerpt` or `detail`. A gold bond redemption amount must come from `detail`, with its per-unit basis and redemption date. Copy `coverageNote` visibly when returned. When count is zero, answer that result; do not broaden to unrelated notices. No matches means no matching notices in the app's limited saved feeds; it does not mean RBI has issued none. For latest KYC circulars use `feed: "Notifications"` and `tag: "kyc"`; the rulebook is a separate lookup.
5. An `error` result: relay how to enable RBI Desk and give no numbers.
6. For "explain simply", read `references/rates-explained.md` and use its fixed explanation next to the current value.
7. Reserves: quote total, FCA, gold, SDRs and IMF position from the same returned week, with the RBI source link and published weekly changes. Do not infer missing past weeks. Directory results are titles, dates and links, not the full directions or a legal interpretation.

## Presentation

Show rates on a canvas with `interactive-ui`: the asked rate in a metric strip with its source and date; add a table for the full panel when asked. History uses the returned `days`, with change points or the explicit tracking limit. Reserves use one component table with units and week ending. Updates and directions use linked titles and dates. The spoken summary leads with the answer and its date. Answer in plain text when the user asks for a quick fact in text.

After the data tool returns, call the offered surface-authoring tool to publish the result before finishing. A single rate still gets a stat plus a text node containing its date and RBI link. The final chat sentence accompanies that canvas. Only an explicit text-only request or unavailable data skips this step.
