import { withAffiliates } from "@insyte/modules/affiliates/lazy"
import { Effect } from "effect"
import { onEach, subscriber } from "../Subscriber.ts"

/**
 * The affiliate programme's sink (M16 steps 4–5), on the relay's transaction: an order Shopify told of becomes a
 * conversion where it carries an affiliate's code or link; one fulfilled or cancelled is followed in its return
 * window; a decision and a payout reach the affiliate's portal once their undo window has passed. The slice loads
 * with the first such event, not with the Worker; a workspace without a programme reads one row and is done.
 */
export const Affiliates = subscriber("affiliates", {
  "order.placed": (_id, event, sql) => withAffiliates((m) => m.Relay.ordersPlaced(sql, event)).pipe(Effect.orDie),
  ...onEach(
    ["order.fulfilled", "order.cancelled"],
    (_id, event, sql) => withAffiliates((m) => m.Relay.ordersChanged(sql, event)).pipe(Effect.orDie)
  ),
  "affiliate.decided": (_id, event, sql) => withAffiliates((m) => m.Relay.decided(sql, event)).pipe(Effect.orDie),
  "affiliate.payout": (_id, event, sql) => withAffiliates((m) => m.Relay.payout(sql, event)).pipe(Effect.orDie)
})
