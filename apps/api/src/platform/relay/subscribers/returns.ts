import { ReturnLabels } from "@insyte/modules/returns/domain/Ports"
import { shopperMail } from "@insyte/modules/returns/use-cases/mails"
import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { onEach, subscriber } from "../Subscriber.ts"

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

/**
 * The shopper's mails about their returns (M9.3), once a team's change has waited out its undo window: each return's,
 * once per kind. A mail that does not go fails the delivery, so the queue tries again.
 */
const returnMails = (event: ReturnMailEvent, sql: SqlClient.SqlClient) =>
  Effect.forEach(
    event.returnIds,
    (id) => shopperMail(sql, id, RETURN_MAIL[event.type], event.type === "return.started" ? "team" : "portal"),
    { discard: true }
  ).pipe(Effect.orDie)

/** The mail sink's part for the shopper's returns. */
export const ReturnMails = subscriber(
  "mail",
  onEach(Object.keys(RETURN_MAIL) as Array<keyof typeof RETURN_MAIL>, (_id, event, sql) => returnMails(event, sql))
)

export const ReturnLabelRequests = subscriber("returns", {
  // Return labels asked for (M9.2): one Workflow per event, named by it.
  "return.label_requested": (id, event) =>
    Effect.flatMap(
      Effect.service(ReturnLabels),
      (labels) => labels.start({ key: `rl-${id}`, workspaceId: event.workspaceId, returnIds: event.returnIds })
    )
})
