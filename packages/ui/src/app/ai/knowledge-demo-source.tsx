import { useParams, useSearch } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useMyName } from "../ask/agent-demo"
import { type Article, type Gap, PUBLISHED_FOR, statusOf } from "../lib/knowledge"
import { undoable } from "../lib/undo"
import { useGate } from "../stores/access-store"
import { useKnowledge } from "../stores/knowledge-store"
import type { ArticleSearch } from "./article-screen"
import {
  type ArticleSource,
  ArticleSourceProvider,
  type KnowledgeSource,
  KnowledgeSourceProvider
} from "./knowledge-source"

/*
 * The design app's Kennisbank: its knowledge store, persisted per browser. Every change says itself with Undo, as the
 * console's do; Insyte's first texts are written out for the seeded gaps.
 */

const ALWAYS = { ok: true, reason: "" }

function useDemoKnowledgeSource(): KnowledgeSource {
  const articles = useKnowledge((s) => s.articles)
  const gaps = useKnowledge((s) => s.gaps)
  const me = useMyName()
  const gate = useGate("settings", 3)
  return {
    rows: articles.map((a) => ({
      id: a.id,
      title: a.title,
      audience: a.audience,
      status: statusOf(a),
      length: a.body.length,
      editedBy: a.editedBy,
      editedAt: a.editedAt,
      uses7d: a.uses7d
    })),
    gaps: gaps.filter((g) => g.state === "open"),
    gate,
    create: (title, audience, body) => {
      const a = useKnowledge.getState().create(title, audience, body, me)
      undoable(`Concept “${title}” gemaakt`, () => useKnowledge.getState().remove(a.id)())
      return Promise.resolve(a.id)
    },
    dismissGap: (g: Gap) => undoable("Vraag genegeerd", useKnowledge.getState().setGap(g.id, { state: "dismissed" })),
    linkGap: (gapId, articleId) => {
      useKnowledge.getState().setGap(gapId, { articleId })
      return Promise.resolve(true)
    }
  }
}

function useDemoArticleSource(): ArticleSource | null {
  const { articleId } = useParams({ strict: false }) as { articleId?: string }
  const search = useSearch({ strict: false }) as ArticleSearch
  const a = useKnowledge((s) => s.articles.find((x) => x.id === articleId))
  const gap = useKnowledge((s) => (search.gap ? s.gaps.find((g) => g.id === search.gap) : undefined))
  const gate = useGate("settings", 3)
  const me = useMyName()
  if (!a) return null
  return {
    article: a,
    gap,
    gate,
    publishGate: () => ALWAYS,
    save: (draft: Pick<Article, "title" | "audience" | "body">, publish: boolean) => {
      const undo = useKnowledge.getState().save(a.id, draft, me, publish)
      undoable(
        publish ? `“${draft.title}” gepubliceerd` : `Concept van “${draft.title}” opgeslagen`,
        undo,
        publish
          ? PUBLISHED_FOR[draft.audience]
          : "De agents lezen nog de gepubliceerde versie."
      )
      return Promise.resolve(true)
    },
    revert: (n) => {
      const undo = useKnowledge.getState().revert(a.id, n, me)
      undoable(`Versie ${n} staat weer gepubliceerd`, undo, "Als een nieuwe versie, zodat de oude blijven bestaan.")
      return Promise.resolve(true)
    },
    versions: () => Promise.resolve(a.versions),
    firstText: () =>
      Promise.resolve(
        gap
          ? (SUGGESTIONS[gap.id] ??
            "Schrijf hier het antwoord. Houd het kort: twee of drie zinnen, met de termijn of het bedrag erin.")
          : null
      )
  }
}

/** The design app's provider around the list. */
export function DemoKnowledgeSource({ children }: { children: ReactNode }) {
  return <KnowledgeSourceProvider value={useDemoKnowledgeSource()}>{children}</KnowledgeSourceProvider>
}

/** The design app's provider around one chapter, by the address's `$articleId` and `?gap=`. */
export function DemoArticleSource({ children }: { children: ReactNode }) {
  return <ArticleSourceProvider value={useDemoArticleSource()}>{children}</ArticleSourceProvider>
}

/* Insyte's first texts for the seeded gaps, drafted from the rest of the knowledge base and the settings. */
const SUGGESTIONS: Record<string, string> = {
  gap_1:
    "Sale-artikelen kun je niet retourneren voor je geld terug. Ruilen voor een andere maat kan wel, binnen 30 dagen na bezorging, via het retourportaal.",
  gap_2: "We versturen nog niet naar Zwitserland. Bestellen kan wel met een adres in Duitsland of Oostenrijk.",
  gap_3:
    "Een cadeaubon en een kortingscode kun je samen gebruiken: vul eerst de code in en betaal de rest met je cadeaubon.",
  gap_4:
    "Binnen een uur na het betalen kunnen we je bestelling nog aanpassen. Stuur ons dan meteen een bericht met je bestelnummer.",
  gap_5:
    "In Duitsland kun je bij het afrekenen een DHL-Packstation of -punt kiezen. In Nederland en België bezorgt PostNL ook bij een afhaalpunt."
}
