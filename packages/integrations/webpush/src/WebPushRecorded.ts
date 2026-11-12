import { PushGone, PushRefused, WebPush } from "@insyte/modules/notifications/domain/Ports"
import { Config, Effect, Layer, Option } from "effect"

/*
 * Web push's recorded twin (integrations.md §1.1): the worker tests subscribe and send without a push service. The
 * stage's `VAPID_PUBLIC_KEY` is the key it hands out (generated per run by the test config), or none, as a stage
 * without keys. An endpoint under `/gone/` answers 410 and one under `/refuse/` 500; every other one takes the message.
 */
export const WebPushRecorded = Layer.effect(
  WebPush,
  Effect.map(Config.String("VAPID_PUBLIC_KEY").pipe(Config.option), (key) =>
    WebPush.of({
      publicKey: Option.getOrNull(key),
      send: (target) =>
        target.endpoint.includes("/gone/")
          ? Effect.fail(new PushGone({ status: 410 }))
          : target.endpoint.includes("/refuse/")
          ? Effect.fail(new PushRefused({ status: 500, reason: "push service answered 500" }))
          : Effect.void
    }))
)
