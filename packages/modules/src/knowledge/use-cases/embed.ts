import { Db } from "@insyte/database/Db"
import { Effect } from "effect"
import { vectorLiteral } from "../domain/Chunks.ts"
import { Embedder } from "../domain/Knowledge.ts"
import { budgetLeft, meter } from "./search.ts"

/*
 * A published chapter's pieces embedded (M15 step 7), on the jobs Worker after `knowledge.published` was relayed: as
 * `system` in the workspace. Each call to the embedder is metered; none is made when the stage has no embedder or the
 * month's budget is spent, and the pieces are found by their words meanwhile. A piece embedded already is left alone,
 * so a retry finishes the rest; a newer publication's pieces are its own job.
 */

/** Pieces per call to the embedder. */
const BATCH = 32

export type Embedded = "none" | "off" | "budget" | "embedded"

export const embedArticle = Effect.fn("Knowledge.embedArticle")(function*(articleId: string, version: number) {
  const embedder = yield* Embedder
  const db = yield* Db
  let done = 0
  for (;;) {
    const { pieces, room } = yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        const rows = yield* sql<{ id: string; text: string }>`
          select id, text from knowledge_chunks
          where article_id = ${articleId} and version = ${version} and embedding is null
          order by ordinal limit ${BATCH}`
        return { pieces: rows, room: rows.length === 0 ? true : yield* budgetLeft(sql) }
      })
    )
    if (pieces.length === 0) return done === 0 ? "none" : "embedded"
    if (embedder === null) return "off"
    if (!room) return "budget"
    const texts = pieces.map((p) => p.text)
    const started = Date.now()
    const made = yield* embedder.embed(texts).pipe(Effect.result)
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* meter(sql, embedder, {
          texts,
          latencyMs: Date.now() - started,
          ok: made._tag === "Success",
          subject: { type: "knowledge_article", id: articleId },
          memberId: null,
          principalKind: "system"
        })
        if (made._tag === "Failure") return
        for (const [i, p] of pieces.entries()) {
          const v = made.success[i]
          if (v === undefined) continue
          yield* sql`update knowledge_chunks set embedding = ${vectorLiteral(v)}::vector, embedded_at = now()
                     where id = ${p.id} and embedding is null`
        }
      })
    )
    if (made._tag === "Failure") return yield* made.failure
    done += pieces.length
  }
})
