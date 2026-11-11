---
name: rbi
description: Read official Reserve Bank of India rates, CRR, SLR, rupee reference rates, rate changes, weekly forex reserves, Master Directions and KYC rules, circulars, bank penalties and gold bond redemption notices from RBI Desk.

compatibility: Requires the RBI Desk built-in app, refreshed at least once (Web pages integration with fetch_page set to Allow).
metadata:

  author: Vakyartha
  part-of: app:rbi-desk

allowed-tools: read_skill_file use_skill app-rbi-desk__get_rbi_briefing app-rbi-desk__get_rbi_rates app-rbi-desk__get_rate_history app-rbi-desk__get_rbi_updates app-rbi-desk__get_forex_reserves app-rbi-desk__find_master_direction
---

# RBI rates and notices

## Steps

1. **read**: Read the query matching the requested rates, history, reserves, notices, directions or spoken briefing. Preserve exact values, dateBasis, sourceUrl and coverageNote.
   - tool: app-rbi-desk__get_rbi_rates app-rbi-desk__get_rate_history app-rbi-desk__get_forex_reserves app-rbi-desk__get_rbi_updates app-rbi-desk__find_master_direction app-rbi-desk__get_rbi_briefing
   - effect: read
   - rounds: 3
2. **interpret**: Answer only from returned RBI evidence. Keep read-on, as-on and week-ending dates distinct, retain stale/coverage limits and do not infer pre-tracking changes or legal meaning from directory titles.
   - needs: read

## Domain guidance

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

## Source interpretation

History uses the returned days and explicit tracking limits. Keep reserve components in their returned units and week ending. Updates and directions retain actual titles, dates and source links. The host owns presentation.
