import { LOCAL_SECRET } from "@insyte/integrations-better-auth/BetterAuth"
import { SealBroken, Sealer } from "@insyte/modules/shared/domain/Sealer"
import { Config, Effect, Layer, Option, Redacted } from "effect"

/*
 * The sealer (integrations.md §1.2): AES-256-GCM under a keyring, `v1.<kid>.<iv>.<ciphertext+tag>`, base64url. The
 * keys are `SEAL_KEYS`, comma-separated base64 of 32 bytes each, newest first: new seals use the first, and any key
 * still in the ring opens what it sealed. A key's id is the start of its SHA-256, never the key. Locally and on
 * previews, without `SEAL_KEYS`, one key is derived from the auth secret; staging and production refuse to seal
 * without it.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
const fromB64url = (text: string) =>
  Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))
const fromB64 = (text: string) => Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0))
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

interface RingKey {
  readonly kid: string
  readonly key: CryptoKey
}

const ringKey = async (raw: Uint8Array): Promise<RingKey> => ({
  kid: hex(await crypto.subtle.digest("SHA-256", raw)).slice(0, 8),
  key: await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
})

/** The auth secret's derived key, for a stage without `SEAL_KEYS` that may seal without one. */
const derived = async (secret: string) => {
  const root = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  return new Uint8Array(await crypto.subtle.sign("HMAC", root, encoder.encode("insyte/seal/v1")))
}

export const SealerLive = Layer.effect(
  Sealer,
  Effect.gen(function*() {
    const environment = yield* Config.String("ENVIRONMENT")
    const keys = yield* Config.Redacted("SEAL_KEYS").pipe(Config.option)
    const secret = yield* Config.Redacted("BETTER_AUTH_SECRET").pipe(
      environment === "local" ? Config.withDefault(LOCAL_SECRET) : (config) => config,
      Config.option
    )
    const ring = yield* Effect.promise(async () => {
      if (Option.isSome(keys)) {
        return Promise.all(
          Redacted.value(keys.value).split(",").filter((k) => k.trim() !== "").map((k) => ringKey(fromB64(k)))
        )
      }
      if (environment === "staging" || environment === "production" || Option.isNone(secret)) return []
      return [await ringKey(await derived(Redacted.value(secret.value)))]
    })
    const newest = ring[0]
    return Sealer.of({
      seal: (plain) =>
        newest === undefined
          ? Effect.die(new Error("SEAL_KEYS is not set on this stage: nothing can be sealed"))
          : Effect.promise(async () => {
            const iv = crypto.getRandomValues(new Uint8Array(12))
            const sealed = new Uint8Array(
              await crypto.subtle.encrypt({ name: "AES-GCM", iv }, newest.key, encoder.encode(plain))
            )
            return { sealed: `v1.${newest.kid}.${b64url(iv)}.${b64url(sealed)}`, kid: newest.kid }
          }),
      open: (text) => {
        const [version, kid = "", iv = "", body = ""] = text.split(".")
        const key = ring.find((k) => k.kid === kid)
        if (version !== "v1" || key === undefined) return Effect.fail(new SealBroken({ kid }))
        return Effect.tryPromise({
          try: async () =>
            Redacted.make(
              decoder.decode(
                await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64url(iv) }, key.key, fromB64url(body))
              )
            ),
          catch: () => new SealBroken({ kid })
        })
      }
    })
  })
)
