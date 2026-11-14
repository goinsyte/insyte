import { statements } from "../statements.ts"

/*
 * Two more conditions on Start's queue (M10.1's plan): an order leg that could not be forwarded to its supplier
 * (`forwarding_failed`, a `forwarding_items` row in `error`), and a chargeback the provider opened that nobody has
 * started on yet (`chargeback_opened`, a case in `open`; one waiting for its evidence stays `chargeback_deadline`).
 * Additive: the check on `queue_items.kind` only widens.
 */
export default statements(
  "alter table queue_items drop constraint queue_items_kind_check",
  `alter table queue_items add constraint queue_items_kind_check
     check (kind in ('order_delayed', 'return_review', 'quality_review', 'stock_out', 'store_disconnected',
                     'chargeback_deadline', 'connection_incident', 'forwarding_failed', 'chargeback_opened'))`
)
