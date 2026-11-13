import { ChargebacksService } from "@insyte/modules/chargebacks/Chargebacks"
import type { ChargebackRow, ChargebackTab } from "@insyte/modules/chargebacks/domain/Chargebacks"
import { Context, Effect, Layer } from "effect"
import { notFound, scopeMissing } from "../shared/errors.ts"
import { chargebackDetailV1, chargebackPageV1 } from "./present.ts"

/* Chargebacks (M13, M19.2, M19.3), to read: the cases by deadline, up to 500, and one with its pack and timeline. */

const make = Effect.gen(function*() {
  const chargebacks = yield* ChargebacksService
  return {
    chargebacks: (query: {
      readonly tab?: ChargebackTab | undefined
      readonly provider?: ChargebackRow["provider"] | undefined
    }) =>
      chargebacks.list({
        limit: 500,
        ...(query.tab === undefined ? {} : { tab: query.tab }),
        ...(query.provider === undefined ? {} : { provider: query.provider })
      }).pipe(
        Effect.map(chargebackPageV1),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    chargeback: (id: string) =>
      chargebacks.get(id).pipe(
        Effect.map(chargebackDetailV1),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      )
  }
})

/**
 * Chargebacks, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class ChargebacksV1 extends Context.Service<ChargebacksV1, Effect.Success<typeof make>>()(
  "api-worker/ChargebacksV1"
) {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(ChargebacksService.layer))
}
