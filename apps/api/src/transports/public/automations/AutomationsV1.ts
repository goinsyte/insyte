import { AutomationsService } from "@insyte/modules/automations/Automations"
import type { AutomationStatus } from "@insyte/modules/automations/domain/Automations"
import type { RunStatus } from "@insyte/modules/automations/domain/Runs"
import { RunsService } from "@insyte/modules/automations/Runs"
import * as Idempotency from "@insyte/modules/shared/use-cases/Idempotency"
import { Context, Effect, Layer } from "effect"
import { notFound, scopeMissing, writeV1 } from "../shared/errors.ts"
import { automationDetailV1, automationPageV1, runPageV1, runV1 } from "./present.ts"

/*
 * Automations (M12, M19.2, M19.3): the flows, one flow, its runs (M12 step 5), and running its live version for an
 * order now, once per `Idempotency-Key`.
 */

const make = Effect.gen(function*() {
  const automations = yield* AutomationsService
  const runs = yield* RunsService
  return {
    automations: (status?: AutomationStatus) =>
      automations.list(status === undefined ? {} : { status }).pipe(
        Effect.map(automationPageV1),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    runs: (
      id: string,
      query: {
        readonly status?: RunStatus | undefined
        readonly limit?: number | undefined
        readonly cursor?: string | undefined
      }
    ) =>
      Effect.gen(function*() {
        yield* automations.get(id)
        const list = yield* runs.list({
          automationId: id,
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.limit === undefined ? {} : { limit: Math.min(200, Math.max(1, Math.floor(query.limit))) }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor })
        })
        return runPageV1(list)
      }).pipe(Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })),
    startRun: (id: string, body: { readonly order_id: string }, key?: string) =>
      Idempotency.once(
        key,
        ["automation.run", id, body.order_id],
        Effect.map(runs.start({ automationId: id, recordId: body.order_id }), (d) => runV1(d.run, d.steps))
      ).pipe(Effect.catch(writeV1)),
    automation: (id: string) =>
      automations.get(id).pipe(
        Effect.map(automationDetailV1),
        Effect.catchTags({ Forbidden: scopeMissing, NotFound: notFound })
      )
  }
})

/**
 * Automations, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class AutomationsV1 extends Context.Service<AutomationsV1, Effect.Success<typeof make>>()(
  "api-worker/AutomationsV1"
) {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(Layer.mergeAll(AutomationsService.layer, RunsService.layer))
  )
}
