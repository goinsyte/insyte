import { env } from "cloudflare:workers"
import { protocolOver } from "./client.ts"

/** What travels from the visitor's request to the API during SSR (11 §3): the session, the trace, the language. */
const FORWARDED = ["cookie", "traceparent", "baggage", "accept-language", "insyte-workspace"]

/**
 * The RPC transport for this request's server render: the `API` binding as the network, the visitor's headers on every
 * call. Built per request, never at module scope.
 */
export const serverProtocol = (request: Request) => {
  const fetchViaBinding: typeof globalThis.fetch = (input, init) => {
    const outgoing = new Request(input, init)
    for (const name of FORWARDED) {
      const value = request.headers.get(name)
      if (value !== null) outgoing.headers.set(name, value)
    }
    return env.API.fetch(outgoing)
  }
  return protocolOver(fetchViaBinding, new URL(request.url).origin)
}
