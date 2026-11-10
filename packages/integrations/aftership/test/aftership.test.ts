import { Tracking } from "@insyte/modules/tracking/domain/Tracking"
import { ConfigProvider, Effect, Exit, Layer } from "effect"
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/http"
import { describe, expect, it } from "vitest"
import { AfterShipLive, readWebhook, slugOf, snapshotOf, webhookSignature } from "../src/AfterShip.ts"

/*
 * AfterShip's adapter against a fake transport: what a registration sends (the key, the slug, our delivery id in the
 * custom fields), how a tracking reads in Insyte's words, and the webhook's signature.
 */

interface Seen {
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

const aftership = (answer: (seen: Seen) => Response, seen: Array<Seen> = []) =>
  AfterShipLive.pipe(
    Layer.provide(Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make((request, url) =>
        Effect.tryPromise({
          try: async () => {
            const raw = request.body as { body?: Uint8Array }
            const one = {
              url: url.href,
              headers: request.headers as Record<string, string>,
              body: raw.body === undefined ? "" : new TextDecoder().decode(raw.body)
            }
            seen.push(one)
            return HttpClientResponse.fromWeb(request, answer(one))
          },
          catch: (cause) =>
            new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request, cause }) })
        })
      )
    )),
    Layer.provide(ConfigProvider.layer(
      ConfigProvider.fromEnvRecord({ AFTERSHIP_API_KEY: "key", AFTERSHIP_WEBHOOK_SECRET: "whsecret" })
    ))
  )

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

const run = <A, E>(layer: ReturnType<typeof aftership>, f: (t: Tracking["Service"]) => Effect.Effect<A, E>) =>
  Effect.runPromiseExit(Effect.flatMap(Effect.service(Tracking), f).pipe(Effect.provide(layer)))

const TRACKING = {
  id: "trk_1",
  slug: "postnl",
  tag: "Exception",
  subtag_message: "Adres onbekend",
  courier_estimated_delivery_date: { estimated_delivery_date: "2026-11-12" },
  checkpoints: [
    { checkpoint_time: "2026-11-09T08:00:00+01:00", message: "Gesorteerd" },
    { checkpoint_time: "2026-11-10T09:30:00+01:00", message: "Bezorger kon het adres niet vinden" }
  ],
  custom_fields: { insyte_delivery: "dlv_1" }
}

describe("AfterShipLive", () => {
  it("registers with the key, the carrier's slug and our delivery id", async () => {
    const seen: Array<Seen> = []
    const exit = await run(
      aftership(() => json({ meta: { code: 201 }, data: { id: "trk_1", slug: "postnl" } }, 201), seen),
      (t) =>
        t.register({
          ref: { kind: "delivery", id: "dlv_1" },
          trackingNumber: "3S123",
          carrier: "PostNL",
          title: "#1001"
        })
    )
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ aftershipId: "trk_1", slug: "postnl" })
    expect(seen[0]!.url).toBe("https://api.aftership.com/tracking/2025-07/trackings")
    expect(seen[0]!.headers["as-api-key"]).toBe("key")
    expect(JSON.parse(seen[0]!.body)).toEqual({
      tracking_number: "3S123",
      slug: "postnl",
      title: "#1001",
      order_number: "#1001",
      custom_fields: { insyte_delivery: "dlv_1" }
    })
  })

  it("reads a tracking in Insyte's words, from data or data.tracking", async () => {
    expect(snapshotOf(TRACKING)).toEqual({
      status: "exception",
      checkpoint: "Bezorger kon het adres niet vinden",
      exception: "Adres onbekend",
      estimatedDelivery: new Date("2026-11-12"),
      deliveredAt: null,
      lastEventAt: new Date("2026-11-10T08:30:00Z")
    })
    const exit = await run(
      aftership(() => json({ data: { tracking: { ...TRACKING, tag: "Delivered" } } })),
      (t) => t.get("trk_1")
    )
    expect(Exit.isSuccess(exit) && exit.value.status).toBe("delivered")
    expect(slugOf("DHL Express")).toBe("dhl")
    expect(slugOf("Bezorgdienst Henk")).toBeUndefined()
  })

  it("knows its webhooks by their signature, and reads the delivery they name", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ event: "tracking_update", msg: TRACKING }))
    const good = await webhookSignature("whsecret", body)
    const layer = aftership(() => json({}))
    expect(
      await Effect.runPromise(
        Effect.flatMap(Effect.service(Tracking), (t) => t.verifyWebhook(body, good))
          .pipe(Effect.provide(layer))
      )
    ).toBe(true)
    expect(
      await Effect.runPromise(
        Effect.flatMap(Effect.service(Tracking), (t) => t.verifyWebhook(body, "forged"))
          .pipe(Effect.provide(layer))
      )
    ).toBe(false)
    expect(readWebhook({ event: "tracking_update", msg: TRACKING })?.ref).toEqual({ kind: "delivery", id: "dlv_1" })
    // A return's parcel (M9.2) carries its own field.
    expect(readWebhook({ msg: { ...TRACKING, custom_fields: { insyte_return: "ret_1" } } })?.ref).toEqual({
      kind: "return",
      id: "ret_1"
    })
    expect(readWebhook({ event: "tracking_update", msg: { tag: "Delivered" } })).toBeUndefined()
  })
})
