import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { expect, it, vi } from "vitest"
import worker from "../src/Local.ts"

/*
 * One trace from the browser to Postgres (17 §1, M18 "Observability"). The console's browser sends `traceparent` on
 * `/api/*` (Sentry's `propagateTraceparent`) and the console Worker hands the request to the API untouched; this is the
 * API's half: a request carrying that header answers with its trace id as `Insyte-Request-Id`, and every span it
 * exports, the HTTP request's and the SQL statements' included, belongs to that trace.
 */

type Span = { readonly name: string; readonly traceId: string; readonly attributes?: ReadonlyArray<{ key: string }> }
const posted: Array<Span> = []
const network = globalThis.fetch
vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
  const url = input instanceof Request ? input.url : String(input)
  if (!url.startsWith("http://otlp.test/")) return network(input, init)
  const body = JSON.parse(String(init?.body)) as { resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<Span> }> }> }
  posted.push(...body.resourceSpans.flatMap((r) => r.scopeSpans.flatMap((s) => s.spans)))
  return Promise.resolve(new Response("{}", { status: 200 }))
})

it("continues the browser's trace through the API to the database", async () => {
  const traceId = "0af7651916cd43dd8448eb211c80319c"
  const ctx = createExecutionContext()
  const response = await worker.fetch(
    new Request("http://api.test/api/health/deep", { headers: { traceparent: `00-${traceId}-b7ad6b7169203331-01` } }),
    env,
    ctx
  )
  await response.arrayBuffer()
  await waitOnExecutionContext(ctx)
  expect(response.headers.get("insyte-request-id")).toBe(traceId)
  expect(posted.length).toBeGreaterThan(0)
  expect(posted.filter((s) => s.traceId !== traceId).map((s) => s.name)).toEqual([])
  expect(posted.some((s) => s.name.startsWith("sql.") || s.attributes?.some((a) => a.key === "db.query.text")))
    .toBe(true)
})
