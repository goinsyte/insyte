import { NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { CurrentPrincipal, type Principal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  AskBusy,
  type AskContext,
  AskRemoved,
  AskRestore,
  AskThread,
  AskThreadList,
  AskThreadRow,
  AskTurn,
  type Source,
  STALE_MS,
  type Token,
  type ToolChip,
  type TurnFailure
} from "../domain/Ask.ts"

/*
 * Vraag Insyte's conversations as they are kept (M15 step 3): listed, read, set aside with Undo, and a turn begun and
 * settled. Every row is its owner's (the policy holds reads and writes to the principal that owns them), and an answer
 * that read from a store the reader no longer reaches is not given back (`withheld`). Only what the person was shown
 * is kept: no prompt and no tool output.
 */

/** How many earlier questions and answers the model reads back. */
const HISTORY = 4

const ownerKind = (p: Principal) => (p.kind === "api_key" || p.kind === "agent" ? p.kind : "member")

interface TurnRow {
  readonly id: string
  readonly role: "user" | "assistant"
  readonly state: "streaming" | "settled" | "failed"
  readonly text: string
  readonly tokens: string
  readonly tools: string
  readonly sources: string
  readonly followUps: ReadonlyArray<string>
  readonly thinking: ReadonlyArray<string>
  readonly thinkingMs: number | null
  readonly failure: TurnFailure | null
  readonly storeIds: ReadonlyArray<string>
  readonly createdAt: Date
}

const TURN_COLUMNS = `id, role, state, text, tokens::text as tokens, tools::text as tools, sources::text as sources,
  follow_ups, thinking, thinking_ms, failure, store_ids, created_at`

/** Whether the principal still reaches every store the answer read from. */
const reaches = (p: Principal, stores: ReadonlyArray<string>) =>
  p.storeScope === null || stores.every((s) => p.storeScope!.includes(s))

const parsed = <A>(text: string): ReadonlyArray<A> => {
  try {
    const value: unknown = JSON.parse(text)
    return Array.isArray(value) ? (value as ReadonlyArray<A>) : []
  } catch {
    return []
  }
}

export const turnOf = (p: Principal, r: TurnRow): AskTurn => {
  const stale = r.state === "streaming" && r.createdAt.getTime() < Date.now() - STALE_MS
  const withheld = r.role === "assistant" && !reaches(p, r.storeIds)
  return new AskTurn({
    id: r.id,
    role: r.role,
    state: stale ? "failed" : r.state,
    text: withheld ? "" : r.text,
    tokens: withheld ? [] : parsed<Token>(r.tokens),
    tools: withheld ? [] : parsed<ToolChip>(r.tools),
    sources: withheld ? [] : parsed<Source>(r.sources),
    followUps: withheld ? [] : r.followUps,
    thinking: withheld ? [] : r.thinking,
    thinkingMs: r.thinkingMs,
    failure: stale ? "interrupted" : r.failure,
    withheld,
    createdAt: r.createdAt.getTime()
  })
}

export const list = Effect.fn("Ask.list")(function*(sql: SqlClient.SqlClient, limit = 50) {
  const rows = yield* sql<{ id: string; title: string; lastTurnAt: Date }>`
    select id, title, last_turn_at from ask_threads
    where owner_id = app_principal_id() and deleted_at is null
    order by last_turn_at desc, id desc limit ${limit}`
  return new AskThreadList({
    rows: rows.map((r) => new AskThreadRow({ id: r.id, title: r.title, lastTurnAt: r.lastTurnAt.getTime() }))
  })
})

const threadRow = (sql: SqlClient.SqlClient, id: string) =>
  Effect.gen(function*() {
    const [row] = yield* sql<{ id: string; title: string; lastTurnAt: Date }>`
      select id, title, last_turn_at from ask_threads
      where id = ${id} and owner_id = app_principal_id() and deleted_at is null`
    if (row === undefined) return yield* new NotFound({ entity: "ask_thread", id })
    return row
  })

export const get = Effect.fn("Ask.get")(function*(sql: SqlClient.SqlClient, id: string) {
  const p = yield* CurrentPrincipal
  const thread = yield* threadRow(sql, id)
  const turns = yield* sql.unsafe<TurnRow>(
    `select ${TURN_COLUMNS} from ask_turns where thread_id = $1 and owner_id = app_principal_id() order by seq`,
    [id]
  )
  return new AskThread({
    id: thread.id,
    title: thread.title,
    lastTurnAt: thread.lastTurnAt.getTime(),
    turns: turns.map((t) => turnOf(p, t))
  })
})

/** "Gesprek verwijderd": set aside, with Undo; the turns stay with it. */
export const remove = Effect.fn("Ask.remove")(function*(sql: SqlClient.SqlClient, id: string) {
  const p = yield* CurrentPrincipal
  yield* threadRow(sql, id)
  yield* sql`update ask_threads set deleted_at = now() where id = ${id} and owner_id = app_principal_id()`
  yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
    action: "ask.thread_removed",
    subjectType: "ask_thread",
    subjectId: id
  })
  const undo = yield* Undo.issue(sql, { command: "ask.restore", compensation: { id } })
  return new AskRemoved({ id, undo })
})

/** `Shared.undo` for `ask.restore`: the conversation back in the list. */
export const restore = Effect.fn("Ask.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const p = yield* CurrentPrincipal
  const { id } = yield* Schema.decodeUnknownEffect(AskRestore)(compensation).pipe(Effect.orDie)
  const back = yield* sql`update ask_threads set deleted_at = null
                          where id = ${id} and owner_id = app_principal_id() returning id`
  if (back.length === 0) return yield* new NotFound({ entity: "ask_thread", id })
  yield* Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
    action: "ask.thread_restored",
    subjectType: "ask_thread",
    subjectId: id
  })
})

/** A turn begun: what the loop needs to answer it, and the question as the thread draws it. */
export interface Begun {
  readonly threadId: string
  readonly title: string
  readonly question: AskTurn
  readonly turnId: string
  readonly history: ReadonlyArray<{ readonly question: string; readonly answer: string }>
}

/**
 * The conversation so far, as the model reads it back: the last questions and their answers, without an answer read
 * from a store the person no longer reaches (it is withheld from them, so it is not told to the model either).
 */
const historyOf = (sql: SqlClient.SqlClient, p: Principal, threadId: string) =>
  sql<{ question: string; answer: string; storeIds: ReadonlyArray<string> }>`
    select question, answer, store_ids from (
      select a.seq, q.text as question, a.text as answer, a.store_ids
      from ask_turns a join ask_turns q on q.thread_id = a.thread_id and q.seq = a.seq - 1 and q.role = 'user'
      where a.thread_id = ${threadId} and a.role = 'assistant' and a.state = 'settled' and a.text <> ''
      order by a.seq desc limit ${HISTORY}
    ) last order by seq`.pipe(
    Effect.map((rows) =>
      rows.filter((r) => reaches(p, r.storeIds)).map(({ question, answer }) => ({ question, answer }))
    )
  )

/**
 * The question kept and the answer's row opened (`streaming`), on a thread of the person's own (a new one when none is
 * named, titled by the question). One answer at a time per thread.
 */
export const begin = Effect.fn("Ask.begin")(function*(
  sql: SqlClient.SqlClient,
  input: {
    readonly threadId: string | undefined
    readonly text: string
    readonly context: AskContext | undefined
    readonly retryOf?: string | undefined
  }
) {
  const p = yield* CurrentPrincipal
  let threadId: string
  let title: string
  if (input.threadId === undefined) {
    threadId = mintId("ask")
    title = input.text.replaceAll(/\s+/g, " ").slice(0, 60)
    yield* sql`insert into ask_threads (id, workspace_id, owner_kind, owner_id, title)
               values (${threadId}, ${p.workspaceId}, ${ownerKind(p)}, ${p.id}, ${title})`
  } else {
    const thread = yield* threadRow(sql, input.threadId)
    threadId = thread.id
    title = thread.title
    // The thread's row, locked, so two questions at once cannot both see it idle.
    yield* sql`select id from ask_threads where id = ${threadId} for update`
    const [busy] = yield* sql<{ id: string }>`
      select id from ask_turns where thread_id = ${threadId} and state = 'streaming'
        and created_at > now() - make_interval(secs => ${STALE_MS / 1000})`
    if (busy !== undefined) return yield* new AskBusy({ threadId })
  }
  const history = yield* historyOf(sql, p, threadId)
  const [last] = yield* sql<{ seq: number | null }>`select max(seq) as seq from ask_turns where thread_id = ${threadId}`
  const seq = (last?.seq ?? 0) + 1
  const questionId = mintId("atn")
  const turnId = mintId("atn")
  const context = input.context === undefined ? null : JSON.stringify(input.context)
  const [asked] = yield* sql<{ createdAt: Date }>`
    insert into ask_turns (id, workspace_id, thread_id, owner_id, seq, role, state, text, context, retry_of)
    values (${questionId}, ${p.workspaceId}, ${threadId}, ${p.id}, ${seq}, 'user', 'settled', ${input.text},
            ${context}::jsonb, ${input.retryOf ?? null})
    returning created_at`
  yield* sql`insert into ask_turns (id, workspace_id, thread_id, owner_id, seq, role, state)
             values (${turnId}, ${p.workspaceId}, ${threadId}, ${p.id}, ${seq + 1}, 'assistant', 'streaming')`
  yield* sql`update ask_threads set last_turn_at = now() where id = ${threadId}`
  const question = new AskTurn({
    id: questionId,
    role: "user",
    state: "settled",
    text: input.text,
    tokens: [],
    tools: [],
    sources: [],
    followUps: [],
    thinking: [],
    thinkingMs: null,
    failure: null,
    withheld: false,
    createdAt: asked?.createdAt.getTime() ?? Date.now()
  })
  return { threadId, title, question, turnId, history } satisfies Begun
})

/** "Opnieuw vragen": the question of an answer, to ask again on its thread. */
export const questionOf = Effect.fn("Ask.questionOf")(function*(sql: SqlClient.SqlClient, turnId: string) {
  const [row] = yield* sql<{ threadId: string; text: string; context: string | null }>`
    select q.thread_id, q.text, q.context::text as context
    from ask_turns a
    join ask_turns q on q.thread_id = a.thread_id and q.seq = a.seq - 1 and q.role = 'user'
    join ask_threads t on t.id = a.thread_id and t.deleted_at is null
    where a.id = ${turnId} and a.role = 'assistant' and a.owner_id = app_principal_id()`
  if (row === undefined) return yield* new NotFound({ entity: "ask_turn", id: turnId })
  const context = row.context === null ? undefined : (JSON.parse(row.context) as AskContext)
  return { threadId: row.threadId, text: row.text, context }
})

/** The answer as it settled, or how it failed. */
export interface Settled {
  readonly state: "settled" | "failed"
  readonly text: string
  readonly tokens: ReadonlyArray<Token>
  readonly tools: ReadonlyArray<ToolChip>
  readonly sources: ReadonlyArray<Source>
  readonly followUps: ReadonlyArray<string>
  readonly thinking: ReadonlyArray<string>
  readonly thinkingMs: number
  readonly failure: TurnFailure | null
  readonly storeIds: ReadonlyArray<string>
  readonly refs: ReadonlyArray<string>
  readonly promptVersion: string | null
  readonly modelCallIds: ReadonlyArray<string>
}

export const settle = Effect.fn("Ask.settle")(function*(sql: SqlClient.SqlClient, turnId: string, s: Settled) {
  const p = yield* CurrentPrincipal
  const [row] = yield* sql.unsafe<TurnRow>(
    `update ask_turns set state = $2, text = $3, tokens = $4::jsonb, tools = $5::jsonb, sources = $6::jsonb,
       follow_ups = $7::text[], thinking = $8::text[], thinking_ms = $9, failure = $10, store_ids = $11::text[],
       refs = $12::text[], prompt_version = $13, model_call_ids = $14::text[], settled_at = now()
     where id = $1 and owner_id = app_principal_id()
     returning ${TURN_COLUMNS}`,
    [
      turnId,
      s.state,
      s.text.slice(0, 20_000),
      JSON.stringify(s.tokens),
      JSON.stringify(s.tools),
      JSON.stringify(s.sources),
      [...s.followUps],
      [...s.thinking],
      s.thinkingMs,
      s.failure,
      [...s.storeIds],
      [...s.refs],
      s.promptVersion,
      [...s.modelCallIds]
    ]
  )
  if (row === undefined) return yield* new NotFound({ entity: "ask_turn", id: turnId })
  return turnOf(p, row)
})
