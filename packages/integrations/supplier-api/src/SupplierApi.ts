import { SupplierApi, SupplierApiError } from "@insyte/modules/forwarding/domain/Forwarding"
import { Duration, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"

/*
 * A supplier's own API (M8.2; domain.md §5 `supplier_integrations`): Insyte posts JSON to the supplier's URL, signed with
 * the secret it generated for them, so they can tell it is Insyte. `Insyte-Signature: t=<unix seconds>,v1=<hex
 * HMAC-SHA256 of "<t>.<body>">`; the supplier checks it and that `t` is recent. A 2xx is taken; a 4xx is the supplier's
 * refusal, final; a 429, a 5xx or no answer is worth trying again.
 */

const encoder = new TextEncoder()

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

/** The signature header for `body` at `t` (unix seconds). */
export const signature = async (secret: string, body: string, t: number) => {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ])
  return `t=${t},v1=${hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${t}.${body}`)))}`
}

const TIMEOUT = Duration.seconds(10)

export const SupplierApiLive = Layer.effect(
  SupplierApi,
  Effect.map(Effect.service(HttpClient.HttpClient), (http) =>
    SupplierApi.of({
      post: Effect.fn("SupplierApi.post")(function*(url, secret, body) {
        const json = JSON.stringify(body)
        const t = Math.floor(Date.now() / 1000)
        const signed = yield* Effect.promise(() => signature(secret, json, t))
        const started = Date.now()
        const response = yield* http.execute(
          HttpClientRequest.post(url).pipe(
            HttpClientRequest.setHeaders({
              "content-type": "application/json",
              "insyte-signature": signed,
              "user-agent": "Insyte/1 (+https://goinsyte.com)"
            }),
            HttpClientRequest.bodyText(json, "application/json")
          )
        ).pipe(
          Effect.timeout(TIMEOUT),
          Effect.mapError(() => new SupplierApiError({ reason: "De leverancier was niet bereikbaar", retryable: true }))
        )
        const ms = Date.now() - started
        if (response.status >= 200 && response.status < 300) return { ms }
        const text = yield* response.text.pipe(Effect.orElseSucceed(() => ""))
        const said = text.trim().slice(0, 200)
        return yield* new SupplierApiError({
          reason: `De leverancier antwoordde ${response.status}${said === "" ? "" : `: ${said}`}`,
          retryable: response.status === 429 || response.status >= 500
        })
      })
    }))
)
