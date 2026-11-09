import { Db } from "@insyte/database/Db"
import { Conflict, Invalid, NotFound } from "@insyte/domain/Errors"
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
  type CreateInput,
  CustomerChange,
  CustomersRestore,
  EMAIL,
  type MergeInput,
  type TagInput
} from "../domain/Commands.ts"
import { findDuplicates } from "../domain/Duplicates.ts"
import { type Row, SELECT, toRow } from "./customers.ts"

/*
 * The customer commands (M7.4; api.md §2.6), at `customers` Bewerken (merging also takes `customers.merge`), inside
 * the role's stores. Tags and a new customer change Insyte at once and reach Shopify once the undo window has passed;
 * a merge is Insyte's: the absorbed profiles leave the lists, their orders move to the survivor (and stay there as
 * Shopify updates them), and the survivor counts them. Each has one undo token (`customers.restore`).
 */

const RESTORE = "customers.restore"

const audit = (sql: SqlClient.SqlClient, action: string, customerId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "customer",
        subjectId: customerId,
        diff
      })
  )

interface Locked {
  readonly id: string
  readonly tags: ReadonlyArray<string>
  readonly name: string
  readonly mergedInto: string | null
  readonly absorbs: number
}

/** The customers, locked, listed and inside the role's stores; any one missing is `NotFound`. */
const lock = Effect.fn("Customers.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const scope = yield* inScope(sql, "c.store_id")
  const rows = yield* sql<Locked>`
    select c.id, c.tags, c.name, c.merged_into,
           (select count(*) from customers m where m.merged_into = c.id)::int as absorbs
    from customers c
    where c.id in ${sql.in([...new Set(ids)])} and c.deleted_at is null and ${scope} order by c.id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "customer", id: missing })
  return rows
})

const rowsOf = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  Effect.map(
    sql<Row>`select ${sql.literal(SELECT)} from customers c where c.id in ${sql.in([...ids])} order by lower(c.name)`,
    (rows) => rows.map(toRow)
  )

/** A tag as it is stored: lower case, words joined by hyphens, as the console writes it. */
const normaliseTag = (raw: string) => raw.trim().toLowerCase().replace(/\s+/g, "-")

/** Adds and takes off tags; customers where nothing changes are left out of the change. */
export const tag = Effect.fn("Customers.tag")(function*(input: typeof TagInput.Type) {
  yield* Policy.require("customers", 2)
  const add = [...new Set(input.add.map(normaliseTag).filter((t) => t !== ""))]
  const remove = [...new Set(input.remove)]
  if (add.length === 0 && remove.length === 0) return yield* new Invalid({ fields: { tags: "empty" } })
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const changed = (yield* lock(sql, input.ids)).flatMap((c) => {
        const tags = [...c.tags.filter((t) => !remove.includes(t)), ...add.filter((t) => !c.tags.includes(t))]
        return tags.length === c.tags.length && tags.every((t) => c.tags.includes(t)) ? [] : [{ before: c, tags }]
      })
      if (changed.length === 0) return { change: new CustomerChange({ customers: [], undo: null }), outboxId: null }
      for (const { before, tags } of changed) {
        yield* sql`update customers set tags = ${tags}::text[] where id = ${before.id}`
        yield* audit(sql, "customer.tagged", before.id, { tags: [before.tags, tags] })
      }
      const p = yield* CurrentPrincipal
      const ids = changed.map((c) => c.before.id)
      const outboxId = yield* Outbox.write(sql, p.workspaceId, {
        type: "customer.updated",
        workspaceId: p.workspaceId,
        userId: p.userId ?? p.id,
        customerIds: ids,
        add,
        remove
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "tags", customers: changed.map((c) => ({ id: c.before.id, tags: [...c.before.tags] })) },
        outboxIds: [outboxId]
      })
      return { change: new CustomerChange({ customers: yield* rowsOf(sql, ids), undo }), outboxId }
    })
  )
  if (sent !== null) yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/** "Nieuwe klant": in Insyte at once, in Shopify once the window has passed. */
export const create = Effect.fn("Customers.create")(function*(input: typeof CreateInput.Type) {
  yield* Policy.require("customers", 2)
  const email = input.email.trim()
  const phone = input.phone.trim()
  const wrong: Record<string, string> = {}
  if (email !== "" && !EMAIL.test(email)) wrong["email"] = "format"
  if (email === "" && phone === "") wrong["email"] = "required"
  if (input.country !== "" && !/^[a-z]{2}$/i.test(input.country)) wrong["country"] = "format"
  if (Object.keys(wrong).length > 0) return yield* new Invalid({ fields: wrong })
  const principal = yield* CurrentPrincipal
  const relay = yield* Relay
  const db = yield* Db
  const { change, outboxId: sent } = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "s.id", input.storeId)
      const [store] = yield* sql<{ id: string; currency: string | null }>`
        select s.id, s.currency from stores s where ${scope} and s.status in ('connected', 'connecting')
        order by s.id limit 1`
      if (store === undefined) return yield* new Conflict({ entity: "store", reason: "no_store" })
      if (email !== "") {
        const [taken] = yield* sql<{ id: string }>`
          select id from customers where store_id = ${store.id} and lower(email) = ${email.toLowerCase()}
            and deleted_at is null and merged_into is null limit 1`
        if (taken !== undefined) return yield* new Invalid({ fields: { email: "taken" } })
      }
      const id = mintId("cus")
      const country = input.country.toUpperCase() || null
      const tags = [...new Set(input.tags.map(normaliseTag).filter((t) => t !== ""))]
      yield* sql`insert into customers (id, workspace_id, store_id, shopify_id, email, name, phone, address, country, tags,
                                        currency, external_updated_at)
                 values (${id}, ${principal.workspaceId}, ${store.id}, ${`insyte-${id}`}, ${email || null},
                         ${input.name.trim()}, ${phone || null},
                         ${country === null ? null : JSON.stringify({ country })}::jsonb, ${country}, ${tags}::text[],
                         ${store.currency}, now())`
      yield* audit(sql, "customer.created", id)
      const outboxId = yield* Outbox.write(sql, principal.workspaceId, {
        type: "customer.created",
        workspaceId: principal.workspaceId,
        userId: principal.userId ?? principal.id,
        customerIds: [id]
      }, { afterSeconds: UNDO_SECONDS })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "created", id },
        outboxIds: [outboxId]
      })
      return { change: new CustomerChange({ customers: yield* rowsOf(sql, [id]), undo }), outboxId }
    })
  )
  yield* relay.kick([sent], { afterSeconds: UNDO_SECONDS })
  return change
})

/**
 * Merges profiles into one, in Insyte: the others leave the lists, their orders move to the survivor. A profile
 * already merged, or one others were merged into, is merged first or not at all (`Conflict`).
 */
export const merge = Effect.fn("Customers.merge")(function*(input: typeof MergeInput.Type) {
  yield* Policy.require("customers", 2)
  yield* Policy.requireAction("customers.merge")
  const others = [...new Set(input.ids)].filter((id) => id !== input.survivorId)
  if (others.length === 0) return yield* new Invalid({ fields: { ids: "same" } })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const locked = yield* lock(sql, [input.survivorId, ...others])
      if (locked.some((c) => c.mergedInto !== null)) {
        return yield* new Conflict({ entity: "customer", reason: "merged" })
      }
      if (locked.some((c) => others.includes(c.id) && c.absorbs > 0)) {
        return yield* new Conflict({ entity: "customer", reason: "absorbs" })
      }
      const absorbed = []
      for (const id of others) {
        const moved = yield* sql<{ id: string }>`
          update orders set customer_id = ${input.survivorId} where customer_id = ${id} returning id`
        yield* sql`update customers set merged_into = ${input.survivorId}, merged_at = now() where id = ${id}`
        absorbed.push({ id, orderIds: moved.map((o) => o.id) })
        yield* audit(sql, "customer.merged_away", id, { into: input.survivorId, orders: moved.length })
      }
      yield* audit(sql, "customer.merged", input.survivorId, { absorbed: others })
      const undo = yield* Undo.issue(sql, {
        command: RESTORE,
        compensation: { kind: "merged", survivorId: input.survivorId, absorbed }
      })
      return new CustomerChange({ customers: yield* rowsOf(sql, [input.survivorId]), undo })
    })
  )
})

/** The profiles that look like the same person, in the role's stores, less those said to be different people. */
export const duplicates = Effect.fn("Customers.duplicates")(function*() {
  yield* Policy.require("customers", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "c.store_id")
      const candidates = yield* sql<{ id: string; name: string; email: string | null; country: string | null }>`
        select c.id, c.name, c.email, c.country from customers c
        where c.deleted_at is null and c.merged_into is null and ${scope} order by c.id limit 20000`
      const dismissed = yield* sql<{ key: string }>`select key from customer_not_duplicates`
      return findDuplicates(candidates, new Set(dismissed.map((d) => d.key)))
    })
  )
})

/** "Niet dezelfde persoon": the group is not asked about again. */
export const markNotDuplicate = Effect.fn("Customers.markNotDuplicate")(function*(key: string) {
  yield* Policy.require("customers", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  yield* db.scoped((sql) =>
    sql`insert into customer_not_duplicates (workspace_id, key, decided_by)
        values (${principal.workspaceId}, ${key}, ${principal.id}) on conflict do nothing`
  )
})

const decodeRestore = Schema.decodeUnknownEffect(CustomersRestore)

/** `Shared.undo` of a customer command, before Shopify heard of it. */
export const restore = Effect.fn("Customers.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  yield* Policy.require("customers", 2)
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  switch (undo.kind) {
    case "tags":
      for (const c of undo.customers) {
        yield* sql`update customers set tags = ${[...c.tags]}::text[] where id = ${c.id}`
        yield* audit(sql, "customer.restored", c.id)
      }
      return
    case "created":
      // Made a moment ago and not yet in Shopify: no order can name it.
      yield* sql`delete from customers where id = ${undo.id} and shopify_id = ${`insyte-${undo.id}`}`
      return
    case "merged":
      for (const a of undo.absorbed) {
        yield* sql`update customers set merged_into = null, merged_at = null
                   where id = ${a.id} and merged_into = ${undo.survivorId}`
        if (a.orderIds.length > 0) {
          yield* sql`update orders set customer_id = ${a.id}
                     where id in ${sql.in([...a.orderIds])} and customer_id = ${undo.survivorId}`
        }
        yield* audit(sql, "customer.unmerged", a.id, { from: undo.survivorId })
      }
      return
  }
})
