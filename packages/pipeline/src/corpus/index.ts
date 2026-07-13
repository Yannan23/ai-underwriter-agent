// cspell:ignore chunker
import { readFileSync } from 'node:fs'

import { type GuidelineChunk } from '@prism/contracts'

/** Corpus version recorded on every chunk (PRD §6 `guideline_versions`). */
export const GUIDELINE_VERSION = 'pi-guidelines.v1'

/** Stable id prefix — Stage 5 citations reference these ids across runs. */
const CHUNK_ID_PREFIX = 'gl-v1-'

interface Section {
  headingPath: string[]
  body: string[]
}

/**
 * Markdown-aware chunker (PRD §6): one chunk per `##` section, with the
 * heading path (`#` category › `##` section) prepended to the text so each
 * embedding carries its context. Ids are assigned in document order, so they
 * are stable as long as sections are only ever appended — any reordering must
 * ship as a new corpus version.
 */
export function chunkGuidelineMarkdown(markdown: string): GuidelineChunk[] {
  const sections: Section[] = []
  let topHeading: string | undefined
  let current: Section | undefined

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd()

    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim()

      current = {
        headingPath: topHeading ? [topHeading, heading] : [heading],
        body: [],
      }
      sections.push(current)
    } else if (line.startsWith('# ')) {
      // New top-level category; prose directly under it is preamble, not a chunk.
      topHeading = line.slice(2).trim()
      current = undefined
    } else if (current) {
      current.body.push(line)
    }
  }

  return sections.map((section, index) => ({
    id: `${CHUNK_ID_PREFIX}${String(index + 1).padStart(3, '0')}`,
    guidelineVersion: GUIDELINE_VERSION,
    headingPath: section.headingPath,
    text: `${section.headingPath.join(' > ')}\n\n${section.body.join('\n').trim()}`,
  }))
}

let corpus: GuidelineChunk[] | undefined

/** Loads and chunks the authored guideline corpus once per process. */
export function loadGuidelineCorpus(): GuidelineChunk[] {
  return (corpus ??= chunkGuidelineMarkdown(
    readFileSync(new URL('pi-guidelines.v1.md', import.meta.url), 'utf8')
  ))
}
