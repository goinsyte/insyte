import { WebPush } from "@insyte/modules/notifications/domain/Ports"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { b64url, fromB64url, hkdf, WebPushLive } from "../src/WebPush.ts"

/*
 * The web push adapter against a fake push service, with keys generated for the run: the body opens with the browser's
 * private key as RFC 8291 says a browser opens it, the VAPID token verifies under the stage's public key and names the
 * push service, and the service's answers read back (gone, refused).
 */

interface Seen {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: Uint8Array
}

const p256 = { name: "ECDSA", namedCurve: "P-256" } as const

const vapidKeys = async () => {
  const pair = await crypto.subtle.generateKey(p256, true, ["sign", "verify"])
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey)
  return { publicKey: b64url(raw), privateKey: jwk.d!, verify: pair.publicKey }
}

/** A browser's subscription keys, and its private key to open what was sent to it. */
const browserKeys = async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  return { p256dh: b64url(raw), auth: b64url(auth), raw, authSecret: auth, privateKey: pair.privateKey }
}

/** RFC 8291 §3.4 and RFC 8188 §2, the browser's side. */
const open = async (body: Uint8Array, browser: Awaited<ReturnType<typeof browserKeys>>) => {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16)
  const idlen = body[20]!
  const senderKey = body.slice(21, 21 + idlen)
  const sender = await crypto.subtle.importKey("raw", senderKey, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: sender }, browser.privateKey, 256)
  )
  const info = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...browser.raw, ...senderKey])
  const ikm = await hkdf(browser.authSecret, shared, info, 32)
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16)
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12)
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, body.slice(21 + idlen))
  )
  expect(plain[plain.length - 1]).toBe(2)
  return { rs, idlen, text: new TextDecoder().decode(plain.slice(0, -1)) }
}

const push = (keys: Record<string, string>, answer: () => Response, seen: Array<Seen>) =>
  WebPushLive.pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) =>
        Effect.tryPromise({
          try: async () => {
            const raw = request.body as { body?: Uint8Array }
            seen.push({
              url: url.href,
              headers: request.headers as Record<string, string>,
              body: raw.body ?? new Uint8Array()
            })
            return HttpClientResponse.fromWeb(request, answer())
          },
          catch: (cause) =>
            new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
        })
      )
    )),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnvRecord(keys)))
  )

const MESSAGE = {
  title: "Joost wees je ticket #12 toe",
  body: "Retour niet ontvangen",
  url: "/tickets?ticket=t",
  tag: "dlv_1"
}

describe("WebPushLive", () => {
  it("has no key, and sends nothing, without the stage's three settings", async () => {
    const keys = await vapidKeys()
    const exit = await Effect.runPromiseExit(
      Effect.service(WebPush).pipe(
        Effect.provide(push({ VAPID_PUBLIC_KEY: keys.publicKey }, () => new Response(null, { status: 201 }), []))
      )
    )
    expect(Exit.isSuccess(exit) && exit.value.publicKey).toBeNull()
  })

  it("encrypts to the browser's keys and names the sender with a VAPID token", async () => {
    const keys = await vapidKeys()
    const browser = await browserKeys()
    const seen: Array<Seen> = []
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc123"
    const exit = await Effect.runPromiseExit(
      Effect.flatMap(
        Effect.service(WebPush),
        (p) => p.send({ endpoint, p256dh: browser.p256dh, auth: browser.auth }, MESSAGE)
      ).pipe(
        Effect.provide(push(
          {
            VAPID_PUBLIC_KEY: keys.publicKey,
            VAPID_PRIVATE_KEY: keys.privateKey,
            VAPID_SUBJECT: "mailto:support@example.com"
          },
          () => new Response(null, { status: 201 }),
          seen
        ))
      )
    )
    expect(Exit.isSuccess(exit)).toBe(true)
    const [request] = seen
    expect(request!.url).toBe(endpoint)
    expect(request!.headers).toMatchObject({ "content-encoding": "aes128gcm", ttl: "86400", urgency: "normal" })

    const opened = await open(request!.body, browser)
    expect(opened.rs).toBe(4096)
    expect(opened.idlen).toBe(65)
    expect(JSON.parse(opened.text)).toEqual(MESSAGE)

    const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(request!.headers["authorization"]!)!
    expect(k).toBe(keys.publicKey)
    const [header, claims, signature] = token!.split(".")
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keys.verify,
      fromB64url(signature!),
      new TextEncoder().encode(`${header}.${claims}`)
    )
    expect(valid).toBe(true)
    expect(JSON.parse(new TextDecoder().decode(fromB64url(header!)))).toEqual({ typ: "JWT", alg: "ES256" })
    const body = JSON.parse(new TextDecoder().decode(fromB64url(claims!))) as { aud: string; exp: number; sub: string }
    expect(body.aud).toBe("https://fcm.googleapis.com")
    expect(body.sub).toBe("mailto:support@example.com")
    expect(body.exp).toBeGreaterThan(Date.now() / 1000)
    expect(body.exp).toBeLessThanOrEqual(Date.now() / 1000 + 12 * 3600 + 1)
  })

  it("says a subscription is gone on 404 and 410, and refused on anything else", async () => {
    const keys = await vapidKeys()
    const browser = await browserKeys()
    const config = {
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: "https://example.com"
    }
    const tagOf = async (status: number) => {
      const exit = await Effect.runPromiseExit(
        Effect.flatMap(
          Effect.service(WebPush),
          (p) => p.send({ endpoint: "https://push.example/x", p256dh: browser.p256dh, auth: browser.auth }, MESSAGE)
        ).pipe(
          Effect.provide(push(config, () => new Response(null, { status }), []))
        )
      )
      return Exit.isFailure(exit) ? (exit.cause.reasons[0] as { error?: { _tag: string } })?.error?._tag : "sent"
    }
    expect(await tagOf(410)).toBe("PushGone")
    expect(await tagOf(404)).toBe("PushGone")
    expect(await tagOf(413)).toBe("PushRefused")
    expect(await tagOf(201)).toBe("sent")
  })
})
