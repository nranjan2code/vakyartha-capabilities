---
name: news-desk-reader
description: Find current news stories, headlines and publisher coverage from News Desk, ranked and grouped across publishers
allowed-tools: app-news-desk__get_latest_articles app-news-desk__get_bulletin app-news-desk__get_story_coverage
metadata:
  author: Vakyartha
  part-of: app:news-desk
---
# News Desk Reader

## Steps

1. **read**: Read saved stories, the requested bulletin or story coverage using the matching query. Retain publisher links, publication times and ranking reasons.
   - tool: app-news-desk__get_latest_articles app-news-desk__get_bulletin app-news-desk__get_story_coverage
   - effect: read
   - rounds: 2
2. **interpret**: Attribute the returned reporting and distinguish publication time from retrieval and event time. A grouping does not prove agreement. Preserve an explicitly requested bulletin script.
   - needs: read

## Domain guidance

This skill reads the ranked stories News Desk has gathered from the user's chosen publisher feeds.

## Procedures & Rules
1. When the user asks about current news, headlines, a person, company, place or topic in the news, or publisher coverage, call `app-news-desk__get_latest_articles`.
2. Pass `query` for a topic (every word must appear in a headline, excerpt or tag) and `category` for a section (`World`, `National`, `Business`, `Technology`, `Science`, `Health`, `Sports`, `Entertainment`, `Opinion`, or the user's own section names). Use `limit` up to 50.
3. Each story has a lead headline, its publisher, link, publication time, the list of publishers carrying it and the reasons it ranks. Cite those exactly, with the links; say how many publishers carry a story when it is more than one. Never invent news facts, quotes or citations, and do not present a grouping as proof that reports agree.
4. When the user wants to hear the news, a briefing or a bulletin, call `app-news-desk__get_bulletin` (optionally with `channel` = top, foryou, section:<name> or topic:<followed topic>, or with `category` / `query`) and give its `text` as written: it is already a spoken script with attributions. Its `programme` is the same bulletin in parts for Listen and Watch (breaking stories lead and say when they were first seen; `ticker` lists the stories it does not read); do not paraphrase it, and suggest the app's Watch button when the user wants to see it. Do not shorten it into a list or invent transitions about the news. The compact header News channel selector chooses the stored channel; the adjacent radio and per-app voice picker play it directly; these query tools never start playback. The radio becomes Stop during preparation/playback; the floating playback control appears only away from the owning header.
5. When the user asks how a story is being covered, what different outlets say, or for the full story, call `app-news-desk__get_story_coverage` with words naming it, and present each report with its publisher, time and link in publication order.
6. An empty result means News Desk has no matching story yet; say so and suggest refreshing News Desk, following the topic, or browsing discovered topics.

## More detail

For the app's other skills, background operation, access review, package updates or what a refresh costs, read `references/app-operation.md` with read_skill_file.
