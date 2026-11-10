import {
  type ParcelRef,
  Tracking,
  TrackingError,
  type TrackingSnapshot
} from "@insyte/modules/tracking/domain/Tracking"
import { Config, Duration, Effect, Layer, Redacted } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

/*
 * AfterShip (M8.4; integrations.md): Insyte's account registers each parcel's tracking number and reads its status, at a
 * pinned API version, with the key in `as-api-key`. Its webhooks are signed with the account's webhook secret
 * (`aftership-hmac-sha256`: the base64 HMAC-SHA256 of the raw body). The delivery's own id travels in the tracking's
 * custom fields, so a webhook names it. Built from AfterShip's documentation without a key to try it against: the
 * first call on staging checks the shapes (responses are read as `data` or `data.tracking`).
 */

const BASE = "https://api.aftership.com/tracking/2025-07"
const TIMEOUT = Duration.seconds(10)

/** Shopify's carrier names as AfterShip's slugs; an unknown one is left for AfterShip to detect. */
const SLUGS: Record<string, string> = {
  postnl: "postnl",
  "postnl international": "postnl-international",
  dhl: "dhl",
  "dhl express": "dhl",
  "dhl parcel": "dhl-nl",
  "dhl ecommerce": "dhl-global-mail",
  dpd: "dpd",
  ups: "ups",
  gls: "gls",
  fedex: "fedex",
  bpost: "bpost"
}

export const slugOf = (carrier: string | null) => (carrier === null ? undefined : SLUGS[carrier.trim().toLowerCase()])

type Raw = Record<string, unknown>

const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null)
const date = (v: unknown) => {
  const s = str(v)
  if (s === null) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

const STATUS: Record<string, TrackingSnapshot["status"]> = {
  Pending: "pending",
  InfoReceived: "pending",
  InTransit: "in_transit",
  AvailableForPickup: "in_transit",
  OutForDelivery: "out_for_delivery",
  AttemptFail: "exception",
  Delivered: "delivered",
  Exception: "exception",
  Expired: "expired"
}

/** A tracking as AfterShip writes it, in Insyte's words. */
export const snapshotOf = (t: Raw): TrackingSnapshot => {
  const checkpoints = Array.isArray(t["checkpoints"]) ? (t["checkpoints"] as Array<Raw>) : []
  const last = checkpoints.at(-1)
  const status = STATUS[String(t["tag"] ?? "")] ?? "pending"
  const estimate = (t["courier_estimated_delivery_date"] as Raw | undefined)?.["estimated_delivery_date"] ??
    (t["aftership_estimated_delivery_date"] as Raw | undefined)?.["estimated_delivery_date"] ?? t["expected_delivery"]
  return {
    status,
    checkpoint: str(last?.["message"]),
    exception: status === "exception" ? str(t["subtag_message"]) ?? str(last?.["message"]) : null,
    estimatedDelivery: date(estimate),
    deliveredAt: status === "delivered" ? date(t["shipment_delivery_date"]) ?? date(last?.["checkpoint_time"]) : null,
    lastEventAt: date(last?.["checkpoint_time"]) ?? date(t["updated_at"])
  }
}

/** A webhook's body: whose parcel it is, as its custom fields name it (a delivery, or a return's), and the parcel now. */
export const readWebhook = (body: unknown): { ref: ParcelRef; snapshot: TrackingSnapshot } | undefined => {
  const msg = (body as { msg?: Raw } | undefined)?.msg
  const fields = msg?.["custom_fields"] as Raw | undefined
  const delivery = str(fields?.["insyte_delivery"])
  const ret = str(fields?.["insyte_return"])
  if (msg === undefined) return undefined
  if (delivery !== null) return { ref: { kind: "delivery", id: delivery }, snapshot: snapshotOf(msg) }
  if (ret !== null) return { ref: { kind: "return", id: ret }, snapshot: snapshotOf(msg) }
  return undefined
}

const encoder = new TextEncoder()

/** The base64 HMAC-SHA256 of `body`, as AfterShip signs its webhooks. */
export const webhookSignature = async (secret: string, body: Uint8Array) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new Uint8Array(body)))))
}

const same = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const trackingOf = (json: unknown): Raw => {
  const data = (json as { data?: Raw } | undefined)?.data ?? {}
  return (data["tracking"] as Raw | undefined) ?? data
}

/** AfterShip's refusal, with its own message; a 429 or 5xx is worth trying again. */
const refused = (status: number, json: unknown) => {
  const meta = (json as { meta?: { message?: string } } | undefined)?.meta
  return new TrackingError({
    reason: `AfterShip antwoordde ${status}${meta?.message ? `: ${meta.message}` : ""}`,
    retryable: status === 429 || status >= 500
  })
}

export const AfterShipLive = Layer.effect(
  Tracking,
  Effect.gen(function*() {
    const http = yield* HttpClient.HttpClient
    const key = yield* Config.Redacted("AFTERSHIP_API_KEY")
    const secret = yield* Config.Redacted("AFTERSHIP_WEBHOOK_SECRET")
    const call = (request: HttpClientRequest.HttpClientRequest) =>
      http.execute(request.pipe(HttpClientRequest.setHeaders({
        "as-api-key": Redacted.value(key),
        "content-type": "application/json"
      }))).pipe(
        Effect.timeout(TIMEOUT),
        Effect.mapError(() => new TrackingError({ reason: "AfterShip was niet bereikbaar", retryable: true })),
        Effect.flatMap((response) =>
          Effect.map(
            response.json.pipe(Effect.orElseSucceed(() => ({}))),
            (json) => ({ status: response.status, json })
          )
        )
      )
    return Tracking.of({
      configured: true,
      register: Effect.fn("AfterShip.register")(function*(input) {
        const slug = slugOf(input.carrier)
        const created = yield* call(
          HttpClientRequest.post(`${BASE}/trackings`).pipe(
            HttpClientRequest.bodyText(
              JSON.stringify({
                tracking_number: input.trackingNumber,
                ...(slug === undefined ? {} : { slug }),
                title: input.title,
                order_number: input.title,
                custom_fields: input.ref.kind === "delivery"
                  ? { insyte_delivery: input.ref.id }
                  : { insyte_return: input.ref.id }
              }),
              "application/json"
            )
          )
        )
        if (created.status >= 200 && created.status < 300) {
          const t = trackingOf(created.json)
          return { aftershipId: String(t["id"]), slug: str(t["slug"]) }
        }
        // Registered before (another store, or a retry): the existing tracking is the one.
        if (created.status === 409 || (created.json as { meta?: { code?: number } }).meta?.code === 4003) {
          const found = yield* call(
            HttpClientRequest.get(`${BASE}/trackings?tracking_numbers=${encodeURIComponent(input.trackingNumber)}`)
          )
          const list = ((found.json as { data?: { trackings?: Array<Raw> } }).data?.trackings) ?? []
          if (list[0] !== undefined) return { aftershipId: String(list[0]["id"]), slug: str(list[0]["slug"]) }
        }
        return yield* refused(created.status, created.json)
      }),
      get: Effect.fn("AfterShip.get")(function*(aftershipId) {
        const got = yield* call(HttpClientRequest.get(`${BASE}/trackings/${encodeURIComponent(aftershipId)}`))
        if (got.status >= 200 && got.status < 300) return snapshotOf(trackingOf(got.json))
        return yield* refused(got.status, got.json)
      }),
      verifyWebhook: (body, signature) =>
        Effect.promise(async () =>
          signature !== "" && same(await webhookSignature(Redacted.value(secret), body), signature)
        ),
      readWebhook
    })
  })
)

/** Where no AfterShip key is set: nothing is registered; parcels keep Shopify's own status. */
export const TrackingManual = Layer.succeed(Tracking)(Tracking.of({
  configured: false,
  register: () => Effect.fail(new TrackingError({ reason: "AfterShip is niet ingesteld", retryable: false })),
  get: () => Effect.fail(new TrackingError({ reason: "AfterShip is niet ingesteld", retryable: false })),
  verifyWebhook: () => Effect.succeed(false),
  readWebhook: () => undefined
}))
