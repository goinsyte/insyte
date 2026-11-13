import { Db } from "@insyte/database/Db"
import { Conflict, type Forbidden, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import { canRole } from "@insyte/domain/Permissions"
import type { AreaId } from "@insyte/domain/Permissions"
import { CurrentPrincipal, type PrincipalKind } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient, SqlError } from "effect/sql"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  ProposalAction,
  ProposalChange,
  ProposalClosed,
  ProposalRestore,
  ProposalStale,
  type ProposalState,
  type ProposalView,
  wordOf
} from "../domain/Proposals.ts"
import { ProposalLinks } from "../Links.ts"
import { type Draft, draftFor, insertRevision } from "./proposer.ts"

/*
 * A plate's life (M10.2; domain.md §12.7): read, filed, set aside, drawn again, and the undo of filing or setting aside.
 * Filing runs the command the plate carries as the person filing, through `ProposalLinks`, with the permissions the
 * command itself checks then; the audit names the person, the proposal and the revision. The queue is brought in line
 * on the same transaction, so the row settles as the plate is filed. Filing's Undo takes the command's own Undo with
 * it: the record goes back, and the proposal is `reverted`.
 */

export const RESTORE = "proposals.restore"

interface Row {
  readonly id: string
  readonly number: string
  readonly state: ProposalState
  readonly area: string
  readonly storeId: string | null
  readonly subjectType: string
  readonly subjectId: string
  readonly queueItemId: string | null
  readonly action: string
  readonly dedupeKey: string
  readonly currentRevision: number
  readonly filedAt: Date | null
  readonly executedAt: Date | null
  readonly executionError: string | null
  readonly revision: number
  readonly heading: string
  readonly body: string
  readonly dimension: string
  readonly before: string
  readonly after: string
  readonly change: string
  readonly witness: string
  readonly confidence: string
  readonly confidenceBasis: string
  readonly fileLabel: string
  readonly why: string
  readonly evidence: string
  readonly revisedAt: Date
}

// jsonb read as text: the SQL client camelCases a jsonb value's keys, and an action's `_tag` is a key.
const SELECT = `p.id, p.number, p.state, p.area, p.store_id, p.subject_type, p.subject_id, p.queue_item_id,
  p.action::text as action, p.dedupe_key, p.current_revision, p.filed_at, p.executed_at, p.execution_error, v.revision,
  v.heading, v.body,
  v.dimension, v.before::text as before, v.after::text as after, v.change, v.witness, v.confidence, v.confidence_basis,
  v.file_label, v.why, v.evidence::text as evidence, v.created_at as revised_at`

const FROM = `proposals p join proposal_revisions v on v.proposal_id = p.id and v.revision = p.current_revision`

const decodeAction = Schema.decodeUnknownSync(ProposalAction)

/** What filing an open plate does again once it did not go. */
const RETRY = "Opnieuw proberen"

export const viewOf = (r: Row): ProposalView => {
  const confidence = Number(r.confidence)
  const failed = r.state === "execution_failed"
  return {
    id: r.id,
    number: r.number,
    state: r.state,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    queueItemId: r.queueItemId,
    action: decodeAction(JSON.parse(r.action)),
    revisions: r.currentRevision,
    plate: {
      revision: r.revision,
      heading: r.heading,
      body: failed ? `Dit ging niet: ${r.executionError ?? "onbekende fout"}. ${r.body}` : r.body,
      dimension: r.dimension,
      before: JSON.parse(r.before),
      after: JSON.parse(r.after),
      change: r.change,
      witness: r.witness,
      confidence,
      confidenceWord: wordOf(confidence),
      confidenceBasis: r.confidenceBasis,
      fileLabel: failed ? RETRY : r.fileLabel,
      why: r.why,
      evidence: JSON.parse(r.evidence),
      createdAt: r.revisedAt.getTime()
    },
    filedAt: r.filedAt?.getTime() ?? null,
    executedAt: r.executedAt?.getTime() ?? null,
    executionError: r.executionError
  }
}

/** A plate that is the operator's to decide: open, or filed and failed (it offers "Opnieuw proberen"). */
const DECIDABLE = ["open", "execution_failed"]

/** What the role may open: the record's area at Bekijken, in its stores. */
const visible = Effect.fn("Proposals.visible")(function*(sql: SqlClient.SqlClient) {
  const { role } = yield* CurrentPrincipal
  const plain = { ...role, stores: role.stores === "all" ? ("all" as const) : [...role.stores] }
  const areas = (["returns", "products", "orders", "settings", "support", "suppliers"] as ReadonlyArray<AreaId>).filter(
    (a) => canRole(plain, a, 1)
  )
  const stores = role.stores === "all" ? sql`true` : sql`(p.store_id is null or p.store_id = any(${[...role.stores]}))`
  return sql.and([sql`p.area = any(${areas})`, stores])
})

const one = Effect.fn("Proposals.one")(function*(sql: SqlClient.SqlClient, id: string, lock: boolean) {
  const scope = yield* visible(sql)
  const [row] = yield* sql<Row>`
    select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
    where p.id = ${id} and ${scope} ${lock ? sql`for update of p` : sql``}`
  if (row === undefined) return yield* new NotFound({ entity: "proposal", id })
  return row
})

/** The plates drawn for these queue rows that are still to decide, by row: what the queue shows on Start. */
export const openFor = Effect.fn("Proposals.openFor")(
  function*(sql: SqlClient.SqlClient, queueItemIds: ReadonlyArray<string>) {
    if (queueItemIds.length === 0) return new Map<string, ProposalView>()
    const rows = yield* sql<Row>`
      select ${sql.literal(SELECT)} from ${sql.literal(FROM)}
      where p.state = any(${DECIDABLE}::text[]) and p.queue_item_id = any(${[...queueItemIds]}::text[])`
    return new Map(rows.map((r) => [r.queueItemId!, viewOf(r)]))
  }
)

export const get = Effect.fn("Proposals.get")(function*(id: string) {
  const db = yield* Db
  return yield* db.scoped((sql) => Effect.map(one(sql, id, false), viewOf))
})

const actorOf = (p: { readonly kind: PrincipalKind; readonly id: string }) => ({
  kind: p.kind,
  id: p.id
})

/**
 * "Uitvoeren zoals getekend": the plate's command, run as the person, then the proposal executed (or `filed`, where what
 * it sends leaves after the undo window) and the queue brought in line. Refused as the command refuses it (`Forbidden`
 * without the permission, `ProposalStale` once the record moved on); nothing is kept of a refused filing. A plate whose
 * command did not go (`execution_failed`) is filed the same way again: "Opnieuw proberen".
 */
export const file = Effect.fn("Proposals.file")(function*(id: string) {
  const principal = yield* CurrentPrincipal
  const links = yield* ProposalLinks
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const p = yield* one(sql, id, true)
      if (!DECIDABLE.includes(p.state)) return yield* new ProposalClosed({ id, state: p.state })
      const action = decodeAction(JSON.parse(p.action))
      const ran = yield* links.run(action)
      if (ran === "stale") return yield* new ProposalStale({ id })
      // What still has to leave (a mail in line) is `filed` until the relay sends it; the rest ran on this call.
      yield* sql`update proposals set state = ${ran.pending ? "filed" : "executed"}, filed_by = ${principal.id},
                                      filed_at = now(), on_behalf_of = ${principal.id}, execution_error = null,
                                      executed_at = ${ran.pending ? null : new Date()}
                 where id = ${id}`
      yield* Audit.write(sql, principal.workspaceId, actorOf(principal), {
        action: p.state === "execution_failed" ? "proposal.retried" : "proposal.filed",
        subjectType: "proposal",
        subjectId: id,
        diff: { revision: p.currentRevision, action: action._tag, subject: `${p.subjectType}:${p.subjectId}` }
      })
      // A command that leaves the row's condition standing (the shopper told, a ticket opened) decides the row.
      if (!ran.settles && p.queueItemId !== null) yield* links.decideRow(sql, p.queueItemId)
      yield* Outbox.write(sql, principal.workspaceId, {
        type: "proposal.filed",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        proposalId: id,
        action: action._tag
      })
      yield* links.refreshQueue(sql)
      // The command's own token rides inside this one, by its hash: undoing the filing spends it on the same
      // transaction, with the same checks, and no row keeps a token that could be redeemed.
      const innerHash = ran.undo === null ? null : yield* Undo.hashOf(ran.undo.token)
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "filed", id, innerHash } satisfies typeof ProposalRestore.Type
      })
      return new ProposalChange({ proposal: viewOf(yield* one(sql, id, false)), undo })
    })
  )
})

/** Sets an open plate aside, on a transaction already open; answers its id, or `null` where none was open. */
export const discardIn = Effect.fn("Proposals.discardIn")(
  function*(sql: SqlClient.SqlClient, queueItemId: string) {
    const principal = yield* CurrentPrincipal
    const [row] = yield* sql<{ id: string }>`
      update proposals set state = 'discarded', discarded_by = ${principal.id}, discarded_at = now()
      where queue_item_id = ${queueItemId} and state = 'open' returning id`
    return row?.id ?? null
  }
)

/** The plate a queue row's "seen" set aside, open again (the row's Undo, or "reopen"); unless another is open. */
export const reopenIn = Effect.fn("Proposals.reopenIn")(function*(sql: SqlClient.SqlClient, queueItemId: string) {
  yield* sql`
    update proposals set state = 'open', discarded_by = null, discarded_at = null
    where id = (select id from proposals where queue_item_id = ${queueItemId} and state = 'discarded'
                order by discarded_at desc limit 1)
      and not exists (select 1 from proposals o where o.queue_item_id = ${queueItemId} and o.state = 'open')`
})

/** "Negeren": the plate set aside, with Undo. Nothing about the record changes. */
export const discard = Effect.fn("Proposals.discard")(function*(id: string) {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const p = yield* one(sql, id, true)
      if (p.state !== "open") return yield* new ProposalClosed({ id, state: p.state })
      yield* sql`update proposals set state = 'discarded', discarded_by = ${principal.id}, discarded_at = now()
                 where id = ${id}`
      yield* Audit.write(sql, principal.workspaceId, actorOf(principal), {
        action: "proposal.discarded",
        subjectType: "proposal",
        subjectId: id,
        diff: { revision: p.currentRevision }
      })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "discarded", id } satisfies typeof ProposalRestore.Type
      })
      return new ProposalChange({ proposal: viewOf(yield* one(sql, id, false)), undo })
    })
  )
})

/**
 * "Opnieuw tekenen": the rule drawn again from the records as they are now, as a new revision. The record does not
 * change. Where the rule no longer holds, the plate is stale (the next refresh supersedes it).
 */
export const redraw = Effect.fn("Proposals.redraw")(function*(id: string) {
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const p = yield* one(sql, id, true)
      if (p.state !== "open") return yield* new ProposalClosed({ id, state: p.state })
      const draft = yield* draftFor(sql, p.subjectType, p.subjectId, p.dedupeKey)
      if (draft === null) return yield* new ProposalStale({ id })
      const revision = p.currentRevision + 1
      yield* insertRevision(sql, id, revision, draft)
      // The command is drawn again with the words: a mail or a ticket carries what the new drawing shows.
      yield* sql`update proposals set current_revision = ${revision}, action = ${JSON.stringify(draft.action)}::jsonb
                 where id = ${id}`
      yield* Audit.write(sql, principal.workspaceId, actorOf(principal), {
        action: "proposal.redrawn",
        subjectType: "proposal",
        subjectId: id,
        diff: { revision }
      })
      return new ProposalChange({ proposal: viewOf(yield* one(sql, id, false)), undo: null })
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(ProposalRestore)

/**
 * `Shared.undo` for `proposals.restore`. A discard: the plate open again. A filing: the command's own compensation run
 * by the token it answered (`runInner`, composed where the app is), the proposal `reverted`, and the queue brought in
 * line so the row and a fresh plate come back.
 */
export const restore = Effect.fn("Proposals.restore")(function*(
  sql: SqlClient.SqlClient,
  compensation: unknown,
  deps: {
    readonly runInner: (
      command: string,
      compensation: unknown
    ) => Effect.Effect<void, Forbidden | NotFound | Conflict | SqlError.SqlError, CurrentPrincipal>
    readonly refreshQueue: (sql: SqlClient.SqlClient) => Effect.Effect<boolean, SqlError.SqlError>
    readonly reopenRow: (sql: SqlClient.SqlClient, queueItemId: string) => Effect.Effect<void, SqlError.SqlError>
  }
) {
  const principal = yield* CurrentPrincipal
  const r = yield* decodeRestore(compensation).pipe(Effect.orDie)
  if (r.kind === "discarded") {
    const back = yield* sql`
      update proposals p set state = 'open', discarded_by = null, discarded_at = null
      where p.id = ${r.id} and p.state = 'discarded'
        and not exists (select 1 from proposals o where o.dedupe_key = p.dedupe_key and o.state = 'open')
      returning id`
    if (back.length === 0) return yield* new Conflict({ entity: "proposal", reason: "gone" })
    yield* Audit.write(sql, principal.workspaceId, actorOf(principal), {
      action: "proposal.restored",
      subjectType: "proposal",
      subjectId: r.id
    })
    return
  }
  if (r.innerHash !== null) {
    const inner = yield* Undo.redeemByHash(sql, r.innerHash)
    yield* deps.runInner(inner.command, inner.compensation)
  }
  const [back] = yield* sql<{ queueItemId: string | null }>`
    update proposals set state = 'reverted' where id = ${r.id} and state in ('executed', 'filed')
    returning queue_item_id`
  if (back === undefined) return yield* new Conflict({ entity: "proposal", reason: "gone" })
  yield* Audit.write(sql, principal.workspaceId, actorOf(principal), {
    action: "proposal.reverted",
    subjectType: "proposal",
    subjectId: r.id
  })
  // A row the filing decided (its condition stood) is open again; one whose condition ended comes back on the refresh.
  if (back.queueItemId !== null) yield* deps.reopenRow(sql, back.queueItemId)
  yield* deps.refreshQueue(sql)
})

/**
 * The relay's word on a filed plate whose command sends later (the delay mail): `executed` once it went, else
 * `execution_failed` with why, which the plate shows with "Opnieuw proberen". As `system`, inside the workspace. Answers
 * the queue rows of the plates that failed, for the caller to open again.
 */
export const settleSent = Effect.fn("Proposals.settleSent")(function*(
  sql: SqlClient.SqlClient,
  subject: { readonly type: string; readonly id: string; readonly action: ProposalAction["_tag"] },
  error: string | null
) {
  const rows = yield* sql<{ queueItemId: string | null }>`
    update proposals set state = ${error === null ? "executed" : "execution_failed"}, execution_error = ${error},
                         executed_at = ${error === null ? new Date() : null}
    where state = 'filed' and subject_type = ${subject.type} and subject_id = ${subject.id}
      and action->>'_tag' = ${subject.action}
    returning queue_item_id`
  return error === null ? [] : rows.flatMap((r) => (r.queueItemId === null ? [] : [r.queueItemId]))
})

/**
 * What an agent asked first (M15 step 6): a proposal of origin `agent`, with no queue row, for a person to file. One
 * open proposal per touchpoint (`dedupeKey`): asked again while one is open, the open one answers. Answers its id.
 */
export const proposeIn = Effect.fn("Proposals.proposeIn")(function*(sql: SqlClient.SqlClient, draft: Draft) {
  const id = mintId("prp")
  const inserted = yield* sql<{ id: string }>`
    insert into proposals (id, workspace_id, store_id, origin, queue_item_id, area, subject_type, subject_id, number,
                           action, dedupe_key, expires_at)
    values (${id}, app_workspace_id(), ${draft.storeId}, 'agent', null, ${draft.area}, ${draft.subjectType},
            ${draft.subjectId}, ${draft.number}, ${JSON.stringify(draft.action)}::jsonb, ${draft.dedupeKey},
            ${draft.expiresAt})
    on conflict do nothing returning id`
  if (inserted.length === 0) {
    const [open] = yield* sql<{ id: string }>`
      select id from proposals where dedupe_key = ${draft.dedupeKey} and state = 'open'`
    return open!.id
  }
  yield* insertRevision(sql, id, 1, draft)
  return id
})
