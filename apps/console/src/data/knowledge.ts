import { Forbidden, NotFound, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { Article, ArticleList, Gap, GapList } from "@insyte/modules/knowledge/domain/Knowledge"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"

/*
 * Kennisbank (M15 step 7): the chapters, the questions nothing answered yet, and one chapter with its versions, primed
 * by their routes' loaders and carried in the document. Every write names `KNOWLEDGE`, which all of them read again
 * by; a published chapter closes its questions, so the gaps go with it.
 */

export const KNOWLEDGE = ["knowledge"] as const

const errors = Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])

export const knowledgeListAtom = Atom.serializable(
  ConsoleClient.query("Knowledge.list", {}, { reactivityKeys: KNOWLEDGE }),
  { key: "knowledge", schema: AsyncResult.Schema({ success: ArticleList, error: errors }), skipInitialRun: true }
)

/** The open questions, newest first. */
export const knowledgeGapsAtom = Atom.serializable(
  ConsoleClient.query("Knowledge.gaps", { state: "open", limit: 100 }, { reactivityKeys: KNOWLEDGE }),
  { key: "knowledge-gaps", schema: AsyncResult.Schema({ success: GapList, error: errors }), skipInitialRun: true }
)

/** One chapter by its id: the address's `$articleId`. */
export const knowledgeArticleAtom = Atom.family((id: string) =>
  Atom.serializable(
    ConsoleClient.query("Knowledge.get", { id }, { reactivityKeys: KNOWLEDGE }),
    {
      key: `knowledge:${id}`,
      schema: AsyncResult.Schema({ success: Article, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

/** One question by its id: the editor's `?gap=`, which may be older than the open list. */
export const knowledgeGapAtom = Atom.family((gapId: string) =>
  Atom.serializable(
    ConsoleClient.query("Knowledge.gap", { gapId }, { reactivityKeys: KNOWLEDGE }),
    {
      key: `knowledge-gap:${gapId}`,
      schema: AsyncResult.Schema({ success: Gap, error: Schema.Union([NotFound, errors]) }),
      skipInitialRun: true
    }
  )
)

export const knowledgeWrites = {
  create: ConsoleClient.mutation("Knowledge.create"),
  saveDraft: ConsoleClient.mutation("Knowledge.saveDraft"),
  publish: ConsoleClient.mutation("Knowledge.publish"),
  restoreVersion: ConsoleClient.mutation("Knowledge.restoreVersion"),
  archive: ConsoleClient.mutation("Knowledge.archive"),
  dismissGap: ConsoleClient.mutation("Knowledge.dismissGap"),
  linkGap: ConsoleClient.mutation("Knowledge.linkGap"),
  /** A version's text, for the drawer's diff: read when it opens, not kept. */
  version: ConsoleClient.mutation("Knowledge.version"),
  firstText: ConsoleClient.mutation("Drafts.knowledgeAnswer"),
  undo: ConsoleClient.mutation("Shared.undo")
} as const
