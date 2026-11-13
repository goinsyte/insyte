import { Db } from "@insyte/database/Db"
import { Invalid, NotFound } from "@insyte/domain/Errors"
import { mintId } from "@insyte/domain/Ids"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect, Schema } from "effect"
import type { SqlClient } from "effect/sql"
import { EMAIL } from "../../customers/domain/Commands.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import * as Undo from "../../shared/use-cases/Undo.ts"
import {
  type AssignInput,
  type CreateInput,
  type Fields,
  type SetPausedInput,
  SupplierChange,
  SuppliersRestore,
  type UpdateInput
} from "../domain/Commands.ts"
import { restorePaid } from "./statements.ts"
import { rowsOf } from "./suppliers.ts"

/*
 * The supplier commands (M8.1; api.md §2.7): making, editing, pausing and removing a supplier, and saying whose products
 * are whose. They are Insyte's own records, so each applies at once and `Shared.undo` puts back what was. Bewerken
 * (`suppliers` 2) for all of them, Beheren (3) to remove one. A paused supplier is offered no new lines (M8.2).
 */

const RESTORE = "suppliers.restore"

/** The update's fields, by column. */
const COLUMNS = {
  name: "name",
  contactEmail: "contact_email",
  contactPhone: "contact_phone",
  description: "description",
  defaultLeadDays: "default_lead_days",
  autoForward: "auto_forward",
  forwardChannel: "forward_channel",
  forwardEmail: "forward_email",
  confirmWithinHours: "confirm_within_hours",
  stockMode: "stock_mode"
} as const satisfies Record<keyof Fields, string>

type Locked =
  & { readonly id: string; readonly pausedAt: Date | null }
  & { readonly [K in keyof Fields]-?: Exclude<Fields[K], undefined> }

const lock = Effect.fn("Suppliers.lock")(function*(sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) {
  const rows = yield* sql<Locked>`
    select id, paused_at, name, contact_email, contact_phone, description, default_lead_days, auto_forward,
           forward_channel, forward_email, confirm_within_hours, stock_mode
    from suppliers where id in ${sql.in([...new Set(ids)])} and deleted_at is null order by id for update`
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.find((id) => !found.has(id))
  if (missing !== undefined) return yield* new NotFound({ entity: "supplier", id: missing })
  return rows
})

const audit = (sql: SqlClient.SqlClient, action: string, supplierId: string, diff?: Record<string, unknown>) =>
  Effect.flatMap(
    Effect.service(CurrentPrincipal),
    (p) =>
      Audit.write(sql, p.workspaceId, { kind: p.kind, id: p.id }, {
        action,
        subjectType: "supplier",
        subjectId: supplierId,
        diff
      })
  )

const change = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>, compensation: SuppliersRestore) =>
  Effect.gen(function*() {
    const undo = yield* Undo.issue(sql, { command: RESTORE, compensation })
    return new SupplierChange({ suppliers: yield* rowsOf(sql, ids), undo })
  })

/** Empty is none; anything else must read as an address. */
const contact = (email: string | undefined, phone: string | undefined) => {
  const wrong: Record<string, string> = {}
  if (email !== undefined && email.trim() !== "" && !EMAIL.test(email.trim())) wrong["contactEmail"] = "format"
  if (phone !== undefined && phone.trim() !== "" && !/^[+\d][\d\s().-]{5,}$/.test(phone.trim())) {
    wrong["contactPhone"] = "format"
  }
  return wrong
}

const nameTaken = (sql: SqlClient.SqlClient, name: string, except?: string) =>
  Effect.map(
    sql<{ id: string }>`select id from suppliers where lower(name) = ${name.toLowerCase()} and deleted_at is null
                        and id <> ${except ?? ""} limit 1`,
    (rows) => rows.length > 0
  )

/** "Nieuwe leverancier". */
export const create = Effect.fn("Suppliers.create")(function*(input: typeof CreateInput.Type) {
  yield* Policy.require("suppliers", 2)
  const name = input.name.trim()
  const wrong = { ...(name === "" ? { name: "required" } : {}), ...contact(input.contactEmail, input.contactPhone) }
  if (Object.keys(wrong).length > 0) return yield* new Invalid({ fields: wrong })
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      if (yield* nameTaken(sql, name)) return yield* new Invalid({ fields: { name: "taken" } })
      const id = mintId("sup")
      yield* sql`insert into suppliers (id, workspace_id, name, contact_email, contact_phone, description,
                                        default_lead_days, forward_email, created_by)
                 values (${id}, ${principal.workspaceId}, ${name}, ${input.contactEmail.trim() || null},
                         ${input.contactPhone.trim() || null}, ${input.description.trim()},
                         ${input.defaultLeadDays ?? 2}, ${input.contactEmail.trim() || null}, ${principal.id})`
      yield* audit(sql, "supplier.created", id)
      return yield* change(sql, [id], { kind: "created", id })
    })
  )
})

/** The supplier dialog: what is given changes, each field once, with one undo. */
export const update = Effect.fn("Suppliers.update")(function*(input: typeof UpdateInput.Type) {
  yield* Policy.require("suppliers", 2)
  const wrong = {
    ...(input.name !== undefined && input.name.trim() === "" ? { name: "required" } : {}),
    ...contact(input.contactEmail, input.contactPhone),
    ...(input.forwardEmail !== undefined && input.forwardEmail.trim() !== "" &&
        !EMAIL.test(input.forwardEmail.trim()) ?
      { forwardEmail: "format" } :
      {})
  }
  if (Object.keys(wrong).length > 0) return yield* new Invalid({ fields: wrong })
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [before] = yield* lock(sql, [input.id])
      const s = before!
      const next: Record<string, unknown> = {}
      const was: Record<string, unknown> = {}
      for (const key of Object.keys(COLUMNS) as Array<keyof Fields>) {
        const given = input[key]
        if (given === undefined) continue
        const value = typeof given === "string" ?
          (key === "name" || key === "description" ? given.trim() : given.trim() || null) :
          given
        if (value === s[key]) continue
        next[key] = value
        was[key] = s[key]
      }
      if (Object.keys(next).length === 0) {
        return new SupplierChange({ suppliers: yield* rowsOf(sql, [s.id]), undo: null })
      }
      if (typeof next["name"] === "string" && (yield* nameTaken(sql, next["name"], s.id))) {
        return yield* new Invalid({ fields: { name: "taken" } })
      }
      yield* write(sql, s.id, next)
      yield* audit(
        sql,
        "supplier.updated",
        s.id,
        Object.fromEntries(Object.keys(next).map((k) => [k, [was[k], next[k]]]))
      )
      return yield* change(sql, [s.id], { kind: "fields", id: s.id, fields: was as Fields })
    })
  )
})

const write = (sql: SqlClient.SqlClient, id: string, fields: Record<string, unknown>) =>
  Effect.forEach(
    Object.entries(fields),
    ([key, value]) =>
      sql`update suppliers set ${sql.literal(COLUMNS[key as keyof Fields])} = ${value as string}, updated_at = now()
          where id = ${id}`,
    { discard: true }
  )

/** "Nieuwe bestellingen pauzeren" or "hervatten", for many at once. */
export const setPaused = Effect.fn("Suppliers.setPaused")(function*(input: typeof SetPausedInput.Type) {
  yield* Policy.require("suppliers", 2)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const changed = (yield* lock(sql, input.ids)).filter((s) => (s.pausedAt !== null) !== input.paused)
      if (changed.length === 0) {
        return new SupplierChange({ suppliers: yield* rowsOf(sql, input.ids), undo: null })
      }
      const ids = changed.map((s) => s.id)
      yield* sql`update suppliers set paused_at = ${input.paused ? new Date() : null}, updated_at = now()
                 where id in ${sql.in(ids)}`
      for (const id of ids) yield* audit(sql, input.paused ? "supplier.paused" : "supplier.resumed", id)
      return yield* change(sql, ids, {
        kind: "paused",
        suppliers: changed.map((s) => ({ id: s.id, pausedAt: s.pausedAt?.getTime() ?? null }))
      })
    })
  )
})

/** Makes the supplier the primary one of these products, inside the role's stores. */
export const assignProducts = Effect.fn("Suppliers.assignProducts")(function*(input: typeof AssignInput.Type) {
  yield* Policy.require("suppliers", 2)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const [supplier] = yield* lock(sql, [input.supplierId])
      const ids = [...new Set(input.productIds)]
      const products = yield* sql<{ id: string; was: string | null }>`
        select p.id, (select ps.supplier_id from product_supply ps where ps.product_id = p.id and ps.is_primary) as was
        from products p where p.id in ${sql.in(ids)} and ${yield* inScope(sql, "p.store_id")} order by p.id for update`
      const found = new Set(products.map((p) => p.id))
      const missing = ids.find((id) => !found.has(id))
      if (missing !== undefined) return yield* new NotFound({ entity: "product", id: missing })
      const moving = products.filter((p) => p.was !== supplier!.id)
      if (moving.length === 0) return new SupplierChange({ suppliers: yield* rowsOf(sql, [supplier!.id]), undo: null })
      yield* setPrimary(sql, principal.workspaceId, supplier!.id, moving.map((p) => p.id), supplier!.defaultLeadDays)
      yield* audit(sql, "supplier.products_assigned", supplier!.id, { products: moving.map((p) => p.id) })
      const others = [...new Set(moving.flatMap((p) => (p.was === null ? [] : [p.was])))]
      return yield* change(sql, [supplier!.id, ...others], {
        kind: "assigned",
        supplierId: supplier!.id,
        products: moving.map((p) => ({ productId: p.id, was: p.was }))
      })
    })
  )
})

/** The supplier becomes the products' primary one; the one before stays on as a non-primary supplier. */
const setPrimary = (
  sql: SqlClient.SqlClient,
  workspaceId: string,
  supplierId: string,
  productIds: ReadonlyArray<string>,
  leadDays: number
) =>
  Effect.andThen(
    sql`update product_supply set is_primary = false where product_id in ${sql.in([...productIds])} and is_primary`,
    sql`insert into product_supply (workspace_id, product_id, supplier_id, is_primary, lead_days)
        select ${workspaceId}, p, ${supplierId}, true, ${leadDays} from unnest(${[...productIds]}::text[]) as p
        on conflict (product_id, supplier_id) do update set is_primary = true`
  )

/** Removing a supplier: their products are nobody's until assigned again; the Shopify vendor does not bring them back. */
export const remove = Effect.fn("Suppliers.remove")(function*(id: string) {
  yield* Policy.require("suppliers", 3)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* lock(sql, [id])
      const supply = yield* sql<{ productId: string; isPrimary: boolean; leadDays: number }>`
        delete from product_supply where supplier_id = ${id} returning product_id, is_primary, lead_days`
      yield* sql`update suppliers set deleted_at = now(), updated_at = now() where id = ${id}`
      yield* audit(sql, "supplier.removed", id)
      const undo = yield* Undo.issue(sql, { command: RESTORE, compensation: { kind: "removed", id, supply } })
      return new SupplierChange({ suppliers: [], undo })
    })
  )
})

const decodeRestore = Schema.decodeUnknownEffect(SuppliersRestore)

/** `Shared.undo`'s compensation for every supplier command. */
export const restore = Effect.fn("Suppliers.restore")(function*(sql: SqlClient.SqlClient, compensation: unknown) {
  const undo = yield* decodeRestore(compensation).pipe(Effect.orDie)
  yield* Policy.require("suppliers", undo.kind === "removed" || undo.kind === "statement_paid" ? 3 : 2)
  const principal = yield* CurrentPrincipal
  switch (undo.kind) {
    case "fields":
      yield* write(sql, undo.id, undo.fields)
      yield* audit(sql, "supplier.restored", undo.id)
      return
    case "created":
      yield* sql`delete from suppliers where id = ${undo.id}`
      return
    case "paused":
      for (const s of undo.suppliers) {
        yield* sql`update suppliers set paused_at = ${s.pausedAt === null ? null : new Date(s.pausedAt)}
                   where id = ${s.id}`
        yield* audit(sql, "supplier.restored", s.id)
      }
      return
    case "assigned":
      yield* sql`delete from product_supply where supplier_id = ${undo.supplierId}
                 and product_id in ${sql.in(undo.products.map((p) => p.productId))}`
      for (const p of undo.products) {
        if (p.was !== null) {
          yield* sql`update product_supply set is_primary = true where product_id = ${p.productId}
                     and supplier_id = ${p.was}`
        }
      }
      yield* audit(sql, "supplier.restored", undo.supplierId)
      return
    case "removed":
      yield* sql`update suppliers set deleted_at = null, updated_at = now() where id = ${undo.id}`
      for (const s of undo.supply) {
        yield* sql`insert into product_supply (workspace_id, product_id, supplier_id, is_primary, lead_days)
                   values (${principal.workspaceId}, ${s.productId}, ${undo.id}, ${s.isPrimary}, ${s.leadDays})
                   on conflict do nothing`
      }
      yield* audit(sql, "supplier.restored", undo.id)
      return
    case "statement_paid":
      return yield* restorePaid(sql, undo)
  }
})
