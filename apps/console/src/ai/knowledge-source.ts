import { useAtomSet } from "@effect/atom-react"
import type { Article, ArticleList, Gap } from "@insyte/modules/knowledge/domain/Knowledge"
import type { ArticleSource, KnowledgeGate, KnowledgeSource } from "@insyte/ui/app/ai/knowledge-source"
import type { Article as UiArticle, ArticleVersion, Gap as UiGap } from "@insyte/ui/app/lib/knowledge"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { useMemo } from "react"
import { toast } from "sonner"
import { KNOWLEDGE, knowledgeWrites } from "../data/knowledge.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"
import { sayAiRefusal } from "./drafts.tsx"

/*
 * Kennisbank in the console (M15 step 7): `Knowledge.*` as the design's chapters and questions. Instellingen ·
 * Bekijken reads, Beheren writes; publishing a chapter the customer agent reads also needs `ai.autonomy`, as the
 * server says. Every write says itself with Undo (`Shared.undo`), and a save names the revision it started from, so
 * one made over someone else's says so instead of overwriting it. The first text comes from `Drafts.knowledgeAnswer`:
 * only from published chapters, or nothing.
 */

const iso = (ms: number) => new Date(ms).toISOString()

/** The server's question as the design's. */
const gapOf = (g: Gap): UiGap => ({
  id: g.id,
  question: g.question,
  at: iso(g.at),
  customer: g.customer,
  threadId: g.threadId ?? undefined,
  channel: g.channel,
  state: g.state,
  articleId: g.articleId ?? undefined
})

/**
 * The server's chapter as the design's: its versions without their text, but for the published one's, which the
 * status reads; the drawer reads the others when it opens.
 */
const articleOf = (a: Article): UiArticle => {
  const pub = a.published
  return {
    id: a.id,
    title: a.title,
    audience: a.audience,
    body: a.body,
    versions: a.versions.map((v) => ({
      n: v.version,
      at: iso(v.at),
      by: v.by,
      title: v.title,
      body: v.version === pub?.version ? pub.body : "",
      published: pub !== null && v.published && v.version <= pub.version
    })),
    editedAt: iso(a.editedAt),
    editedBy: a.editedBy,
    uses7d: a.uses7d
  }
}

const notDone = (error: unknown) =>
  sayRefusal(error, {
    gone: "Dit hoofdstuk bestaat niet meer",
    invalid: {
      title: "Een titel is 1 tot 120 tekens.",
      body: "Een hoofdstuk is hoogstens 40.000 tekens.",
      storeId: "Die winkel bestaat niet meer."
    },
    other: (tagged) => {
      switch (tagged._tag) {
        case "KnowledgeStale":
          toast.error("Iemand anders heeft dit hoofdstuk net aangepast", {
            description: "Je ziet nu hun versie. Breng je wijziging opnieuw aan en sla dan op."
          })
          return true
        case "ArticleArchived":
          toast.error("Dit hoofdstuk is gearchiveerd", { description: "De agents gebruiken het niet meer." })
          return true
        case "GapNotOpen":
          toast.error("Deze vraag is al afgehandeld", { description: "Iemand anders was je voor." })
          return true
        default:
          return false
      }
    }
  })

type Undo = { readonly token: string } | null

function useUndo() {
  const undo = useAtomSet(knowledgeWrites.undo, { mode: "promiseExit" })
  return (title: string, ticket: Undo, description?: string) => {
    if (ticket === null) return void toast.success(title, description === undefined ? undefined : { description })
    undoable(
      title,
      () =>
        void undo({ payload: { token: ticket.token }, reactivityKeys: [...KNOWLEDGE] }).then((done) => {
          if (Exit.isFailure(done)) notDone(failureOf(done))
        }),
      description
    )
  }
}

/** The list's source, over `Knowledge.list` and the open questions. */
export function useConsoleKnowledgeSource(list: ArticleList, gaps: ReadonlyArray<Gap>): KnowledgeSource {
  const create = useAtomSet(knowledgeWrites.create, { mode: "promiseExit" })
  const dismiss = useAtomSet(knowledgeWrites.dismissGap, { mode: "promiseExit" })
  const link = useAtomSet(knowledgeWrites.linkGap, { mode: "promiseExit" })
  const say = useUndo()
  const gate: KnowledgeGate = useGate("settings", 3)
  const rows = useMemo(
    () =>
      list.rows.map((r) => ({
        id: r.id,
        title: r.title,
        audience: r.audience,
        status: r.status,
        length: r.length,
        editedBy: r.editedBy,
        editedAt: iso(r.editedAt),
        uses7d: r.uses7d
      })),
    [list.rows]
  )
  const open = useMemo(() => gaps.filter((g) => g.state === "open").map(gapOf), [gaps])
  return {
    rows,
    gaps: open,
    gate,
    create: async (title, audience, body) => {
      const exit = await create({ payload: { title, audience, body }, reactivityKeys: [...KNOWLEDGE] })
      if (Exit.isFailure(exit)) {
        notDone(failureOf(exit))
        return null
      }
      say(`Concept “${title}” gemaakt`, exit.value.undo)
      return exit.value.article.id
    },
    dismissGap: (g) =>
      void dismiss({ payload: { gapId: g.id }, reactivityKeys: [...KNOWLEDGE] }).then((exit) => {
        if (Exit.isFailure(exit)) return notDone(failureOf(exit))
        say("Vraag genegeerd", exit.value.undo)
      }),
    linkGap: async (gapId, articleId) => {
      const exit = await link({ payload: { gapId, articleId }, reactivityKeys: [...KNOWLEDGE] })
      if (Exit.isFailure(exit)) {
        notDone(failureOf(exit))
        return false
      }
      return true
    }
  }
}

/** One chapter's source, over `Knowledge.get` and the question it is written for. */
export function useConsoleArticleSource(article: Article, gap: Gap | undefined): ArticleSource {
  const saveDraft = useAtomSet(knowledgeWrites.saveDraft, { mode: "promiseExit" })
  const publish = useAtomSet(knowledgeWrites.publish, { mode: "promiseExit" })
  const restore = useAtomSet(knowledgeWrites.restoreVersion, { mode: "promiseExit" })
  const archive = useAtomSet(knowledgeWrites.archive, { mode: "promiseExit" })
  const version = useAtomSet(knowledgeWrites.version, { mode: "promiseExit" })
  const firstText = useAtomSet(knowledgeWrites.firstText, { mode: "promiseExit" })
  const say = useUndo()
  const gate: KnowledgeGate = useGate("settings", 3)
  const autonomy = useGate("ai.autonomy")
  const ui = useMemo(() => articleOf(article), [article])
  return {
    article: ui,
    gap: gap === undefined ? undefined : gapOf(gap),
    gate,
    // The customer agent's chapters also need `ai.autonomy`; a chapter it reads already keeps that check.
    publishGate: (audience) =>
      !gate.ok ? gate : audience === "assistant" || autonomy.ok ? { ok: true, reason: "" } : autonomy,
    save: async (draft, toPublish) => {
      const payload = { id: article.id, ...draft, baseRevision: article.revision }
      const exit = await (toPublish ? publish : saveDraft)({ payload, reactivityKeys: [...KNOWLEDGE] })
      if (Exit.isFailure(exit)) {
        notDone(failureOf(exit))
        return false
      }
      say(
        toPublish ? `“${draft.title}” gepubliceerd` : `Concept van “${draft.title}” opgeslagen`,
        exit.value.undo,
        toPublish
          ? "De klantagent en Vraag Insyte gebruiken vanaf nu deze versie."
          : "De agents lezen nog de gepubliceerde versie."
      )
      return true
    },
    revert: async (n) => {
      const exit = await restore({ payload: { id: article.id, version: n }, reactivityKeys: [...KNOWLEDGE] })
      if (Exit.isFailure(exit)) {
        notDone(failureOf(exit))
        return false
      }
      say(
        `Versie ${n} staat weer gepubliceerd`,
        exit.value.undo,
        "Als een nieuwe versie, zodat de oude blijven bestaan."
      )
      return true
    },
    versions: async () => {
      const read = await Promise.all(
        article.versions.map((v) => version({ payload: { id: article.id, version: v.version } }))
      )
      return read.flatMap((exit, i): ReadonlyArray<ArticleVersion> => {
        const known = ui.versions[i]
        if (known === undefined) return []
        return [Exit.isSuccess(exit) ? { ...known, body: exit.value.body } : known]
      })
    },
    firstText: async () => {
      if (gap === undefined) return null
      const exit = await firstText({ payload: { gapId: gap.id, articleId: article.id } })
      if (Exit.isFailure(exit)) {
        sayAiRefusal(failureOf(exit))
        return null
      }
      if (exit.value._tag === "Written") return exit.value.draft.text
      toast.message("Insyte vond hier geen antwoord op", {
        description: exit.value.reason === "no_knowledge"
          ? "Er is nog niets gepubliceerd over deze vraag. Schrijf het antwoord zelf."
          : "De gepubliceerde hoofdstukken beantwoorden deze vraag niet. Schrijf het antwoord zelf."
      })
      return null
    },
    archive: async () => {
      const exit = await archive({ payload: { id: article.id }, reactivityKeys: [...KNOWLEDGE] })
      if (Exit.isFailure(exit)) {
        notDone(failureOf(exit))
        return false
      }
      say(`“${article.title}” gearchiveerd`, exit.value.undo, "De agents gebruiken het niet meer.")
      return true
    }
  }
}
