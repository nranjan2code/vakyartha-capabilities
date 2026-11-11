---
name: summarize
description: Summarize documents, articles, meeting notes or discussions into clear, structured overviews that preserve critical details, metrics and decisions.

compatibility: Universal summarization across text chat and structured document views.
metadata:
  output: text
  category: writing
  author: Vakyartha
  version: "1.0.0"
---

# Text & Document Summarization

## Steps

1. **extract**: Read the supplied material and identify the central claim, supporting evidence, decisions and material caveats.
2. **summarize**: Write the requested length and format using only the source. Keep attribution, uncertainty and disagreement; do not invent missing details.
   - needs: extract

## Domain guidance


Systematic approach to condensing complex documents, transcripts, research papers and discussions into high-fidelity summaries.

## Overview

Use this skill when asked to summarize, shorten, distill key takeaways, or create an executive overview from provided text, documents, transcripts or external links.

## Summarization Process

1. **Understand scope and target format**:
   - Determine the requested length (one sentence, executive paragraph, bullet highlights, or structured section summary).
   - If unspecified, provide an initial executive synthesis followed by concise bullet takeaways.
2. **Extract core pillars**:
   - **Main thesis / objective**: What primary problem, finding or announcement does the text convey?
   - **Key arguments / findings**: What evidence or supporting reasoning is presented?
   - **Decisions & actions**: What choices were made, who is responsible, and what are the explicit deadlines?
   - **Crucial metrics & figures**: Preserve key numerical findings, percentages, dates and exact terminology.
3. **Preserve nuances and dissent**:
   - Retain caveats, limitations, counterarguments and unresolved questions.
   - Do not smooth over genuine disagreements in meeting notes or multi-party discussions.
4. **Distinguish claims from facts**:
   - Attribute subjective interpretations or claims to their authors (e.g. "The author contends that...", "According to the report...").
   - Clearly delineate what the source empirically proves from what it merely asserts.

## Integrity Rules

- **Zero hallucinated facts**: Never introduce external claims, unmentioned participants, invented deadlines or synthetic statistics into a summary.
- **Do not overstate certainty**: If the source qualifies a claim with "might", "tentative" or "preliminary", reflect that same level of qualification.
- **Respect source boundaries**: State explicitly if a provided text appears incomplete, truncated or cut off mid-thought.
