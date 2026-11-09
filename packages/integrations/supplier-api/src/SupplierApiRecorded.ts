import { SupplierApi, SupplierApiError } from "@insyte/modules/forwarding/domain/Forwarding"
import { Effect, Layer } from "effect"

/*
 * The supplier API's recorded twin (integrations.md §1.1), for the worker tests and local runs: an endpoint on a host
 * with `refuse` in it refuses (a 4xx, final); one with `down` in it cannot be reached (worth retrying); any other takes
 * the order in 42 ms.
 */

export const SupplierApiRecorded = Layer.succeed(SupplierApi)(SupplierApi.of({
  post: (url) => {
    const host = new URL(url).host
    if (host.includes("refuse")) {
      return Effect.fail(
        new SupplierApiError({ reason: "De leverancier antwoordde 422: unknown sku", retryable: false })
      )
    }
    if (host.includes("down")) {
      return Effect.fail(new SupplierApiError({ reason: "De leverancier was niet bereikbaar", retryable: true }))
    }
    return Effect.succeed({ ms: 42 })
  }
}))
