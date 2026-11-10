import { KlaviyoSyncs } from "@insyte/modules/customers/domain/Ports"
import { restore as restoreCustomers } from "@insyte/modules/customers/use-cases/commands"
import { restore as restoreForwarding } from "@insyte/modules/forwarding/use-cases/commands"
import { ensureLegs } from "@insyte/modules/forwarding/use-cases/legs"
import { lastSyncOf, restore as restoreMarketing } from "@insyte/modules/marketing/use-cases/klaviyo"
import { restore as restoreOrders } from "@insyte/modules/orders/use-cases/commands"
import { refundOn } from "@insyte/modules/orders/use-cases/refund"
import { restore as restoreProducts } from "@insyte/modules/products/use-cases/commands"
import { Refunder } from "@insyte/modules/returns/domain/Ports"
import { restore as restoreReturns } from "@insyte/modules/returns/use-cases/commands"
import { MirrorFollowers } from "@insyte/modules/stores/domain/Ports"
import { StoreMirror } from "@insyte/modules/stores/Mirror"
import { restore as restoreSuppliers } from "@insyte/modules/suppliers/use-cases/commands"
import { ensureDeliveries } from "@insyte/modules/tracking/use-cases/tracking"
import { UndoCompensations } from "@insyte/modules/undo/domain/Ports"
import { Effect, Layer } from "effect"

/*
 * Where one slice's need meets another slice's use case (architecture.md: a slice never reaches into another's
 * use-cases/). Each port is the asking slice's; its implementation is here, where the app is composed:
 *
 *   stores' mirror  → forwarding's legs and tracking's deliveries, on the page's transaction (M8.2, M8.4)
 *   undo            → each reversible command's compensation, by the name its token carries (ADR-0023)
 *   returns' refund → the orders slice's refund, on the return's transaction (M9.1)
 *   a customer      → their newest Klaviyo sync (M7.5)
 */

const MirrorFollowersLive = Layer.succeed(MirrorFollowers, {
  ordersWritten: ensureLegs,
  fulfilmentsWritten: ensureDeliveries
})

const UndoCompensationsLive = Layer.succeed(UndoCompensations, {
  "orders.restore": restoreOrders,
  "products.restore": restoreProducts,
  "customers.restore": restoreCustomers,
  "marketing.restore": restoreMarketing,
  "suppliers.restore": restoreSuppliers,
  "forwarding.restore": restoreForwarding,
  "returns.restore": restoreReturns
})

const RefunderLive = Layer.succeed(Refunder, {
  refund: (sql, input) =>
    Effect.map(
      refundOn(sql, { id: input.orderId, refundId: input.refundId, amountMinor: input.amountMinor, note: input.note }),
      ({ outboxId }) => ({ outboxId })
    )
})

const KlaviyoSyncsLive = Layer.succeed(KlaviyoSyncs, { lastSyncOf })

/** Every link between slices, and the mirror other slices write through. */
export const SliceLinks = StoreMirror.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(MirrorFollowersLive, UndoCompensationsLive, RefunderLive, KlaviyoSyncsLive))
)
