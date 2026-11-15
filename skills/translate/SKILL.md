---
name: translate
description: Use when the user asks to translate supplied text between any two languages or scripts, keeping meaning, names, numbers and tone intact.

compatibility: Universal across languages and scripts in text chat and document views.
metadata:
  output: text
  category: writing
  author: Vakyartha
  version: "0.0.0"
  channel: dev
---

# Text Translation

## Steps

1. **read**: Identify the source language and script, the target language, and any requested register or regional variant. State the detected source language. If the target is missing, ask for it.
2. **translate**: Translate the whole text into the target language. Keep names, numbers, units, dates, formatting and tone. Add nothing the source does not say.
   - needs: read

## Domain guidance

Meaning first, then natural phrasing in the target language. A translation should read as if written in that language, not as word-for-word output.

## Preserve

- Names of people, places and organisations: keep the original form unless the target language has an established equivalent. Transliterate only when asked.
- Numbers, units, currencies and dates: keep the values exactly. Convert a date format or unit only when the user asks, and say so.
- Formatting: keep headings, lists, line breaks, code, links and placeholders in place.
- Tone and register: keep formal, casual, polite or technical register as the source uses it.

## Ambiguity

- Flag terms with more than one reasonable meaning, and give the chosen rendering with the alternative in brackets or a short note.
- Flag untranslatable words, idioms, wordplay and culture-bound terms. Offer a closest equivalent and a brief gloss.
- Never silently guess a missing fact. Mark it as unclear in the output.

## Limits

- Do not add explanations, commentary or content to the translation itself. Notes go in a separate section after it.
- For legal, medical or safety-critical text, state that a qualified human translator should check it.
