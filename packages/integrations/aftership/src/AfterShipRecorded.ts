import { Tracking, TrackingError } from "@insyte/modules/tracking/domain/Tracking"
import { Effect, Layer } from "effect"
import { readWebhook } from "./AfterShip.ts"

/*
 * AfterShip's recorded twin (integrations.md §1.1), for the worker tests and local runs. A tracking number with `BAD` in
 * it is refused; any other is registered as `as_<number>`. Reading one: a number ending in `DLV` is delivered, `EXC`
 * stuck at the carrier, and any other still in transit, its last movement on 5 October (the recorded parcels' day). A
 * webhook signed `valid` is AfterShip's.
 */

export const AfterShipRecorded = Layer.succeed(Tracking)(Tracking.of({
  configured: true,
  register: ({ trackingNumber }) =>
    trackingNumber.includes("BAD")
      ? Effect.fail(
        new TrackingError({ reason: "AfterShip antwoordde 400: invalid tracking number", retryable: false })
      )
      : Effect.succeed({ aftershipId: `as_${trackingNumber}`, slug: "postnl" }),
  get: (aftershipId) => {
    const number = aftershipId.replace(/^as_/, "")
    const at = new Date("2026-10-05T12:00:00Z")
    if (number.endsWith("DLV")) {
      return Effect.succeed({
        status: "delivered",
        checkpoint: "Bezorgd",
        exception: null,
        estimatedDelivery: null,
        deliveredAt: at,
        lastEventAt: at
      })
    }
    if (number.endsWith("EXC")) {
      return Effect.succeed({
        status: "exception",
        checkpoint: "Adres onbekend",
        exception: "Adres onbekend",
        estimatedDelivery: null,
        deliveredAt: null,
        lastEventAt: at
      })
    }
    return Effect.succeed({
      status: "in_transit",
      checkpoint: "Gesorteerd",
      exception: null,
      estimatedDelivery: null,
      deliveredAt: null,
      lastEventAt: at
    })
  },
  verifyWebhook: (_body, signature) => Effect.succeed(signature === "valid"),
  readWebhook
}))
