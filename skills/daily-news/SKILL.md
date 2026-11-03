---
name: daily-news
description: Prepare a current daily news digest or headline dashboard for a selected date, region and topics using accessible sources.

compatibility: Works with text summaries, news readers, web search tools, and interactive digest canvases.
metadata:
  requires: "integration:web"
  enhances: "integration:brave-search integration:tavily"
  category: live-data
  author: Vakyartha
  version: "1.0.0"
allowed-tools: read_skill_file use_skill vak_render vak_update vak_submit app-news-desk__get_latest_articles app-news-desk__get_bulletin app-news-desk__get_story_coverage
---

# Daily News Digest & Headline Reviews

Methodology for compiling accurate, sourced daily news digests, executive media briefings and topic-focused headline roundups.

## Overview & Chaining

- **Purpose**: Use this skill when asked to summarize today's news, compile a morning briefing on a specific industry, or produce an interactive headline dashboard.
- **Skill chaining**:
  - Load `research-brief` when a specific developing news story requires in-depth multi-source investigation and evidence analysis.
  - Load `interactive-ui` when an interactive news canvas with topic tabs or source filters is requested.
  - The required `surface-design` skill governs card layout, source typography and spoken audio briefings.

## News Gathering & Source Discipline

0. **Use the user's own News Desk first** when `app-news-desk__get_latest_articles` is offered: it returns stories already gathered from the user's chosen publishers, grouped across outlets and ranked, with links. Use `app-news-desk__get_bulletin` for a spoken briefing (optional `channel`: top, foryou, section:<name> or topic:<followed topic>), preserve its attribution and pacing, and `app-news-desk__get_story_coverage` for how one story is covered. Fall back to web search only for what News Desk does not hold, and say which is which.
1. **Verify temporal & regional context**:
   - Establish the exact date, target region and topics from the request.
   - Use offered web search or reader tools to retrieve live reporting. If live search tools are unavailable, clearly state that real-time news cannot be retrieved and operate solely from supplied text.
   - **Critical rule**: Never invent headlines, quote fabricated press releases, or synthesize current events from model training memory.
2. **Deduplication & Event clustering**:
   - Cluster multiple reports covering the same underlying event into a single cohesive story item.
   - Note when differing outlets report conflicting details (e.g. differing casualty figures or financial estimates).
3. **Temporal separation**:
   - Differentiate the **event occurrence time**, the **article publication timestamp**, and the **retrieval timestamp**.
4. **Classification discipline**:
   - Clearly delineate verified factual developments from corporate announcements, speculative rumors, and opinion/editorial commentary.

## Source attribution

In spoken projections refer to publishers naturally; visible evidence retains actual source links and timestamps.
