import { Conflict } from "@insyte/domain/Errors"
import { ForwardingService } from "@insyte/modules/forwarding/Forwarding"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { SuppliersService } from "@insyte/modules/suppliers/Suppliers"
import { Context, Effect, Layer } from "effect"
import { notFound, scopeMissing, writeV1 } from "../shared/errors.ts"
import { legPageV1, legV1, statementsV1, suppliersV1 } from "./present.ts"

/*
 * Forwarding (M8.2, M19.2, M19.3): the suppliers and their statements (M13 step 6), the queue of legs, and forwarding
 * and rerouting them, each once per `Idempotency-Key`.
 */

const make = Effect.gen(function*() {
  const forwarding = yield* ForwardingService
  const suppliers = yield* SuppliersService
  return {
    suppliers: suppliers.list({}).pipe(
      Effect.map(suppliersV1),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    supplierStatements: (id: string) =>
      suppliers.statements({ supplierId: id }).pipe(
        Effect.map(statementsV1),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      ),
    legs: (view?: "to_forward" | "awaiting" | "forward_error") =>
      forwarding.list(view).pipe(
        Effect.map(legPageV1),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    forwardLegs: (
      body: {
        readonly leg_ids: ReadonlyArray<string>
        readonly note?: string | undefined
        readonly via?: Readonly<Record<string, "portal" | "email" | "api">> | undefined
      },
      key?: string
    ) =>
      Idempotency.once(
        key,
        ["forward", body],
        Effect.map(
          forwarding.forward({
            ids: [...body.leg_ids],
            ...(body.note === undefined ? {} : { note: body.note }),
            ...(body.via === undefined ? {} : { via: { ...body.via } })
          }),
          (change) => ({ data: change.legs.map(legV1) })
        )
      ).pipe(Effect.catch(writeV1)),
    rerouteLeg: (id: string, body: { readonly supplier_id: string }, key?: string) =>
      Idempotency.once(
        key,
        ["reroute", id, body],
        Effect.flatMap(forwarding.reroute({ id, toSupplierId: body.supplier_id }), (change) =>
          change.legs[0] === undefined
            ? Effect.fail(new Conflict({ entity: "forwarding_item", reason: "same_supplier" }))
            : Effect.succeed(legV1(change.legs[0])))
      ).pipe(Effect.catch(writeV1))
  }
})

/**
 * Forwarding, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class ForwardingV1 extends Context.Service<ForwardingV1, Effect.Success<typeof make>>()(
  "api-worker/ForwardingV1"
) {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(Layer.mergeAll(ForwardingService.layer, SuppliersService.layer))
  )
}
