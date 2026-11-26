import { Db } from "@insyte/database/Db"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { BillingUnavailable } from "../domain/Billing.ts"
import { BillingProvider } from "../domain/Ports.ts"
import { isLive, subscriptionRow } from "./state.ts"

/*
 * A workspace's deletion ends what it pays Stripe for (security.md §6: the lifecycle cancels the subscription), once the
 * waiting period is over and the purge has taken the request: during the wait the workspace works as before, and
 * "Verwijderen stoppen" leaves its billing as it was. The subscription ends at once, with no credit for the rest of the
 * period and no last invoice, and so does any other one at the customer that still bills (a second subscription Insyte
 * kept aside, or one it has not heard of yet). A Checkout page still open is closed, so no one can start a new one
 * for a workspace that is gone. Before the rows go: the subscription's id goes with them.
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
  let ended = 0
  for (const id of [row.stripeSubscriptionId, row.secondSubscriptionId]) {
    if (id === null) continue
    const current = yield* p.subscription(id)
    if (!isLive(current)) continue
    yield* p.cancelNow({ current })
    ended++
  }
  for (let i = 0; i < MOST; i++) {
    const other = yield* p.activeSubscription(row.stripeCustomerId)
    if (other === undefined) break
    yield* p.cancelNow({ current: other })
    ended++
  }
  yield* Effect.logInfo("workspace deletion: billing ended", { workspaceId: ws.id, ended })
  return { ended }
})
