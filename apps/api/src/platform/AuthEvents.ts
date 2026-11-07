import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import type { AuthEvent } from "@insyte/integrations-better-auth/Events"
import { Effect } from "effect"

/*
 * Stores what better-auth reports happened to an account (`auth_events`, M2.6), with where it came from: the visitor's
 * IP and country as Cloudflare saw them (set on the console's request and forwarded by the service binding) and the
 * user agent. Locally there is no IP or country, and the row holds none.
 */
export const recordAuthEvent = Effect.fn("AuthEvents.record")(function*(event: AuthEvent) {
  const db = yield* Db
  const headers = event.request?.headers
  const ip = headers?.get("cf-connecting-ip") ?? null
  const country = headers?.get("cf-ipcountry") ?? null
  const userAgent = headers?.get("user-agent")?.slice(0, 512) ?? null
  yield* db.routing((sql) =>
    sql`insert into auth_events (id, user_id, kind, ip, user_agent, country)
        values (${mintId("aev")}, ${event.userId}, ${event.kind}, ${ip}, ${userAgent}, ${country})`
  )
})
