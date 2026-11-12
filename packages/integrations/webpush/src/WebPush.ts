import {
  PushGone,
  type PushMessage,
  PushRefused,
  type PushTarget,
  WebPush
} from "@insyte/modules/notifications/domain/Ports"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

/*
 * Web push without a library (M11 step 13.5): the message encrypted to the browser's keys as RFC 8291 says
 * (`aes128gcm`, RFC 8188, one record), and the sender named to the push service by a VAPID token (RFC 8292, ES256),
 * both over WebCrypto, which Workers and Node share. The keys are the stage's `VAPID_PUBLIC_KEY` (base64url, the
 * uncompressed P-256 point) and `VAPID_PRIVATE_KEY` (base64url, the 32-byte scalar), the format
 * `web-push generate-vapid-keys` prints, and `VAPID_SUBJECT`, a `mailto:` or `https:` contact for the push services.
 * Without all three the stage has no push, and the page says so.
 */

const encoder = new TextEncoder()

type Bytes = Uint8Array<ArrayBuffer>

/** UTF-8, typed alike under the DOM's and the Workers' declarations. */
const utf8 = (text: string) => encoder.encode(text) as Bytes

export const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")

export const fromB64url = (text: string) => {
  const plain = text.replaceAll("-", "+").replaceAll("_", "/").replace(/=+$/, "")
  return Uint8Array.from(atob(plain + "=".repeat((4 - (plain.length % 4)) % 4)), (c) => c.charCodeAt(0))
}

const concat = (...parts: ReadonlyArray<Uint8Array>): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** HKDF-SHA-256 (RFC 5869): extract under `salt`, expand `info` to `length` bytes. */
export const hkdf = async (salt: Bytes, ikm: Bytes, info: Bytes, length: number) => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8))
}

/** The record size the header announces; one record holds the whole message (a push carries at most 4 KB). */
const RECORD_SIZE = 4096

/**
 * The body of a push message (RFC 8291 §4): salt, record size and the sender's ephemeral public key as the header,
 * then the payload, its delimiter, encrypted under the key both sides derive from ECDH and the browser's auth secret.
 */
export const encrypt = async (target: Pick<PushTarget, "p256dh" | "auth">, payload: Bytes) => {
  const browserKey = fromB64url(target.p256dh)
  const authSecret = fromB64url(target.auth)
  const local = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits"
  ])) as CryptoKeyPair
  const localKey = new Uint8Array((await crypto.subtle.exportKey("raw", local.publicKey)) as ArrayBuffer)
  const browser = await crypto.subtle.importKey("raw", browserKey, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const shared = new Uint8Array(
    // `public` is the standard's name; the Workers' declarations spell it `$public`.
    await crypto.subtle.deriveBits({ name: "ECDH", public: browser } as never, local.privateKey, 256)
  )
  const ikm = await hkdf(authSecret, shared, concat(utf8("WebPush: info\0"), browserKey, localKey), 32)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16)
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12)
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"])
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2])))
  )
  const header = new Uint8Array(21)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, RECORD_SIZE)
  header[20] = localKey.length
  return concat(header, localKey, sealed)
}

/** The VAPID token for one push service (RFC 8292 §2): its origin as the audience, twelve hours, our contact. */
export const vapidToken = async (signer: CryptoKey, audience: string, subject: string, now = Date.now()) => {
  const part = (value: unknown) => b64url(utf8(JSON.stringify(value)))
  const unsigned = `${part({ typ: "JWT", alg: "ES256" })}.${
    part({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })
  }`
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signer, utf8(unsigned))
  )
  return `${unsigned}.${b64url(signature)}`
}

/** The private scalar beside its public point, as the JWK WebCrypto signs with. */
const signerOf = (publicKey: string, privateKey: string) => {
  const point = fromB64url(publicKey)
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: b64url(point.slice(1, 33)), y: b64url(point.slice(33, 65)), d: privateKey },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  )
}

/** What the service worker reads (`apps/console/public/sw.js`). */
const payloadOf = (message: PushMessage) =>
  utf8(JSON.stringify({
    title: message.title.slice(0, 200),
    body: message.body.slice(0, 400),
    url: message.url,
    tag: message.tag
  }))

export const WebPushLive = Layer.effect(
  WebPush,
  Effect.gen(function*() {
    const publicKey = Option.getOrElse(yield* Config.String("VAPID_PUBLIC_KEY").pipe(Config.option), () => "")
    const privateKey = yield* Config.Redacted("VAPID_PRIVATE_KEY").pipe(Config.option)
    const subject = Option.getOrElse(yield* Config.String("VAPID_SUBJECT").pipe(Config.option), () => "")
    const http = yield* HttpClient.HttpClient
    if (publicKey === "" || Option.isNone(privateKey) || subject === "") {
      return WebPush.of({ publicKey: null, send: () => Effect.fail(new PushRefused({ status: 0, reason: "no keys" })) })
    }
    const signer = yield* Effect.promise(() => signerOf(publicKey, Redacted.value(privateKey.value)))
    return WebPush.of({
      publicKey,
      send: Effect.fn("WebPush.send")(function*(target: PushTarget, message: PushMessage) {
        const audience = new URL(target.endpoint).origin
        const [body, token] = yield* Effect.promise(() =>
          Promise.all([encrypt(target, payloadOf(message)), vapidToken(signer, audience, subject)])
        )
        const response = yield* http.execute(
          HttpClientRequest.post(target.endpoint).pipe(
            HttpClientRequest.setHeaders({
              authorization: `vapid t=${token}, k=${publicKey}`,
              "content-encoding": "aes128gcm",
              ttl: "86400",
              urgency: "normal"
            }),
            HttpClientRequest.bodyUint8Array(body, "application/octet-stream")
          )
        ).pipe(
          Effect.timeout("15 seconds"),
          Effect.mapError((error) => new PushRefused({ status: 0, reason: `push request failed: ${error._tag}` }))
        )
        if (response.status === 404 || response.status === 410) return yield* new PushGone({ status: response.status })
        if (response.status >= 400) {
          return yield* new PushRefused({ status: response.status, reason: `push service answered ${response.status}` })
        }
      })
    })
  })
)
