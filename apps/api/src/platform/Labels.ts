import { LabelsUnset, SendcloudLive } from "@insyte/integrations-sendcloud/Sendcloud"
import { SendcloudRecorded } from "@insyte/integrations-sendcloud/SendcloudRecorded"
import { type Labels, ReturnLabels } from "@insyte/modules/returns/domain/Ports"
import { env } from "cloudflare:workers"
import { Config, Effect, Layer, Option } from "effect"
import type { HttpClient } from "effect/http"

/*
 * Return labels (M9.2): Sendcloud's recorded twin where the stage says `LABELS_ADAPTER=recorded` (the worker tests and
 * local runs); Sendcloud where the stage has its keys; and where it has none, no labels (`LabelsUnset`), so "Label
 * versturen" says no carrier is set up. And starting a request's labels: a `ReturnLabelWorkflow` instance named by the
 * outbox event, so a relay that delivers it twice makes each label once.
 */
export const LabelsChoice = Layer.unwrap(
  Effect.gen(function*() {
    const adapter = yield* Config.String("LABELS_ADAPTER").pipe(Config.withDefault("sendcloud"))
    const key = yield* Config.Redacted("SENDCLOUD_PUBLIC_KEY").pipe(Config.option)
    return (adapter === "recorded"
      ? SendcloudRecorded
      : Option.isSome(key)
      ? SendcloudLive
      : LabelsUnset) as Layer.Layer<Labels, Config.ConfigError, HttpClient.HttpClient>
  })
)

export const ReturnLabelsLive = Layer.succeed(ReturnLabels)(ReturnLabels.of({
  start: Effect.fn("ReturnLabels.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.RETURN_LABEL.create({
        id: input.key,
        params: { workspaceId: input.workspaceId, returnIds: [...input.returnIds] }
      })
    ).pipe(
      // Already started under this name: that instance is the request.
      Effect.catch(() => Effect.flatMap(Effect.tryPromise(() => env.RETURN_LABEL.get(input.key)), () => Effect.void)),
      Effect.orDie
    )
  })
}))
