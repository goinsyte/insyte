import { WEBHOOK_TIMEOUT_MS } from "@insyte/domain/Webhooks"
import {
  type PostResult,
  ResolverUnavailable,
  WebhookRuns,
  WebhookSender
} from "@insyte/modules/developer/domain/Ports"
import { env } from "cloudflare:workers"
import { Config, Effect, Layer } from "effect"

/*
 * Outbound webhooks (M19.4). The sender posts over `fetch`: ten seconds, then a time-out; a redirect is answered, never
 * followed (`redirect: "manual"`), and counts as a failure; of the answer at most 2 KB is read, then the stream is
 * cancelled. Names resolve over DNS-over-HTTPS, so an attempt can refuse a name that points inside a network before it
 * connects. That check is defence in depth, not a pin: `fetch` resolves the name again itself and a Worker cannot
 * connect to an address it was given, so a name that answers differently a moment later (DNS rebinding) is not caught
 * here; what stops it is that a Worker's `fetch` does not reach private networks to begin with. Where the stage says
 * `WEBHOOK_ADAPTER=recorded` (the worker tests) nothing is called: the URL's first label decides the answer (`ok`,
 * `echo` answers the body it got, `fail`, `slow`, `moved`, `inside`, `nodns` whose resolver does not answer). A
 * delivery's run is a `WebhookDeliveryWorkflow` instance named by the delivery and its run number.
 */

const SNIPPET = 2048

/** The start of the answer, read no further than 2 KB; the rest of the stream is cancelled. */
const readSnippet = async (response: Response) => {
  const reader = response.body?.getReader()
  if (reader === undefined) return ""
  const chunks: Array<Uint8Array> = []
  let size = 0
  try {
    while (size < SNIPPET) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      size += value.byteLength
    }
  } catch {
    // What came before the stream broke is what there is.
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const bytes = new Uint8Array(Math.min(size, SNIPPET))
  let at = 0
  for (const chunk of chunks) {
    if (at >= bytes.length) break
    const part = chunk.subarray(0, bytes.length - at)
    bytes.set(part, at)
    at += part.byteLength
  }
  return new TextDecoder().decode(bytes).slice(0, SNIPPET)
}

/**
 * A name's addresses of one type, over DNS-over-HTTPS: none for a name that does not exist (NXDOMAIN) or has none of
 * that type; `undefined` when the resolver did not answer, answered with an error, or failed on its side (SERVFAIL).
 */
const ask = async (host: string, type: "A" | "AAAA"): Promise<Array<string> | undefined> => {
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
    { headers: { accept: "application/dns-json" } }
  ).catch(() => undefined)
  if (response === undefined || !response.ok) return undefined
  const body = await response.json().catch(() => undefined) as
    | { Status?: number; Answer?: Array<{ type: number; data: string }> }
    | undefined
  if (body === undefined || (body.Status !== 0 && body.Status !== 3)) return undefined
  return (body.Answer ?? []).filter((a) => a.type === 1 || a.type === 28).map((a) => a.data)
}

const live = WebhookSender.of({
  resolve: (host) =>
    Effect.flatMap(
      Effect.promise(() => Promise.all([ask(host, "A"), ask(host, "AAAA")])),
      ([a, aaaa]) =>
        a === undefined || aaaa === undefined
          ? Effect.fail(new ResolverUnavailable({ host }))
          : Effect.succeed([...a, ...aaaa])
    ),
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
  resolve: (host) =>
    host.startsWith("nodns.")
      ? Effect.fail(new ResolverUnavailable({ host }))
      : Effect.succeed(host.startsWith("inside.") ? ["10.1.2.3"] : ["93.184.215.14"]),
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

/** A delivery's run's instance name: the delivery's id, and after a re-arm its run number. */
const runName = (deliveryId: string, run: number) => run === 0 ? deliveryId : `${deliveryId}-${run}`

export const WebhookRunsLive = Layer.succeed(WebhookRuns)(WebhookRuns.of({
  start: Effect.fn("WebhookRuns.start")(function*(input) {
    const id = runName(input.deliveryId, input.run)
    return yield* Effect.tryPromise(() =>
      env.WEBHOOK_DELIVERY.create({
        id,
        params: { workspaceId: input.workspaceId, deliveryId: input.deliveryId, run: input.run }
      })
    ).pipe(
      Effect.as(true),
      // Refused because an instance by that name is there already: that one is the run. Anything else did not start.
      Effect.catch((created) =>
        Effect.tryPromise(() => env.WEBHOOK_DELIVERY.get(id)).pipe(
          Effect.as(true),
          Effect.catch(() =>
            Effect.logWarning("webhook run did not start", { deliveryId: input.deliveryId, run: input.run }).pipe(
              Effect.annotateLogs({ cause: String(created) }),
              Effect.as(false)
            )
          )
        )
      )
    )
  })
}))
