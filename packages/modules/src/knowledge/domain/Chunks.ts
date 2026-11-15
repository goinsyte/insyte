import { Effect } from "effect"
import { DIMENSIONS, type EmbedderApi } from "./Knowledge.ts"

/*
 * A published chapter in pieces for search (ai.md §11), and the deterministic embedder the tests, local runs and
 * previews use. Pure, tested on their own (`test/knowledge-chunks.test.ts`).
 *
 * Pieces follow the chapter's headings: each section (a heading and what follows it) is a piece, with the chapter's
 * title and the heading in front so a piece read alone still says what it is about. A section longer than `SIZE`
 * characters (about 800 tokens of Dutch) is cut at paragraph or sentence ends, each later cut starting `OVERLAP`
 * characters back, so a sentence split across two pieces is whole in one of them.
 */

export const SIZE = 3200
export const OVERLAP = 300

export interface Piece {
  readonly ordinal: number
  readonly text: string
}

/** Where a long text is best cut at or before `end`: a blank line, a line end, a sentence end, a space. */
const cutAt = (text: string, start: number, end: number) => {
  if (end >= text.length) return text.length
  const window = text.slice(start, end)
  for (const mark of ["\n\n", "\n", ". ", " "]) {
    const at = window.lastIndexOf(mark)
    if (at > (end - start) / 2) return start + at + mark.length
  }
  return end
}

const split = (text: string): Array<string> => {
  const out: Array<string> = []
  let start = 0
  while (start < text.length) {
    const end = cutAt(text, start, start + SIZE)
    out.push(text.slice(start, end).trim())
    if (end >= text.length) break
    start = Math.max(end - OVERLAP, start + 1)
  }
  return out.filter((p) => p !== "")
}

/** The chapter's pieces, in order: a section per heading, long sections cut with overlap. */
export const chunk = (title: string, body: string): ReadonlyArray<Piece> => {
  const sections: Array<{ heading: string; text: string }> = []
  let current = { heading: "", lines: [] as Array<string> }
  for (const line of body.replaceAll("\r\n", "\n").split("\n")) {
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading !== null) {
      if (current.heading !== "" || current.lines.some((l) => l.trim() !== "")) {
        sections.push({ heading: current.heading, text: current.lines.join("\n").trim() })
      }
      current = { heading: heading[1]!.trim(), lines: [] }
    } else {
      current.lines.push(line)
    }
  }
  if (current.heading !== "" || current.lines.some((l) => l.trim() !== "")) {
    sections.push({ heading: current.heading, text: current.lines.join("\n").trim() })
  }
  const pieces = sections.flatMap((s) => {
    const label = s.heading === "" ? title : `${title} · ${s.heading}`
    const parts = s.text === "" ? [""] : split(s.text)
    return parts.map((p) => (p === "" ? label : `${label}\n\n${p}`))
  })
  return (pieces.length === 0 ? [title] : pieces).map((text, ordinal) => ({ ordinal, text }))
}

/* ── the fake embedder ─────────────────────────────────────────────────────────────────────────────────────────── */

/** Lower case, without accents, split into words of three letters or more. */
export const wordsOf = (text: string): ReadonlyArray<string> =>
  text.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) =>
    w.length >= 3
  )

/** FNV-1a over the word, 32 bits. */
const hash = (word: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * A vector of the text's words: each word adds one to its own place (by hash), and its first five letters a half to
 * theirs, so "verzending" and "verzendkosten" share something. Normalised to length one, so the cosine of two texts is
 * how many words they share against how long they are. Deterministic; knows nothing of meaning.
 */
export const fakeVector = (text: string): ReadonlyArray<number> => {
  const v = Array.from({ length: DIMENSIONS }, () => 0)
  for (const w of wordsOf(text)) {
    v[hash(w) % DIMENSIONS]! += 1
    if (w.length > 5) v[hash(`${w.slice(0, 5)}*`) % DIMENSIONS]! += 0.5
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return norm === 0 ? v : v.map((x) => x / norm)
}

/** The fake: free, sent nowhere, the same vector for the same text every time. */
export const FAKE_EMBEDDER: EmbedderApi = {
  provider: "fake",
  model: "fake-words-1024",
  minScore: 0.12,
  pricePerMillion: 0,
  embed: (texts) => Effect.succeed(texts.map(fakeVector))
}

/** A vector as pgvector reads it: `[0.1,0.2,…]`. */
export const vectorLiteral = (v: ReadonlyArray<number>) => `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`
