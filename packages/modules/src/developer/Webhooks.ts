import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Sealer } from "../shared/domain/Sealer.ts"
import { WebhookRuns } from "./domain/Ports.ts"
import type {
  EndpointChange,
  EndpointInput,
  EndpointWithSecret,
  RotatedSecret,
  UpdateEndpoint,
  WebhookDeliveryDetail,
  WebhookDeliveryView,
  WebhookEndpointView
} from "./domain/Webhook.ts"
import * as Deliveries from "./use-cases/deliveries.ts"
import * as Endpoints from "./use-cases/webhooks.ts"

type R = Db | CurrentPrincipal

/**
 * The developer slice's outbound webhooks (M19.4): Instellingen → Webhooks, as the request's principal. The sealer and
 * the way a delivery's run starts are ports, taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class Webhooks extends Context.Service<Webhooks, {
  readonly list: Effect.Effect<ReadonlyArray<WebhookEndpointView>, Forbidden, R>
  readonly deliveries: (endpointId: string) => Effect.Effect<ReadonlyArray<WebhookDeliveryView>, Forbidden, R>
  readonly delivery: (id: string) => Effect.Effect<WebhookDeliveryDetail, Forbidden | NotFound, R>
  readonly create: (input: EndpointInput) => Effect.Effect<EndpointWithSecret, Forbidden | Invalid | NotFound, R>
  readonly update: (input: UpdateEndpoint) => Effect.Effect<EndpointChange, Forbidden | Invalid | NotFound, R>
  readonly setActive: (id: string, active: boolean) => Effect.Effect<EndpointChange, Forbidden | NotFound, R>
  readonly remove: (id: string) => Effect.Effect<EndpointChange, Forbidden | NotFound, R>
  readonly revealSecret: (id: string) => Effect.Effect<{ readonly secret: string }, Forbidden | NotFound, R>
  readonly rotateSecret: (id: string) => Effect.Effect<RotatedSecret, Forbidden | NotFound, R>
  readonly sendTest: (
    id: string,
    event: string
  ) => Effect.Effect<{ readonly deliveryId: string }, Forbidden | Invalid | NotFound | Conflict, R>
  readonly redeliver: (
    id: string
  ) => Effect.Effect<{ readonly deliveryId: string }, Forbidden | NotFound | Conflict, R>
}>()("modules/Webhooks") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    Webhooks,
    Effect.gen(function*() {
      const sealer = yield* Sealer
      const runs = yield* WebhookRuns
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(
          Effect.provideService(Sealer, sealer),
          Effect.provideService(WebhookRuns, runs),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        ) as Effect.Effect<A, E, Exclude<Req, Sealer | WebhookRuns>>
      return {
        list: run(Endpoints.list()),
        deliveries: (endpointId) => run(Deliveries.deliveries(endpointId)),
        delivery: (id) => run(Deliveries.delivery(id)),
        create: (input) => run(Endpoints.create(input)),
        update: (input) => run(Endpoints.update(input)),
        setActive: (id, active) => run(Endpoints.setActive(id, active)),
        remove: (id) => run(Endpoints.remove(id)),
        revealSecret: (id) => run(Endpoints.revealSecret(id)),
        rotateSecret: (id) => run(Endpoints.rotateSecret(id)),
        sendTest: (id, event) => run(Deliveries.sendTest(id, event)),
        redeliver: (id) => run(Deliveries.redeliver(id))
      }
    })
  )
}
