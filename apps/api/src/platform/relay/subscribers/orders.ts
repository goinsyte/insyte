import { sendCustomerMail } from "@insyte/modules/orders/use-cases/customer-mail"
import { sendDelayMail } from "@insyte/modules/orders/use-cases/delay-mail"
import { settleSent } from "@insyte/modules/proposals/Proposals"
import { refreshIn, reopenRowIn } from "@insyte/modules/queue/Queue"
import { type OutboxEvent, Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { roomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"

/**
 * The shopper's delay mail (M10.2), once the filing's undo window has passed: sent with the words the plate showed, and
 * the plate told whether it went. The provider busy, it is tried again a few times later; one that still did not go,
 * or was refused, is not tried again by itself: its row is back in front of the team, with the plate's "Opnieuw
 * proberen".
 */
const delayMail = Effect.fn("Relay.delayMail")(
  function*(event: Extract<OutboxEvent, { type: "order.delay_mail" }>, sql: SqlClient.SqlClient) {
    const sent = yield* sendDelayMail(sql, event.mailId, event)
    if (sent.outcome === "skipped") return
    // The provider busy: the plate waits on the try again, which goes onto the queue for when it is due.
    if (sent.outcome === "retry") {
      return yield* (yield* Relay).kick([sent.outboxId], { afterSeconds: sent.afterSeconds })
    }
    const failed = yield* settleSent(
      sql,
      { type: "order", id: sent.orderId, action: "NotifyDelayedOrder" },
      sent.outcome === "failed" ? sent.error : null
    )
    for (const row of failed) yield* reopenRowIn(sql, row)
    yield* refreshIn(sql)
    yield* Effect.promise(() =>
      roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: "queue_item", ids: [] })
    )
  },
  Effect.orDie
)

/**
 * The team's mail to a shopper about an order (M7 9.1), once its undo window has passed: a track-and-trace update or
 * their own words. The workspace's tabs refresh the order, so its "Track & trace verstuurd" and timeline follow; a
 * refresh that does not reach them leaves the mail sent (the event's transaction is not rolled back for it). The
 * provider busy: the try again goes onto the queue for when it is due.
 */
const customerMail = Effect.fn("Relay.customerMail")(
  function*(event: Extract<OutboxEvent, { type: "order.mail" }>, sql: SqlClient.SqlClient) {
    const sent = yield* sendCustomerMail(sql, event.mailId, event)
    if (sent.outcome === "skipped") return
    if (sent.outcome === "retry") {
      return yield* (yield* Relay).kick([sent.outboxId], { afterSeconds: sent.afterSeconds })
    }
    yield* Effect.tryPromise(() =>
      roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: "order", ids: [sent.orderId] })
    ).pipe(Effect.catchCause((cause) => Effect.logWarning("an order's tabs were not told of its mail", { cause })))
  },
  Effect.orDie
)

/** The mail sink's part for an order's mails: the delay mail a plate sends, and the team's own. */
export const OrderMails = subscriber("mail", {
  "order.delay_mail": (_id, event, sql) => delayMail(event, sql),
  "order.mail": (_id, event, sql) => customerMail(event, sql)
})
