import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import * as Audit from "../../shared/use-cases/Audit.ts"
import { BillingUnavailable } from "../domain/Billing.ts"
import { BillingProvider, type SubscriptionSnapshot } from "../domain/Ports.ts"
import { isLive, subscriptionRow } from "./state.ts"

/*
 * A workspace's deletion ends what it pays Stripe for (security.md §6: the lifecycle cancels the subscription), once the
 * waiting period is over and the purge has taken the request: during the wait the workspace works as before, and
 * "Verwijderen stoppen" leaves its billing as it was. The subscription ends at once, with no credit for the rest of the
 * period and no last invoice, and so does any other one at the customer that still bills (a second subscription Insyte
 * kept aside, or one it has not heard of yet). A Checkout page still open is closed, so no one can start a new one
 * for a workspace that is gone. Before the rows go: the subscription's id goes with them.
 *
 * Only Stripe not answering holds the purge back (the step is retried, and the daily sweep starts it again). A customer
 * Stripe no longer has bills nothing: deleting a customer cancels its subscriptions at once. Stripe refusing to end one
 * would refuse every retry too, and the erasure has a deadline: it is logged as an error and written to the audit log
 * (as a second subscription is), for a person to end in Stripe, and the purge goes on.
 */

/** How many subscriptions at the customer one deletion ends at most: Stripe answers the newest live one each time. */
const MOST = 5

export const endForDeletion = Effect.fn("Billing.endForDeletion")(function*() {
  const ws = yield* CurrentWorkspace
  const db = yield* Db
  const row = yield* db.scopedFor((sql) => subscriptionRow(sql))
  // Never at Stripe: a trial, or a stage without billing.
  if (row === undefined) return { ended: 0 }
  const p = yield* BillingProvider
  if (!p.configured) {
    // A subscription Insyte cannot reach would go on billing a workspace that is gone: the step fails, and is retried.
    if (row.stripeSubscriptionId !== null && row.status !== "canceled" && row.status !== "incomplete_expired") {
      return yield* new BillingUnavailable({ reason: "not_configured" })
    }
    return { ended: 0 }
  }
  if (row.checkoutSessionId !== null) {
    const page = yield* p.checkoutSession(row.checkoutSessionId)
    if (page?.status === "open") yield* p.expireCheckout(row.checkoutSessionId)
  }
  /** The subscriptions Stripe would not end: written down once, and not asked again. */
  const refused = new Set<string>()
  /** Ended (`true`), or refused for good and left to a person (`false`). Stripe not answering fails the step. */
  const end = (current: SubscriptionSnapshot) =>
    refused.has(current.subscriptionId) ? Effect.succeed(false) : p.cancelNow({ current }).pipe(
      Effect.as(true),
      Effect.catchIf((e) => e.reason === "no_customer", () => Effect.succeed(false)),
      Effect.catchIf((e) => e.reason === "refused", () =>
        Effect.gen(function*() {
          refused.add(current.subscriptionId)
          yield* Effect.logError("workspace deletion: Stripe refused to end a subscription", {
            workspaceId: ws.id,
            subscription: current.subscriptionId,
            status: current.status
          })
          yield* db.scopedFor((sql) =>
            Audit.write(sql, ws.id, { kind: "system", id: "stripe" }, {
              action: "billing.end_refused",
              subjectType: "billing",
              subjectId: ws.id,
              diff: { subscription: current.subscriptionId, status: current.status }
            })
          )
          return false
        }))
    )
  let ended = 0
  for (const id of [row.stripeSubscriptionId, row.secondSubscriptionId]) {
    if (id === null) continue
    const current = yield* p.subscription(id)
    if (!isLive(current)) continue
    if (yield* end(current)) ended++
  }
  for (let i = 0; i < MOST; i++) {
    // No such customer at Stripe: nothing there bills.
    const other = yield* p.activeSubscription(row.stripeCustomerId).pipe(
      Effect.catchIf((e) => e.reason === "no_customer", () => Effect.succeed(undefined))
    )
    if (other === undefined) break
    // One Stripe will not end is answered again by the next read: left as it is.
    if (!(yield* end(other))) break
    ended++
  }
  yield* Effect.logInfo("workspace deletion: billing ended", { workspaceId: ws.id, ended })
  return { ended }
})
