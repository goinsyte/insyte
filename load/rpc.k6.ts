/*
 * The console's RPCs under load (M18 "Performance"): p95 under 300 ms for the long lists, under 150 ms for a record,
 * on the `busy` scenario ten times over (`load/prepare.ts`). k6's own summary is the report; the thresholds fail the
 * run. LOCAL ONLY by default: `INSYTE_URL` must be localhost unless `INSYTE_LOAD_REMOTE=yes`, which only Ishak sets.
 *
 *   bun load/prepare.ts && k6 run load/rpc.k6.ts
 *
 * `vite preview` may listen on IPv6 only, where k6 dials `localhost` as 127.0.0.1: `INSYTE_URL=http://[::1]:4300`.
 */
import { check } from "k6"
import http from "k6/http"

type Session = {
  readonly base: string
  readonly cookie: string
  readonly orders: ReadonlyArray<string>
  readonly products: ReadonlyArray<string>
  readonly customers: ReadonlyArray<string>
}

const session = JSON.parse(open("./.session.json")) as Session
const base = __ENV["INSYTE_URL"] ?? session.base
if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(base) && __ENV["INSYTE_LOAD_REMOTE"] !== "yes") {
  throw new Error(`load/rpc.k6.ts: ${base} is not local`)
}

const VUS = Number(__ENV["VUS"] ?? 10)
const DURATION = __ENV["DURATION"] ?? "60s"

export const options = {
  scenarios: {
    lists: { executor: "constant-vus", vus: VUS, duration: DURATION, exec: "lists" },
    gets: { executor: "constant-vus", vus: VUS, duration: DURATION, exec: "gets" }
  },
  thresholds: {
    "http_req_duration{kind:list}": ["p(95)<300"],
    "http_req_duration{kind:get}": ["p(95)<150"],
    "checks": ["rate>0.99"]
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"]
}

let sequence = 0
const call = (tag: string, payload: unknown, kind: "list" | "get") => {
  const body = `${JSON.stringify({ _tag: "Request", id: String(sequence++), tag, payload, headers: [] })}\n`
  const response = http.post(`${base}/api/rpc/v1`, body, {
    // The origin the API trusts is the session's (`CONSOLE_ORIGIN`), whatever address the run connects to.
    headers: { "content-type": "application/ndjson", origin: session.base, cookie: session.cookie },
    tags: { kind, rpc: tag }
  })
  check(response, { [`${tag} succeeds`]: (r) => r.status === 200 && String(r.body).includes(`"_tag":"Success"`) })
}

const pick = <A>(list: ReadonlyArray<A>) => list[Math.floor(Math.random() * list.length)]!

const LISTS: ReadonlyArray<readonly [string, unknown]> = [
  ["Orders.list", {}],
  ["Orders.list", { sort: { field: "total", desc: true } }],
  ["Orders.list", { q: "Klant 1" }],
  ["Products.list", {}],
  ["Customers.list", {}],
  ["Tickets.list", {}]
]

export function lists() {
  const [tag, payload] = pick(LISTS)
  call(tag, payload, "list")
}

export function gets() {
  const which = Math.floor(Math.random() * 3)
  if (which === 0) call("Orders.get", { id: pick(session.orders) }, "get")
  else if (which === 1) call("Products.get", { id: pick(session.products) }, "get")
  else call("Customers.get", { id: pick(session.customers) }, "get")
}
