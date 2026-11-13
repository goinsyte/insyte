import { ApiKeyAuth } from "@insyte/api/http/Security"
import { Effect, Layer, Redacted } from "effect"
import { KeyDoor, refusal } from "../KeyDoor.ts"

/** The key door in front of every `/v1` endpoint (M19.2): a refusal answers in the V1 envelope. */
export const ApiKeyAuthLive = Layer.effect(
  ApiKeyAuth,
  Effect.map(
    Effect.service(KeyDoor),
    (door) =>
      ApiKeyAuth.of({
        bearer: (handler, { credential }) =>
          door.enter(Redacted.value(credential), handler).pipe(
            Effect.catchTags({
              Refused: (e) => Effect.succeed(refusal(e)),
              Throttled: (e) => Effect.succeed(refusal(e))
            })
          )
      })
  )
)
