import { Conflict, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { inScopeOrNone } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import { type Channel, Gap, GapChanged, GapList, GapNotOpen, GapRestore, type GapsInput } from "../domain/Knowledge.ts"

/*
 * "Nog niet beantwoord" (M15 step 7; domain.md §12.31): the questions Insyte could not answer from the knowledge base.
 * A reply draft files one when the customer asked something neither the order facts nor a published chapter answer
 * (`file`); the customer agent will too. One open row per question: a repeat raises its count. "Toevoegen aan…" points
 * it at a chapter, whose next publication answers it; "negeren" puts it aside, with Undo.
 *
 * The question is the shopper's own words, with what looks like an address or a phone number taken out; the name
 * beside it is a first name. A gap from a ticket keeps the ticket's store and is read only by who reaches it.
 */

export const GAP_RESTORE = "knowledge_gaps.restore"

interface Row {
  readonly id: string
  readonly question: string
  readonly customerLabel: string
  readonly channel: Channel
  readonly threadId: string | null
  readonly ticketId: string | null
  readonly state: "open" | "answered" | "dismissed"
  readonly targetArticleId: string | null
  readonly count: number
  readonly lastSeenAt: Date
  readonly firstSeenAt: Date
}

const gapOf = (r: Row) =>
  new Gap({
    id: r.id,
    question: r.question,
    customer: r.customerLabel,
    channel: r.channel,
    threadId: r.threadId,
    ticketId: r.ticketId,
    state: r.state,
    articleId: r.targetArticleId,
    count: r.count,
    at: r.lastSeenAt.getTime(),
    firstSeenAt: r.firstSeenAt.getTime()
  })

const COLUMNS = `g.id, g.question, g.customer_label, g.channel, g.thread_id, g.ticket_id, g.state, g.target_article_id,
  g.count, g.last_seen_at, g.first_seen_at`

/** A Dutch postcode ("1234 AB"), and the words after four digits that are not one ("2026 en"). */
const POSTCODE = /\b[1-9]\d{3}\s?([a-z]{2})\b/gi
const NOT_POSTCODE = new Set([
  "EN",
  "OF",
  "IS",
  "OP",
  "IN",
  "TE",
  "OM",
  "IK",
  "JE",
  "NU",
  "DE",
  "ER",
  "AL",
  "SA",
  "SD",
  "SS"
])

/** The question without an e-mail address, a phone number or a postcode in it, on one line, at most 500 characters. */
export const cleanQuestion = (text: string) =>
  text
    .normalize("NFKC")
    .replaceAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replaceAll(/\+?\d[\d\s-]{7,}\d/g, "[telefoon]")
    .replaceAll(POSTCODE, (m, letters: string) => (NOT_POSTCODE.has(letters.toUpperCase()) ? m : "[postcode]"))
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 500)

/** What two askings of one question share: lower case, letters and digits only. */
export const questionKey = (question: string) =>
  question.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "").toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, " ").trim()

/** Kennisbank's gaps (the open ones unless asked), the most recent first, with the open count. */
export const list = Effect.fn("Knowledge.gaps")(function*(sql: SqlClient.SqlClient, input: GapsInput) {
  yield* Policy.require("settings", 1)
  const scope = yield* inScopeOrNone(sql, "g.store_id")
  const state = input.state ?? "open"
  const rows = yield* sql<Row>`
    select ${sql.literal(COLUMNS)} from knowledge_gaps g
    where g.state = ${state} and ${scope}
    order by g.last_seen_at desc, g.id
    limit ${input.limit ?? 50}`
  const [open] = yield* sql<{ n: number }>`
    select count(*)::int as n from knowledge_gaps g where g.state = 'open' and ${scope}`
  return new GapList({ rows: rows.map(gapOf), open: open?.n ?? 0 })
})

const find = Effect.fn("Knowledge.findGap")(function*(sql: SqlClient.SqlClient, id: string, lock = false) {
  const scope = yield* inScopeOrNone(sql, "g.store_id")
  const rows = lock
    ? yield* sql<Row>`select ${sql.literal(COLUMNS)} from knowledge_gaps g where g.id = ${id} and ${scope} for update`
    : yield* sql<Row>`select ${sql.literal(COLUMNS)} from knowledge_gaps g where g.id = ${id} and ${scope}`
  const [row] = rows
  if (row === undefined) return yield* new NotFound({ entity: "knowledge_gap", id })
  return row
})

/** One gap: the editor's banner ("Je beantwoordt: …"). */
export const get = Effect.fn("Knowledge.gap")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* Policy.require("settings", 1)
  return gapOf(yield* find(sql, id))
})

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.gen(function*() {
    const p = yield* CurrentPrincipal
    yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
      action,
      subjectType: "knowledge_gap",
      subjectId: id,
      ...(diff === undefined ? {} : { diff })
    })
  })

/** "negeren": out of the list; its undo opens it again. */
export const dismiss = Effect.fn("Knowledge.dismissGap")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* Policy.require("settings", 3)
  const row = yield* find(sql, id, true)
  if (row.state !== "open") return yield* new GapNotOpen({ state: row.state })
  const p = yield* CurrentPrincipal
  yield* sql`update knowledge_gaps set state = 'dismissed', dismissed_at = now(), dismissed_by = ${p.id}
             where id = ${id}`
  yield* audit(sql, "knowledge_gap.dismissed", id)
  const undo = yield* Undo.issue(sql, {
    command: GAP_RESTORE,
    compensation: { gapId: id, state: "open", articleId: row.targetArticleId } satisfies GapRestore
  })
  return new GapChanged({ gap: gapOf(yield* find(sql, id)), undo })
})

/** A gap ignored opens again (`restoreGap`, and the undo of "negeren"). */
const reopen = Effect.fn("Knowledge.reopenGap")(function*(
  sql: SqlClient.SqlClient,
  id: string,
  articleId: string | null
) {
  const row = yield* find(sql, id, true)
  if (row.state === "open") return row
  if (row.state !== "dismissed") return yield* new GapNotOpen({ state: row.state })
  // Asked again while it was ignored: that one stands, this one stays aside.
  const [other] = yield* sql`select 1 from knowledge_gaps
                             where question_key = (select question_key from knowledge_gaps where id = ${id})
                               and state = 'open'`
  if (other !== undefined) return yield* new Conflict({ entity: "knowledge_gap", reason: "asked_again" })
  yield* sql`update knowledge_gaps set state = 'open', dismissed_at = null, dismissed_by = null,
                                     target_article_id = ${articleId}
             where id = ${id}`
  yield* audit(sql, "knowledge_gap.reopened", id)
  return yield* find(sql, id)
})

export const restore = Effect.fn("Knowledge.restoreGap")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* Policy.require("settings", 3)
  return new GapChanged({ gap: gapOf(yield* reopen(sql, id, null)), undo: null })
})

const decodeRestore = Schema.decodeUnknownEffect(GapRestore)

/** The undo of "negeren". */
export const undoDismiss = Effect.fn("Knowledge.undoDismiss")(function*(
  sql: SqlClient.SqlClient,
  compensation: unknown
) {
  const c = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("settings", 3)
  // Answered meanwhile: nothing to open again.
  yield* reopen(sql, c.gapId, c.articleId).pipe(
    Effect.catchTag("GapNotOpen", (e) => Effect.fail(new Conflict({ entity: "knowledge_gap", reason: e.state })))
  )
})

/** "Toevoegen aan…": the chapter whose next publication answers the gap. */
export const link = Effect.fn("Knowledge.linkGap")(function*(
  sql: SqlClient.SqlClient,
  input: { readonly gapId: string; readonly articleId: string }
) {
  yield* Policy.require("settings", 3)
  const row = yield* find(sql, input.gapId, true)
  if (row.state !== "open") return yield* new GapNotOpen({ state: row.state })
  const scope = yield* inScopeOrNone(sql, "a.store_id")
  const [a] = yield* sql<{ archived: boolean }>`
    select a.archived_at is not null as archived from knowledge_articles a where a.id = ${input.articleId} and ${scope}`
  if (a === undefined || a.archived) return yield* new NotFound({ entity: "knowledge_article", id: input.articleId })
  yield* sql`update knowledge_gaps set target_article_id = ${input.articleId} where id = ${input.gapId}`
  yield* audit(sql, "knowledge_gap.linked", input.gapId, { articleId: input.articleId })
  return new GapChanged({ gap: gapOf(yield* find(sql, input.gapId)), undo: null })
})

/** Where a question nothing answered came from. */
export interface GapSource {
  readonly question: string
  readonly channel: Channel
  readonly customerLabel: string
  readonly threadId: string | null
  readonly ticketId: string | null
  readonly storeId: string | null
  readonly sourceKind: "draft" | "ask_turn" | "channel_message"
  readonly sourceId: string | null
}

/**
 * A question nothing in the knowledge base answered: a new open gap, or the open one for the same question asked
 * again. Not a command of anyone's: no policy beyond the caller's, no undo.
 */
export const file = Effect.fn("Knowledge.fileGap")(function*(sql: SqlClient.SqlClient, source: GapSource) {
  const question = cleanQuestion(source.question)
  const key = questionKey(question)
  if (key === "") return null
  const [row] = yield* sql<{ id: string; count: number }>`
    insert into knowledge_gaps (id, workspace_id, store_id, question, question_key, channel, customer_label, thread_id,
                                ticket_id, source_kind, source_id)
    values (${mintId("kgp")}, app_workspace_id(), ${source.storeId}, ${question}, ${key}, ${source.channel},
            ${source.customerLabel.slice(0, 120)}, ${source.threadId}, ${source.ticketId}, ${source.sourceKind},
            ${source.sourceId})
    on conflict (workspace_id, question_key) where state = 'open'
    do update set count = knowledge_gaps.count + 1, last_seen_at = now(),
                  thread_id = coalesce(excluded.thread_id, knowledge_gaps.thread_id),
                  customer_label = excluded.customer_label
    returning id, count`
  yield* audit(sql, row!.count === 1 ? "knowledge_gap.filed" : "knowledge_gap.asked_again", row!.id)
  return row!.id
})
