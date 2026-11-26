import { ReturnLabels } from "@insyte/modules/returns/domain/Ports"
import { shopperMail, type ShopperMailOutcome } from "@insyte/modules/returns/use-cases/mails"
import { type OutboxEvent, Relay } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { roomOf } from "../../Room.ts"
import { onEach, subscriber } from "../Subscriber.ts"
import { told } from "../told.ts"

/** Which shopper mail each return event sends (M9.3). */
const RETURN_MAIL = {
  "return.requested": "received",
  "return.started": "received",
  "return.approved": "approved",
  "return.rejected": "rejected",
  "return.label_issued": "label",
  "return.resolved": "resolved"
} as const

type ReturnMailEvent = Extract<OutboxEvent, { type: keyof typeof RETURN_MAIL }>

/** A mail handed to a `return.mail` of its own goes onto the queue for when it is due. */
const kickRetry = (sent: ShopperMailOutcome) =>
  sent.outcome === "retry"
    ? Effect.flatMap(Effect.service(Relay), (relay) => relay.kick([sent.outboxId], { afterSeconds: sent.afterSeconds }))
    : Effect.void

/**
 * The shopper's mails about their returns (M9.3), once a team's change has waited out its undo window: each return's,
 * once per kind. A mail the provider refused for its recipient, or that cannot be made, is in the return's history;
 * one the provider could not take just then is tried again on a `return.mail` of its own. Neither fails the event, so
 * its other sinks (Shopify) commit whatever the mail does.
 */
const returnMails = (event: ReturnMailEvent, sql: SqlClient.SqlClient) =>
  Effect.forEach(
    event.returnIds,
    (id) =>
      Effect.flatMap(
        shopperMail(sql, id, RETURN_MAIL[event.type], event.type === "return.started" ? "team" : "portal"),
        kickRetry
      ),
    { discard: true }
  ).pipe(Effect.orDie)

/**
 * A return's mail tried again: one that still does not go is tried again later, until its last try, after which the
 * return's history says it did not go. Either way the return's open tabs hear of its history.
 */
const returnMailAgain = Effect.fn("Relay.returnMailAgain")(
  function*(event: Extract<OutboxEvent, { type: "return.mail" }>, sql: SqlClient.SqlClient) {
    const sent = yield* shopperMail(sql, event.returnId, event.mail, event.via, {
      attempt: event.attempt ?? 2,
      from: event.from
    })
    yield* kickRetry(sent)
    if (sent.outcome !== "sent" && sent.outcome !== "not_sent") return
    yield* told(
      "Relay.returns.told",
      () =>
        roomOf(event.workspaceId).broadcast({ v: 1, type: "records.changed", kind: "return", ids: [event.returnId] })
    )
  },
  Effect.orDie
)

/** The mail sink's part for the shopper's returns. */
export const ReturnMails = subscriber("mail", {
  ...onEach(Object.keys(RETURN_MAIL) as Array<keyof typeof RETURN_MAIL>, (_id, event, sql) => returnMails(event, sql)),
  "return.mail": (_id, event, sql) => returnMailAgain(event, sql)
})

export const ReturnLabelRequests = subscriber("returns", {
  // Return labels asked for (M9.2): one Workflow per event, named by it.
  "return.label_requested": (id, event) =>
    Effect.flatMap(
      Effect.service(ReturnLabels),
      (labels) => labels.start({ key: `rl-${id}`, workspaceId: event.workspaceId, returnIds: event.returnIds })
    )
})
