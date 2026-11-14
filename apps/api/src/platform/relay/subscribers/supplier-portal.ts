import { problemTicket, shipmentRefused } from "@insyte/modules/supplier-portal/use-cases/relay"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

/**
 * The supplier portal's sink (M16 step 2), ahead of the notifications sink on the same transaction, so the note names
 * the ticket it opened: a reported problem opens the brand's ticket; a parcel Shopify refused is to ship again.
 */
export const SupplierPortal = subscriber("supplier_portal", {
  "supplier.problem_reported": (_id, event, sql) => problemTicket(sql, event).pipe(Effect.asVoid, Effect.orDie),
  "supplier.shipment_refused": (_id, event, sql) => shipmentRefused(sql, event).pipe(Effect.orDie)
})
