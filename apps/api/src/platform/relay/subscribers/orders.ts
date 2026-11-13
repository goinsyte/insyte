import { sendDelayMail } from "@insyte/modules/orders/use-cases/delay-mail"
import { settleSent } from "@insyte/modules/proposals/Proposals"
import { refreshIn, reopenRowIn } from "@insyte/modules/queue/Queue"
import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { roomOf } from "../../Room.ts"
import { subscriber } from "../Subscriber.ts"

/**
 * The shopper's delay mail (M10.2), once the filing's undo window has passed: sent with the words the plate showed, and
 * the plate told whether it went. One that did not go is not tried again by itself: its row is back in front of the
 * team, with the plate's "Opnieuw proberen".
 */
const delayMail = Effect.fn("Relay.delayMail")(
  function*(event: Extract<OutboxEvent, { type: "order.delay_mail" }>, sql: SqlClient.SqlClient) {
    const sent = yield* sendDelayMail(sql, event.mailId)
    if (sent.outcome === "skipped") return
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

/** The mail sink's part for an order's delay mail. */
export const DelayMail = subscriber("mail", { "order.delay_mail": (_id, event, sql) => delayMail(event, sql) })
