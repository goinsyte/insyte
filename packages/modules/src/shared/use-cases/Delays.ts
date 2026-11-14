import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Audit from "./Audit.ts"
import * as Outbox from "./Outbox.ts"

/*
 * An order delayed by what Insyte sees (M8.4, M8.3): its parcel stuck, or its supplier past the hand-off it promised.
 * The tracking sweep and the hourly supplier check both mark it here, once per order: `orders.delayed_at` and the
 * outbox `order.delayed`, whose notifications sink tells whoever handles orders in the order's store and whose
 * automations trigger runs (M12). An operator's "Vertraging wissen" (`Orders.clearDelay`) is kept in the audit log; a
 * detector honours it until something new happens (the parcel moves again, the supplier names a later date).
 */

/** The audit action `Orders.clearDelay` writes, which the detectors read back. */
export const DELAY_CLEARED = "order.delay_cleared"

/**
 * A fragment that holds while the operator has not cleared the order's delay after `since` (both SQL expressions: the
 * order's id and a timestamp). On the audit index (`audit_subject`), inside the transaction's workspace.
 */
export const notClearedAfter = (sql: SqlClient.SqlClient, orderId: string, since: string) =>
  sql`not exists (select 1 from audit_events a
        where a.workspace_id = app_workspace_id() and a.subject_type = 'order'
          and a.subject_id = ${sql.literal(orderId)} and a.action = ${DELAY_CLEARED}
          and a.at > ${sql.literal(since)})`

/** The workspace's "Late bestelling" threshold in hours (Instellingen · Meldingen, `alerts.delay_hours`). */
export const delayHours = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ hours: number }>`select coalesce((alerts->>'delay_hours')::int, 48) as hours from workspaces
                           where id = app_workspace_id()`,
    (rows) => rows[0]?.hours ?? 48
  )

export interface Detected {
  readonly orderId: string
  readonly reason: "exception" | "no_movement" | "supplier_late"
  readonly note: string | null
  readonly hours?: number | undefined
  readonly supplier?: string | undefined
}

/**
 * Marks the order delayed if it is open and not yet, as `system`, and writes `order.delayed`; answers the outbox id to
 * kick, or undefined when nothing changed.
 */
export const markDelayed = Effect.fn("Delays.mark")(function*(sql: SqlClient.SqlClient, d: Detected) {
  const [marked] = yield* sql<{ workspaceId: string }>`
    update orders set delayed_at = now() where id = ${d.orderId} and delayed_at is null
      and status not in ('delivered', 'cancelled', 'refunded')
    returning workspace_id`
  if (marked === undefined) return undefined
  yield* Audit.write(sql, marked.workspaceId, { kind: "system", id: "insyte" }, {
    action: "order.delayed",
    subjectType: "order",
    subjectId: d.orderId,
    diff: { reason: d.reason, ...(d.supplier === undefined ? {} : { supplier: d.supplier }) }
  })
  return yield* Outbox.write(sql, marked.workspaceId, {
    type: "order.delayed",
    workspaceId: marked.workspaceId,
    userId: "system",
    orderIds: [d.orderId],
    reason: d.reason,
    note: d.note,
    ...(d.hours === undefined ? {} : { hours: d.hours }),
    ...(d.supplier === undefined ? {} : { supplier: d.supplier })
  })
})
