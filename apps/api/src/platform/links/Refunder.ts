import { refundOn } from "@insyte/modules/orders/use-cases/refund"
import { Refunder } from "@insyte/modules/returns/domain/Ports"
import { Effect, Layer } from "effect"

/** Returns' refund → the orders slice's refund, on the return's transaction (M9.1). */
export const refunder = Refunder.of({
  refund: (sql, input) =>
    Effect.map(
      refundOn(sql, { id: input.orderId, refundId: input.refundId, amountMinor: input.amountMinor, note: input.note }),
      ({ outboxId }) => ({ outboxId })
    )
})

export const RefunderLive = Layer.succeed(Refunder, refunder)
