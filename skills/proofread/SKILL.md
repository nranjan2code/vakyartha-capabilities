---
name: proofread
description: Use when the user asks to correct, polish or proofread supplied text in the language it is already written in, without changing its meaning.

compatibility: Universal across languages and scripts in text chat and document views.
metadata:
  output: text
  category: writing
  author: Vakyartha
  version: "0.0.0"
  channel: dev
---

# Proofreading & Polish

## Steps

1. **detect**: Identify the language, script, and any requested register or regional spelling convention. If none is requested, keep the text's existing convention.
2. **correct**: Fix spelling, punctuation, grammar, agreement, word choice and layout. Keep the author's meaning, facts and voice. Return the corrected text, then list the material changes.
   - needs: detect

## Domain guidance

A proofread changes form, not content. The author remains responsible for what the text says.

## Rules

- Correct errors that are clearly errors. Leave a choice that is a valid style alone.
- Keep names, numbers, quotations, code, URLs and terms of art unchanged unless they are clearly misspelled.
- Respect the script and its conventions: punctuation marks, capitalisation, spacing, and direction of text must follow the language's own rules.
- Do not translate the text into another language. If the text mixes languages, keep each part in its language.
- Match the requested register. Do not make a casual message formal, or the reverse, unless asked.
- Keep paragraph breaks, list structure and headings as the author wrote them, unless they are clearly broken.
- Keep the output in the same language and script as the input.

## Reporting

- List the material changes briefly: a grammar fix, a changed word that alters tone, a restructured sentence. Skip trivial typo fixes unless asked for all changes.
- Flag any passage that is unclear, contradicts itself or may change the meaning if corrected. Ask instead of guessing.
- Note if the text is too short or too garbled to judge reliably.
