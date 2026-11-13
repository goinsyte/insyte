import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { canRole } from "@insyte/domain/Permissions"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  Draft,
  type DraftSubject,
  type KnowledgeAnswer,
  LatestDraft,
  type ReplyInput,
  ThreadSummary,
  TicketSummary
} from "../domain/Ai.ts"
import { replyPrompt } from "../prompts/reply.ts"
import { threadSummaryPrompt, ticketSummaryPrompt } from "../prompts/summary.ts"
import { call, type Caller, type InTx } from "./call.ts"
import { threadFacts, ticketFacts, ticketSummaryFacts } from "./context.ts"

/*
 * Drafts and summaries (M15 step 2; ADR-0027): Insyte writes, a person reads, edits and sends. Nothing here sends a
 * message or changes a record the customer sees; a reply draft is text the composer takes or leaves (`use` says it was
 * taken, for the counts). A ticket's summary goes into its activity as Insyte's line; a thread's is kept as a draft.
 *
 * Each model call runs outside a transaction (`inTx` opens one per step), so a slow model never holds a connection.
 */

type Row = {
  id: string
  subjectType: "thread" | "ticket"
  subjectId: string
  kind: "reply" | "summary" | "knowledge_answer"
  text: string
  tone: "warmer" | "korter" | null
  parentDraftId: string | null
  usedAt: Date | null
  createdAt: Date
  provider: "anthropic" | "fake" | null
  model: string | null
  promptVersion: string
}

const draftOf = (r: Row) =>
  new Draft({
    id: r.id,
    subject: { type: r.subjectType, id: r.subjectId },
    kind: r.kind,
    text: r.text,
    tone: r.tone,
    parentDraftId: r.parentDraftId,
    usedAt: r.usedAt === null ? null : r.usedAt.getTime(),
    createdAt: r.createdAt.getTime(),
    provider: r.provider ?? "fake",
    model: r.model ?? "",
    promptVersion: r.promptVersion
  })

const select = (sql: SqlClient.SqlClient) =>
  sql`select d.id, d.subject_type, d.subject_id, d.kind, d.text, d.tone, d.parent_draft_id, d.used_at, d.created_at,
             m.provider, m.model, d.prompt_version
      from drafts d left join model_calls m on m.id = d.model_call_id`

const callerOf = Effect.gen(function*() {
  const p = yield* CurrentPrincipal
  return (subject: DraftSubject): Caller => ({
    memberId: p.kind === "member" ? p.id : null,
    principalKind: p.kind,
    subject
  })
})

/** The ticket, if the principal's stores reach it. */
const ticketInScope = Effect.fn("Ai.ticketInScope")(function*(sql: SqlClient.SqlClient, ticketId: string) {
  const scope = yield* inScope(sql, "t.store_id")
  const [t] = yield* sql`select 1 from tickets t
                         where t.id = ${ticketId} and t.deleted_at is null and (t.store_id is null or ${scope})`
  if (t === undefined) return yield* new NotFound({ entity: "ticket", id: ticketId })
})

const subjectFacts = (sql: SqlClient.SqlClient, subject: DraftSubject) =>
  subject.type === "thread"
    ? Effect.map(threadFacts(sql, subject.id), (f) => f.context)
    : Effect.flatMap(ticketInScope(sql, subject.id), () => ticketFacts(sql, subject.id))

const insert = (
  sql: SqlClient.SqlClient,
  d: {
    readonly subject: DraftSubject
    readonly kind: Row["kind"]
    readonly text: string
    readonly tone: Row["tone"]
    readonly parentDraftId: string | null
    readonly callId: string
    readonly promptId: string
    readonly promptVersion: string
  }
) =>
  Effect.gen(function*() {
    const p = yield* CurrentPrincipal
    const id = mintId("dft")
    yield* sql`insert into drafts (id, workspace_id, subject_type, subject_id, kind, text, tone, parent_draft_id,
                                   principal_kind, principal_id, model_call_id, prompt_id, prompt_version)
               values (${id}, app_workspace_id(), ${d.subject.type}, ${d.subject.id}, ${d.kind}, ${d.text},
                       ${d.tone}, ${d.parentDraftId}, ${p.kind}, ${p.id}, ${d.callId}, ${d.promptId},
                       ${d.promptVersion})`
    const [row] = yield* sql<Row>`${select(sql)} where d.id = ${id}`
    return draftOf(row!)
  })

/**
 * "Concept schrijven", Warmer maken, Korter maken: a reply to the thread's or the ticket's latest message, or a rewrite
 * of the draft before it with the same facts.
 */
export const reply = Effect.fn("Ai.reply")(function*(inTx: InTx<CurrentPrincipal>, input: ReplyInput) {
  yield* Policy.require("support", 2)
  const callerFor = yield* callerOf
  if ((input.tone === undefined) !== (input.parentDraftId === undefined)) {
    // A rewrite names its tone and the draft it rewrites, both or neither.
    return yield* new Invalid({ fields: { parentDraftId: "required" } })
  }
  const { context, previous } = yield* inTx((sql) =>
    Effect.gen(function*() {
      const facts = yield* subjectFacts(sql, input.subject)
      if (input.parentDraftId === undefined) return { context: facts, previous: null }
      const [parent] = yield* sql<{ text: string }>`
        select text from drafts where id = ${input.parentDraftId} and kind = 'reply'
          and subject_type = ${input.subject.type} and subject_id = ${input.subject.id}`
      if (parent === undefined) return yield* new NotFound({ entity: "draft", id: input.parentDraftId })
      return { context: facts, previous: parent.text }
    })
  )
  const rewrite = input.tone === undefined || previous === null ? null : { tone: input.tone, previous }
  const called = yield* call(inTx, callerFor(input.subject), replyPrompt, { ...context, rewrite }, {
    guard: (o) => o.text.trim() !== ""
  })
  return yield* inTx((sql) =>
    insert(sql, {
      subject: input.subject,
      kind: "reply",
      text: called.value.text.trim(),
      tone: input.tone ?? null,
      parentDraftId: input.parentDraftId ?? null,
      callId: called.callId,
      promptId: replyPrompt.id,
      promptVersion: replyPrompt.version
    })
  )
})

/** The draft went into the composer ("Gebruiken"): counted as taken. Taking it twice is taking it once. */
export const use = Effect.fn("Ai.use")(function*(sql: SqlClient.SqlClient, id: string) {
  yield* Policy.require("support", 2)
  const rows = yield* sql<Row>`
    with used as (update drafts set used_at = coalesce(used_at, now()) where id = ${id} returning id)
    ${select(sql)} where d.id in (select id from used)`
  const [row] = rows
  if (row === undefined) return yield* new NotFound({ entity: "draft", id })
  return draftOf({ ...row, usedAt: row.usedAt ?? new Date() })
})

/**
 * The thread's or ticket's latest reply draft, while it still answers the customer's last message, and whether the
 * principal may ask for one: not on a thread the team answered last. The inbox asks for a draft when there is none and
 * it may.
 */
export const latest = Effect.fn("Ai.latest")(function*(sql: SqlClient.SqlClient, subject: DraftSubject) {
  yield* Policy.require("support", 1)
  const { role } = yield* CurrentPrincipal
  const may = canRole({ ...role, stores: role.stores === "all" ? "all" : [...role.stores] }, "support", 2)
  let since: Date | null = null
  let answered = false
  if (subject.type === "thread") {
    const [t] = yield* sql<{ lastInbound: Date | null; lastDirection: string | null }>`
      select (select max(sent_at) from email_messages m where m.thread_id = t.id and m.direction = 'inbound')
               as last_inbound,
             (select direction from email_messages m where m.thread_id = t.id
              and (m.direction = 'inbound' or m.send_state is distinct from 'failed')
              order by sent_at desc limit 1) as last_direction
      from email_threads t where t.id = ${subject.id} and t.deleted_at is null`
    if (t === undefined) return yield* new NotFound({ entity: "thread", id: subject.id })
    if (t.lastInbound === null) return new LatestDraft({ draft: null, canDraft: false })
    since = t.lastInbound
    // The team answered last: there is nothing to draft until the customer writes again.
    answered = t.lastDirection !== "inbound"
  } else {
    yield* ticketInScope(sql, subject.id)
  }
  const [row] = yield* sql<Row>`
    ${select(sql)}
    where d.subject_type = ${subject.type} and d.subject_id = ${subject.id} and d.kind = 'reply'
      and (${since}::timestamptz is null or d.created_at >= ${since})
    order by d.created_at desc limit 1`
  return new LatestDraft({ draft: row === undefined ? null : draftOf(row), canDraft: may && !answered })
})

/** "Samenvatten" on a ticket: two or three sentences in its activity, as Insyte's line. */
export const summarizeTicket = Effect.fn("Ai.summarizeTicket")(
  function*(inTx: InTx<CurrentPrincipal>, ticketId: string) {
    yield* Policy.require("support", 1)
    const callerFor = yield* callerOf
    const p = yield* CurrentPrincipal
    const facts = yield* inTx((sql) =>
      Effect.flatMap(ticketInScope(sql, ticketId), () => ticketSummaryFacts(sql, ticketId))
    )
    const called = yield* call(inTx, callerFor({ type: "ticket", id: ticketId }), ticketSummaryPrompt, facts, {
      guard: (o) => o.text.trim() !== ""
    })
    const text = called.value.text.trim()
    const commentId = mintId("tcm")
    yield* inTx((sql) =>
      Effect.gen(function*() {
        yield* sql`insert into ticket_comments (id, workspace_id, ticket_id, kind, author_kind, author_id, body)
                 values (${commentId}, app_workspace_id(), ${ticketId}, 'ai_summary', ${p.kind}, ${p.id}, ${text})`
        yield* sql`update tickets set updated_at = now() where id = ${ticketId}`
      })
    )
    return new TicketSummary({ commentId, text })
  }
)

/** A thread's summary, kept beside it as a draft of its own: for the team, never sent. */
export const summarizeThread = Effect.fn("Ai.summarizeThread")(
  function*(inTx: InTx<CurrentPrincipal>, threadId: string) {
    yield* Policy.require("support", 1)
    const callerFor = yield* callerOf
    const facts = yield* inTx((sql) => threadFacts(sql, threadId))
    const subject = { type: "thread", id: threadId } as const
    const called = yield* call(inTx, callerFor(subject), threadSummaryPrompt, {
      subject: facts.context.subject,
      messages: facts.context.messages
    }, { guard: (o) => o.text.trim() !== "" })
    const draft = yield* inTx((sql) =>
      insert(sql, {
        subject,
        kind: "summary",
        text: called.value.text.trim(),
        tone: null,
        parentDraftId: null,
        callId: called.callId,
        promptId: threadSummaryPrompt.id,
        promptVersion: threadSummaryPrompt.version
      })
    )
    return new ThreadSummary({ draftId: draft.id, text: draft.text })
  }
)

/**
 * "Laat Insyte een eerste tekst schrijven" for a knowledge gap or article. Until the knowledge base exists there is
 * nothing to write from: Insyte says so (`no_knowledge`) and calls no model, rather than inventing an answer.
 */
export const knowledgeAnswer = Effect.fn("Ai.knowledgeAnswer")(function*() {
  yield* Policy.require("settings", 2)
  return { _tag: "Nothing", reason: "no_knowledge" } satisfies KnowledgeAnswer as KnowledgeAnswer
})
