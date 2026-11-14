import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { OutboxEvent } from "../../shared/domain/Outbox.ts"
import * as Audit from "../../shared/use-cases/Audit.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"

/*
 * What follows a supplier's portal action once its undo window has passed (M16 step 2), on the relay's transaction as
 * `system`: the brand's ticket for a reported problem, and the parcel Shopify refused put back to ship.
 */

const KIND: Record<string, string> = {
  stock: "Voorraadprobleem",
  delay: "Vertraging",
  address: "Adresprobleem",
  damaged: "Beschadigd",
  other: "Probleem"
}

/** A reported problem → a ticket in the brand's intake (source `supplier`), on the order, linked from the work. */
export const problemTicket = Effect.fn("SupplierPortal.problemTicket")(function*(
  sql: SqlClient.SqlClient,
  event: Extract<OutboxEvent, { type: "supplier.problem_reported" }>
) {
  const [work] = yield* sql<{
    status: string
    kind: string | null
    note: string | null
    newDate: string | null
    ticketId: string | null
    number: string
    storeId: string
    supplier: string
    contact: string | null
  }>`
    select w.status, w.problem_kind as kind, w.problem_note as note, to_char(w.problem_new_date, 'DD-MM-YYYY') as new_date,
           w.problem_ticket_id as ticket_id, o.number, o.store_id, s.name as supplier,
           (select c.name from supplier_contacts c where c.id = ${event.contactId}) as contact
    from supplier_work w join orders o on o.id = w.order_id join suppliers s on s.id = w.supplier_id
    where w.order_id = ${event.orderId} and w.supplier_id = ${event.supplierId}`
  // Undone in its window (the event was then cancelled), resolved since, or ticketed already: nothing to open.
  if (work === undefined || work.status !== "problem" || work.ticketId !== null) return
  const [counter] = yield* sql<{ n: string }>`
    update workspace_counters set next = next + 1 where kind = 'ticket' returning next - 1 as n`
  const [front] = yield* sql<{ p: number }>`select coalesce(min(position), 0) - 1 as p from tickets`
  const id = mintId("tkt")
  const title = `${KIND[work.kind ?? "other"] ?? "Probleem"} bij ${work.number} (${work.supplier})`.slice(0, 200)
  const description = [
    work.note ?? "",
    work.newDate === null ? "" : `Nieuwe datum: ${work.newDate}.`,
    work.contact === null ? "" : `Gemeld door ${work.contact} via het leveranciersportaal.`
  ].filter((t) => t !== "").join("\n\n")
  yield* sql`
    insert into tickets (id, workspace_id, number, title, description, status, priority, position, source, source_ref,
                         store_id, order_id, created_by)
    values (${id}, ${event.workspaceId}, ${Number(counter!.n)}, ${title}, ${description.slice(0, 20_000)}, 'intake',
            ${work.kind === "address" || work.kind === "stock" ? "high" : "medium"}, ${Number(front?.p ?? -1)},
            'supplier', ${event.contactId}, ${work.storeId}, ${event.orderId}, ${`supplier_contact:${event.contactId}`})`
  yield* sql`update supplier_work set problem_ticket_id = ${id}
             where order_id = ${event.orderId} and supplier_id = ${event.supplierId}`
  yield* Audit.write(sql, event.workspaceId, { kind: "system", id: "supplier_portal" }, {
    action: "ticket.created",
    subjectType: "ticket",
    subjectId: id,
    diff: { number: Number(counter!.n), source: "supplier", order: event.orderId }
  })
  yield* frame(sql, event, "supplier_orders")
  return { id, number: Number(counter!.n) }
})

/** The supplier's own tabs refetch (its room, `partner.changed`); the brand's hear the audit's frame. */
const frame = (
  sql: SqlClient.SqlClient,
  event: { readonly workspaceId: string; readonly supplierId: string; readonly orderId: string },
  kind: string
) =>
  Outbox.write(sql, event.workspaceId, {
    type: "partner.changed",
    workspaceId: event.workspaceId,
    supplierId: event.supplierId,
    kind,
    ids: [event.orderId]
  })

/** Shopify refused the supplier's parcel: the work is to ship again, its tracking kept for the supplier to correct. */
export const shipmentRefused = Effect.fn("SupplierPortal.shipmentRefused")(function*(
  sql: SqlClient.SqlClient,
  event: Extract<OutboxEvent, { type: "supplier.shipment_refused" }>
) {
  yield* sql`update supplier_work set status = 'to_ship', shipped_at = null, updated_at = now()
             where order_id = ${event.orderId} and supplier_id = ${event.supplierId} and status = 'shipped'`
  yield* frame(sql, event, "supplier_orders")
})
