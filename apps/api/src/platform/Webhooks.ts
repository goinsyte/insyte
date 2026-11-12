import { WEBHOOK_TIMEOUT_MS } from "@insyte/domain/Webhooks"
import { type PostResult, WebhookRuns, WebhookSender } from "@insyte/modules/developer/domain/Ports"
import { env } from "cloudflare:workers"
import { Config, Effect, Layer } from "effect"

/*
 * Outbound webhooks (M19.4). The sender posts over `fetch`: ten seconds, then a time-out; a redirect is answered, never
 * followed (`redirect: "manual"`), and counts as a failure. Names resolve over DNS-over-HTTPS, so an attempt can refuse
 * a name that points inside a network before it connects. Where the stage says `WEBHOOK_ADAPTER=recorded` (the worker
 * tests) nothing is called: the URL's first label decides the answer (`ok`, `echo` answers the body it got, `fail`, `slow`,
 * `moved`, `inside`). A
 * delivery's run is a `WebhookDeliveryWorkflow` instance named by the delivery.
 */

const SNIPPET = 2048

const readSnippet = async (response: Response) => {
  const text = await response.text().catch(() => "")
  return text.slice(0, SNIPPET)
}

/** A name's addresses of one type, over DNS-over-HTTPS; none when the resolver does not answer. */
const ask = async (host: string, type: "A" | "AAAA"): Promise<Array<string>> => {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
    { headers: { accept: "application/dns-json" } }
  ).catch(() => undefined)
  if (response === undefined || !response.ok) return []
  const body = await response.json().catch(() => ({})) as { Answer?: Array<{ type: number; data: string }> }
  return (body.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data)
}

const live = WebhookSender.of({
  resolve: (host) =>
    Effect.promise(async () => {
      const [a, aaaa] = await Promise.all([ask(host, "A"), ask(host, "AAAA")])
      return [...a, ...aaaa]
    }),
  post: ({ url, headers, body }) =>
    Effect.promise(async (): Promise<PostResult> => {
      const started = Date.now()
      try {
        const response = await fetch(url, {
          method: "POST",
          headers,
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS)
        })
        const snippet = await readSnippet(response)
        const redirected = response.status >= 300 && response.status < 400
        return {
          status: response.status,
          ms: Date.now() - started,
          error: redirected ? "redirect" : null,
          body: snippet
        }
      } catch (error) {
        const timeout = error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")
        return { status: null, ms: Date.now() - started, error: timeout ? "timeout" : "network", body: "" }
      }
    })
})

/** The worker tests' sender: the host's first label says how the endpoint answers. */
const recorded = WebhookSender.of({
  resolve: (host) => Effect.succeed(host.startsWith("inside.") ? ["10.1.2.3"] : ["93.184.215.14"]),
  post: ({ url, body }) => {
    const label = new URL(url).hostname.split(".")[0]
    return Effect.succeed<PostResult>(
      label === "echo"
        ? { status: 200, ms: 19, error: null, body }
        : label === "fail"
        ? { status: 500, ms: 41, error: null, body: "{\"error\":\"internal\"}" }
        : label === "slow"
        ? { status: null, ms: WEBHOOK_TIMEOUT_MS, error: "timeout", body: "" }
        : label === "moved"
        ? { status: 301, ms: 12, error: "redirect", body: "" }
        : { status: 200, ms: 23, error: null, body: "{\"received\":true}" }
    )
  }
})

export const WebhookSenderChoice = Layer.unwrap(
  Effect.map(
    Config.String("WEBHOOK_ADAPTER").pipe(Config.withDefault("http")),
    (adapter) => Layer.succeed(WebhookSender, adapter === "recorded" ? recorded : live)
  )
)

export const WebhookRunsLive = Layer.succeed(WebhookRuns)(WebhookRuns.of({
  start: Effect.fn("WebhookRuns.start")(function*(input) {
    yield* Effect.tryPromise(() =>
      env.WEBHOOK_DELIVERY.create({
        id: input.deliveryId,
        params: { workspaceId: input.workspaceId, deliveryId: input.deliveryId }
      })
    ).pipe(
      // Already started under this name: that instance is the delivery's run.
      Effect.catch(() =>
        Effect.flatMap(Effect.tryPromise(() => env.WEBHOOK_DELIVERY.get(input.deliveryId)), () => Effect.void)
      ),
      Effect.orDie
    )
  })
}))
