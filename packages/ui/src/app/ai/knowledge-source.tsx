import { createContext, useContext } from "react"
import type { Article, ArticleStatus, ArticleVersion, Audience, Gap } from "../lib/knowledge"

/** A gate: whether the viewer may, and why not. */
export type KnowledgeGate = { ok: boolean; reason: string }

/** One chapter as Kennisbank's list shows it. */
export type KnowledgeRow = {
  id: string
  title: string
  audience: Audience
  status: ArticleStatus
  /** The working text's length in characters. */
  length: number
  editedBy: string
  editedAt: string
  uses7d: number
}

/**
 * What Instellingen → Insyte AI → Kennisbank reads and does, from whoever hosts it (as `limits-source.tsx` is for
 * Limieten): the design app from its knowledge store, the console from `Knowledge.*` (M15 step 7). Each write says
 * itself, with the host's Undo; one that did not go resolves `false` (or `null`) and leaves the page as it was.
 */
export interface KnowledgeSource {
  rows: ReadonlyArray<KnowledgeRow>
  /** The questions nothing answered yet, newest first. */
  gaps: ReadonlyArray<Gap>
  /** Whether the viewer may write chapters and handle the questions. */
  gate: KnowledgeGate
  /** A new chapter, as a draft: its id, to open it. */
  create: (title: string, audience: Audience, body: string) => Promise<string | null>
  /** "negeren", with Undo. */
  dismissGap: (gap: Gap) => void
  /** "Toevoegen aan…": the chapter whose next publication answers it. */
  linkGap: (gapId: string, articleId: string) => Promise<boolean>
}

/** One chapter in the editor, and what it can do. */
export interface ArticleSource {
  article: Article
  /** The question it is being written for (`?gap=`), while it is open. */
  gap: Gap | undefined
  gate: KnowledgeGate
  /** Publishing for this audience: the customer agent's also needs `ai.autonomy` where the host says so. */
  publishGate: (audience: Audience) => KnowledgeGate
  save: (draft: Pick<Article, "title" | "audience" | "body">, publish: boolean) => Promise<boolean>
  /** "Terugzetten": an earlier version published again, as a new one. */
  revert: (n: number) => Promise<boolean>
  /** Every version with its text, oldest first, for the drawer's diff. */
  versions: () => Promise<ReadonlyArray<ArticleVersion>>
  /** "Laat Insyte een eerste tekst schrijven": a first answer to the question, or nothing to write it from. */
  firstText: () => Promise<string | null>
  /** Out of every answer, with Undo; absent where the host has no archive. */
  archive?: () => Promise<boolean>
}

const ListContext = createContext<KnowledgeSource | null>(null)
const ArticleContext = createContext<ArticleSource | null>(null)

export const KnowledgeSourceProvider = ListContext.Provider
export const ArticleSourceProvider = ArticleContext.Provider

export function useKnowledgeSource(): KnowledgeSource {
  const source = useContext(ListContext)
  if (source === null) throw new Error("Kennisbank needs a KnowledgeSourceProvider around it.")
  return source
}

/** The chapter in the editor, or `null` where the host found none. */
export function useArticleSource(): ArticleSource | null {
  return useContext(ArticleContext)
}
