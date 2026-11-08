import { LOCAL_SECRET } from "@insyte/integrations-better-auth/BetterAuth"
import { KeyHasher } from "@insyte/modules/developer/domain/Ports"
import { Config, Effect, Layer, Redacted } from "effect"

/*
 * The API keys' hash (M19.1) over the auth secret: an HMAC under a key derived for API keys alone, so it never equals
 * anything better-auth signs or an invitation link carries. Rotating the auth secret invalidates every key, which is
 * what such a rotation is for. (The plan named a separate `TOKEN_PEPPER`; one derived key does the same with one
 * secret fewer to set.)
 */

const encoder = new TextEncoder()
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

export const KeyHasherLive = Layer.effect(
  KeyHasher,
  Effect.gen(function*() {
    const local = (yield* Config.String("ENVIRONMENT")) === "local"
    const secret = yield* Config.Redacted("BETTER_AUTH_SECRET").pipe(
      local ? Config.withDefault(LOCAL_SECRET) : (config) => config
    )
    const key = yield* Effect.promise(async () => {
      const root = await crypto.subtle.importKey(
        "raw",
        encoder.encode(Redacted.value(secret)),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      )
      const derived = await crypto.subtle.sign("HMAC", root, encoder.encode("insyte/api-keys/v1"))
      return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    })
    return KeyHasher.of({
      hash: (value) => Effect.promise(async () => hex(await crypto.subtle.sign("HMAC", key, encoder.encode(value))))
    })
  })
)
