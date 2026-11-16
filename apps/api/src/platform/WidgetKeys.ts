import { LOCAL_SECRET } from "@insyte/integrations-better-auth/BetterAuth"
import { type WidgetClaims, WidgetKeys } from "@insyte/modules/inbox/domain/Ports"
import { Config, Effect, Layer, Option, Redacted } from "effect"

/*
 * The website chat's widget sessions (M15 step 8): a token per shopper session, `claims.signature` in base64url, with an
 * HMAC-SHA256 under the stage's `WEBCHAT_TOKEN_SECRET`, and the keyed hash a session's id is kept as. Local runs and
 * previews have no such secret: they derive the key from the auth secret, under a label of its own, so it equals
 * nothing better-auth signs or an API key's hash. A deployed stage without the secret has no key, and the chat is off.
 * Rotating the secret ends every widget session; a shopper's next visit opens a new one.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const unbase64url = (text: string): Uint8Array | undefined => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return undefined
  try {
    const raw = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4))
    return Uint8Array.from(raw, (c) => c.charCodeAt(0))
  } catch {
    return undefined
  }
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

/** A token's length past which it is not looked at: ours are about 120 characters. */
const TOKEN_MAX = 512

const isClaims = (v: unknown): v is WidgetClaims =>
  typeof v === "object" && v !== null &&
  typeof (v as WidgetClaims).storeId === "string" &&
  typeof (v as WidgetClaims).sessionId === "string" &&
  typeof (v as WidgetClaims).expiresAt === "number" && Number.isFinite((v as WidgetClaims).expiresAt)

/** Keys over a root secret: one for the tokens, one for the session hashes. */
export const widgetKeys = async (root: string) => {
  const base = await crypto.subtle.importKey("raw", encoder.encode(root), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  const derive = async (label: string) =>
    crypto.subtle.importKey(
      "raw",
      await crypto.subtle.sign("HMAC", base, encoder.encode(label)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    )
  return { token: await derive("insyte/webchat/token/v1"), visitor: await derive("insyte/webchat/visitor/v1") }
}

export const makeWidgetKeys = (keys: Awaited<ReturnType<typeof widgetKeys>> | undefined) =>
  keys === undefined
    ? WidgetKeys.of({
      available: false,
      sign: () => Effect.die(new Error("The website chat has no key on this stage")),
      verify: () => Effect.succeed(undefined),
      visitorHash: () => Effect.die(new Error("The website chat has no key on this stage"))
    })
    : WidgetKeys.of({
      available: true,
      sign: (claims) =>
        Effect.promise(async () => {
          const body = base64url(encoder.encode(JSON.stringify({
            storeId: claims.storeId,
            sessionId: claims.sessionId,
            expiresAt: claims.expiresAt
          })))
          const signature = await crypto.subtle.sign("HMAC", keys.token, encoder.encode(body))
          return `${body}.${base64url(new Uint8Array(signature))}`
        }),
      verify: (token) =>
        Effect.promise(async () => {
          if (token.length > TOKEN_MAX) return undefined
          const [body, signature, ...rest] = token.split(".")
          if (body === undefined || signature === undefined || rest.length > 0) return undefined
          const sig = unbase64url(signature)
          if (sig === undefined) return undefined
          // `verify` compares in constant time.
          const ok = await crypto.subtle.verify("HMAC", keys.token, sig, encoder.encode(body))
          if (!ok) return undefined
          const bytes = unbase64url(body)
          if (bytes === undefined) return undefined
          try {
            const claims: unknown = JSON.parse(decoder.decode(bytes))
            return isClaims(claims) ? claims : undefined
          } catch {
            return undefined
          }
        }),
      visitorHash: (storeId, sessionId) =>
        Effect.promise(async () =>
          hex(await crypto.subtle.sign("HMAC", keys.visitor, encoder.encode(`${storeId}:${sessionId}`)))
        )
    })

export const WidgetKeysLive = Layer.effect(
  WidgetKeys,
  Effect.gen(function*() {
    const environment = yield* Config.String("ENVIRONMENT")
    const own = Option.filter(
      yield* Config.Redacted("WEBCHAT_TOKEN_SECRET").pipe(Config.option),
      (r) => Redacted.value(r) !== ""
    )
    const auth = yield* Config.String("BETTER_AUTH_SECRET").pipe(Config.withDefault(""))
    const derived: string | undefined = environment === "local" || environment === "preview"
      ? (auth || Redacted.value(LOCAL_SECRET))
      : undefined
    const root: string | undefined = Option.isSome(own) ? Redacted.value(own.value) : derived
    const keys = root === undefined ? undefined : yield* Effect.promise(() => widgetKeys(root))
    return makeWidgetKeys(keys)
  })
)
