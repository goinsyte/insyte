import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { Relay } from "../../shared/domain/Outbox.ts"
import { UNDO_SECONDS } from "../../shared/domain/Undo.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  type AddEvidenceInput,
  CaseClosed,
  CaseNumberTaken,
  ChargebackChange,
  ChargebacksRestore,
  type ChargebackStatus,
  type CreateManualInput,
  type EventKind,
  type RemoveEvidenceInput,
  type ReorderEvidenceInput,
  type SetNoteInput
} from "../domain/Chargebacks.ts"
import { MANUAL_DEADLINE_MS, reasonOf } from "../domain/Rules.ts"
import { caseScope, peekNumber, rowsOf } from "./chargebacks.ts"

/*
 * The chargeback commands (M13 step 3, the evidence half of step 4; widgets/04 §E), inside the role's stores. Opening a
 * case by hand, its note and its pack take Chargebacks · Bewerken, each with one undo token (`chargebacks.restore`);
 * accepting takes Beheren and cannot be taken back (ADR-0023): the money goes back to the customer, so the console
 * confirms with the cases listed and offers no Undo. Submitting a pack to the provider waits for a payment connection
 * (M13 step 2, `Chargebacks.submit` in 15.4).
 */

export const RESTORE = "chargebacks.restore"

interface Locked {
  readonly id: string
  readonly caseNumber: string
  readonly status: ChargebackStatus
  readonly note: string
}

const OPEN: ReadonlySet<ChargebackStatus> = new Set(["open", "awaiting_evidence"])

const lock = Effect.fn("Chargebacks.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const scope = yield* caseScope(sql)
  const rows = yield* sql<Locked>`
    select c.id, c.case_number, c.status, c.note from chargebacks c
    where c.id in ${sql.in([...new Set(ids)])} and ${scope} order by c.id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "chargeback", id: missing })
  return rows
})

/** One case, locked, that still takes evidence. */
const lockOpen = Effect.fn("Chargebacks.lockOpen")(function*(sql: SqlClient.SqlClient, id: string) {
  const [c] = yield* lock(sql, [id])
  if (!OPEN.has(c!.status)) return yield* new CaseClosed({ id, status: c!.status })
  return c!
})

const audit = (sql: SqlClient.SqlClient, action: string, id: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "chargeback",
        subjectId: id,
        diff
      })
  )

/** A line on the case's timeline, as the person; answers its id, for an undo to take it away again. */
const event = Effect.fn("Chargebacks.event")(function*(
  sql: SqlClient.SqlClient,
  chargebackId: string,
  kind: EventKind,
  data: Record<string, unknown> = {}
) {
  const p = yield* CurrentPrincipal
  const id = mintId("cbe")
  yield* sql`insert into chargeback_events (id, workspace_id, chargeback_id, actor_kind, actor_id, kind, data)
             values (${id}, ${p.workspaceId}, ${chargebackId}, ${p.kind}, ${p.id}, ${kind},
                     ${JSON.stringify(data)}::jsonb)`
  return id
})

const answer = (
  sql: SqlClient.SqlClient,
  ids: ReadonlyArray<string>,
  restore: ChargebacksRestore | null,
  outboxIds: ReadonlyArray<string> = []
) =>
  Effect.gen(function*() {
    const undo = restore === null
      ? null
      : yield* Undo.issue(sql, { command: RESTORE, compensation: restore, outboxIds })
    return new ChargebackChange({ chargebacks: yield* rowsOf(sql, ids), undo })
  })

const kick = (outboxIds: ReadonlyArray<string>) =>
  Effect.flatMap(
    Effect.service(Relay),
    (relay) => outboxIds.length === 0 ? Effect.void : relay.kick(outboxIds, { afterSeconds: UNDO_SECONDS })
  )

/** "Zaak aanmaken" (Nieuw bewijspakket): a case opened by hand, waiting for evidence, fourteen days to go. */
export const createManual = Effect.fn("Chargebacks.createManual")(function*(input: typeof CreateManualInput.Type) {
  yield* Policy.require("chargebacks", 2)
  const name = input.customer.name.trim()
  if (name === "") return yield* new Invalid({ fields: { customer: "required" } })
  if (input.amountMinor <= 0) return yield* new Invalid({ fields: { amount: "invalid" } })
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const { change, outboxIds } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      // The order or the customer it is about, inside the role's stores: the case sits in their store.
      let storeId: string | null = null
      let customerId: string | null = null
      let currency: string | null = null
      if (input.orderId !== undefined) {
        const scope = yield* inScope(sql, "o.store_id")
        const [o] = yield* sql<{ storeId: string; customerId: string | null; currency: string }>`
          select o.store_id, o.customer_id, o.currency from orders o where o.id = ${input.orderId} and ${scope}`
        if (o === undefined) return yield* new NotFound({ entity: "order", id: input.orderId })
        storeId = o.storeId
        customerId = o.customerId
        currency = o.currency
      }
      if (input.customer.id !== undefined) {
        const scope = yield* inScope(sql, "cu.store_id")
        const [cu] = yield* sql<{ storeId: string }>`
          select cu.store_id from customers cu where cu.id = ${input.customer.id} and ${scope}`
        if (cu === undefined) return yield* new NotFound({ entity: "customer", id: input.customer.id })
        storeId = storeId ?? cu.storeId
        customerId = input.customer.id
      }
      if (currency === null) {
        const [w] = yield* sql<{ currency: string }>`select currency from workspaces where id = app_workspace_id()`
        currency = (w?.currency ?? "EUR").trim()
      }

      const typed = input.caseNumber?.trim() ?? ""
      let caseNumber = typed
      if (typed === "") {
        // The next `DSP-n`, past any number the team typed that way, and the counter moved past it.
        const n = yield* peekNumber(sql)
        yield* sql`update workspace_counters set next = ${n + 1} where kind = 'chargeback'`
        caseNumber = `DSP-${n}`
      }
      const [taken] = yield* sql`select 1 from chargebacks where lower(case_number) = lower(${caseNumber})`
      if (taken !== undefined) return yield* new CaseNumberTaken({ caseNumber })

      const id = mintId("cb")
      const now = Date.now()
      yield* sql`
        insert into chargebacks (id, workspace_id, store_id, provider, case_number, order_id, customer_id,
                                 customer_name, amount_minor, currency, reason, reason_code, status, deadline_at,
                                 opened_at, note, created_manually, created_by)
        values (${id}, ${principal.workspaceId}, ${storeId}, ${input.provider}, ${caseNumber},
                ${input.orderId ?? null}, ${customerId}, ${name}, ${input.amountMinor}, ${currency},
                ${reasonOf(input.reasonCode)}, ${input.reasonCode}, 'awaiting_evidence',
                ${new Date(now + MANUAL_DEADLINE_MS)}, ${new Date(now)}, ${input.note?.trim() ?? ""}, true,
                ${principal.id})`
      yield* event(sql, id, "opened", { manual: true })
      yield* audit(sql, "chargeback.created", id, {
        caseNumber,
        provider: input.provider,
        amountMinor: input.amountMinor,
        currency,
        reason: input.reasonCode
      })
      // The team hears of it once the undo window has passed, so a case taken back tells no one.
      const told = yield* Outbox.write(sql, principal.workspaceId, {
        type: "chargeback.opened",
        workspaceId: principal.workspaceId,
        chargebackId: id,
        by: principal.id
      }, { afterSeconds: UNDO_SECONDS })
      return {
        change: yield* answer(sql, [id], { kind: "created", ids: [id] }, [told]),
        outboxIds: [told]
      }
    })
  )
  yield* kick(outboxIds)
  return change
})

/** The case's note ("Notities"), for the team only. */
export const setNote = Effect.fn("Chargebacks.setNote")(function*(input: typeof SetNoteInput.Type) {
  yield* Policy.require("chargebacks", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [c] = yield* lock(sql, [input.id])
      const note = input.note.trim()
      if (note === c!.note) return new ChargebackChange({ chargebacks: [], undo: null })
      yield* sql`update chargebacks set note = ${note} where id = ${input.id}`
      yield* audit(sql, "chargeback.note_set", input.id)
      return yield* answer(sql, [input.id], { kind: "note", id: input.id, note: c!.note })
    })
  )
})

/**
 * "Geschil accepteren" and the selection bar's "Accepteren als verloren": the cases close as lost and the money goes
 * back to the customer. Every case must still be open; one that is not fails the whole batch. Irreversible, so there
 * is no undo token. A case from a provider is conceded there once payment connections exist (M13 step 2).
 */
export const accept = Effect.fn("Chargebacks.accept")(function*(input: { readonly ids: ReadonlyArray<string> }) {
  yield* Policy.require("chargebacks", 3)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, input.ids)
      const closed = locked.find((c) => !OPEN.has(c.status))
      if (closed !== undefined) return yield* new CaseClosed({ id: closed.id, status: closed.status })
      for (const c of locked) {
        yield* sql`update chargebacks set status = 'lost', accepted_at = now(), accepted_by = ${principal.id},
                     outcome_at = now()
                   where id = ${c.id}`
        yield* event(sql, c.id, "accepted")
        yield* audit(sql, "chargeback.accepted", c.id, { from: c.status })
      }
      return yield* answer(sql, locked.map((c) => c.id), null)
    })
  )
})

/** Where the pack ends: the next item goes after it. */
const endOf = (sql: SqlClient.SqlClient, chargebackId: string) =>
  Effect.map(
    sql<{ p: number }>`select coalesce(max(position), -1) as p from evidence_items
                       where chargeback_id = ${chargebackId} and removed_at is null`,
    ([row]) => Number(row?.p ?? -1)
  )

/** Uploaded files (`PUT /api/chargebacks/:id/evidence`) into the case's pack, at its end. */
export const addEvidence = Effect.fn("Chargebacks.addEvidence")(function*(input: typeof AddEvidenceInput.Type) {
  yield* Policy.require("chargebacks", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lockOpen(sql, input.chargebackId)
      const wanted = [...new Set(input.fileIds)]
      const files = yield* sql<{ id: string; name: string; sizeBytes: string; mime: string }>`
        select f.id, f.name, f.size_bytes, f.mime from files f
        where f.id in ${sql.in(wanted)} and f.deleted_at is null and f.kind = 'evidence'
          and f.owner_type = 'chargeback' and f.owner_id = ${input.chargebackId}
          and f.scan_state <> 'rejected'`
      const byId = new Map(files.map((f) => [f.id, f]))
      const missing = wanted.find((id) => !byId.has(id))
      if (missing !== undefined) return yield* new NotFound({ entity: "file", id: missing })
      // A file already in the pack stays where it is: adding it again (a second click) changes nothing.
      const inPack = new Set(
        (yield* sql<{ fileId: string }>`
          select file_id from evidence_items
          where chargeback_id = ${input.chargebackId} and removed_at is null and file_id in ${sql.in(wanted)}`)
          .map((r) => r.fileId)
      )
      const fresh = wanted.filter((id) => !inPack.has(id))
      if (fresh.length === 0) return yield* answer(sql, [input.chargebackId], null)
      let position = yield* endOf(sql, input.chargebackId)
      const itemIds: Array<string> = []
      for (const fileId of fresh) {
        const f = byId.get(fileId)!
        const itemId = mintId("evi")
        position += 1
        yield* sql`
          insert into evidence_items (id, workspace_id, chargeback_id, kind, file_id, source, name, size_bytes,
                                      position, added_by)
          values (${itemId}, ${principal.workspaceId}, ${input.chargebackId}, 'upload', ${f.id}, 'upload', ${f.name},
                  ${Number(f.sizeBytes)}, ${position}, ${principal.id})`
        itemIds.push(itemId)
      }
      const names = fresh.map((id) => byId.get(id)!.name)
      const eventId = yield* event(sql, input.chargebackId, "evidence_added", { names, count: names.length })
      yield* audit(sql, "chargeback.evidence_added", input.chargebackId, { itemIds })
      return yield* answer(sql, [input.chargebackId], {
        kind: "added",
        chargebackId: input.chargebackId,
        itemIds,
        eventId
      })
    })
  )
})

/** "{bestand} verwijderen": out of the pack; its undo puts it back where it was. */
export const removeEvidence = Effect.fn("Chargebacks.removeEvidence")(function*(
  input: typeof RemoveEvidenceInput.Type
) {
  yield* Policy.require("chargebacks", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lockOpen(sql, input.chargebackId)
      const [item] = yield* sql<{ name: string }>`
        update evidence_items set removed_at = now()
        where id = ${input.itemId} and chargeback_id = ${input.chargebackId} and removed_at is null
        returning name`
      if (item === undefined) return yield* new NotFound({ entity: "evidence_item", id: input.itemId })
      const eventId = yield* event(sql, input.chargebackId, "evidence_removed", { name: item.name })
      yield* audit(sql, "chargeback.evidence_removed", input.chargebackId, { itemId: input.itemId })
      return yield* answer(sql, [input.chargebackId], {
        kind: "removed",
        chargebackId: input.chargebackId,
        itemId: input.itemId,
        eventId
      })
    })
  )
})

/** The pack's order, as the person dragged it: every item once. Cosmetic, so it has no undo. */
export const reorderEvidence = Effect.fn("Chargebacks.reorderEvidence")(function*(
  input: typeof ReorderEvidenceInput.Type
) {
  yield* Policy.require("chargebacks", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lockOpen(sql, input.chargebackId)
      const items = yield* sql<{ id: string }>`
        select id from evidence_items where chargeback_id = ${input.chargebackId} and removed_at is null`
      const live = new Set(items.map((i) => i.id))
      const asked = [...new Set(input.itemIds)]
      if (asked.length !== input.itemIds.length || asked.length !== live.size || asked.some((id) => !live.has(id))) {
        return yield* new Invalid({ fields: { itemIds: "every_item_once" } })
      }
      for (const [i, id] of asked.entries()) {
        yield* sql`update evidence_items set position = ${i} where id = ${id}`
      }
      yield* audit(sql, "chargeback.evidence_reordered", input.chargebackId)
      return yield* answer(sql, [input.chargebackId], null)
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(ChargebacksRestore)

/** `Shared.undo`'s compensation: a case taken away again, a note as it was, the pack as it was. */
export const restore = Effect.fn("Chargebacks.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("chargebacks", 2)
  switch (undo.kind) {
    case "created": {
      yield* sql`delete from chargebacks where id in ${sql.in([...undo.ids])}`
      for (const id of undo.ids) yield* audit(sql, "chargeback.removed", id)
      return
    }
    case "note": {
      yield* sql`update chargebacks set note = ${undo.note} where id = ${undo.id}`
      yield* audit(sql, "chargeback.restored", undo.id)
      return
    }
    case "added": {
      yield* sql`delete from evidence_items where id in ${sql.in([...undo.itemIds])}`
      yield* sql`delete from chargeback_events where id = ${undo.eventId}`
      yield* audit(sql, "chargeback.restored", undo.chargebackId)
      return
    }
    case "removed": {
      yield* sql`update evidence_items set removed_at = null where id = ${undo.itemId}`
      yield* sql`delete from chargeback_events where id = ${undo.eventId}`
      yield* audit(sql, "chargeback.restored", undo.chargebackId)
      return
    }
  }
})
