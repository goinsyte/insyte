import type { OutboxEvent } from "@insyte/modules/shared/domain/Outbox"
import type { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import type { ServicesOf, Subscriber } from "./Subscriber.ts"
import { Analytics } from "./subscribers/analytics.ts"
import { Automations } from "./subscribers/automations.ts"
import { Chargebacks } from "./subscribers/chargebacks.ts"
import { Chat } from "./subscribers/chats.ts"
import { Data } from "./subscribers/data.ts"
import { Facts } from "./subscribers/facts.ts"
import { Forwarding } from "./subscribers/forwarding.ts"
import { Support } from "./subscribers/inbox.ts"
import { Marketing } from "./subscribers/marketing.ts"
import { InvitationMail } from "./subscribers/members.ts"
import { Notifications } from "./subscribers/notifications.ts"
import { DelayMail } from "./subscribers/orders.ts"
import { Privacy } from "./subscribers/privacy.ts"
import { Queue } from "./subscribers/queue.ts"
import { Realtime } from "./subscribers/realtime.ts"
import { ReturnLabelRequests, ReturnMails } from "./subscribers/returns.ts"
import { Sheets } from "./subscribers/sheets.ts"
import { Shopify } from "./subscribers/shopify.ts"
import { Backfill } from "./subscribers/stores.ts"
import { Webhooks } from "./subscribers/webhooks.ts"

/*
 * Every sink the relay delivers to, in the order they run on an event's transaction. A new slice's subscriber is one
 * line here. The three parts of the mail sink share its name: each hears its own events.
 */
const SUBSCRIBERS = [
  Notifications,
  Realtime,
  Chat,
  Sheets,
  Queue,
  Facts,
  InvitationMail,
  ReturnMails,
  DelayMail,
  Support,
  Backfill,
  Shopify,
  Marketing,
  Forwarding,
  ReturnLabelRequests,
  Automations,
  Chargebacks,
  Privacy,
  Webhooks,
  Data,
  Analytics
] as const

/** What the sinks need between them: the background layer provides it. */
type SinkServices = ServicesOf<typeof SUBSCRIBERS[number]>

/** One sink's handler for an event type. */
export interface Route {
  readonly sink: string
  readonly run: (
    id: string,
    event: OutboxEvent,
    sql: SqlClient.SqlClient
  ) => Effect.Effect<void, never, SinkServices> | undefined
}

/** The sinks by event type, each type's in the subscribers' order; two of one sink on one type is a mistake. */
const routesOf = (subscribers: ReadonlyArray<Subscriber>): ReadonlyMap<string, ReadonlyArray<Route>> => {
  const routes = new Map<string, Array<Route>>()
  for (const { sink, on } of subscribers) {
    for (const [type, run] of Object.entries(on)) {
      if (run === undefined) continue
      const of = routes.get(type) ?? []
      if (of.some((route) => route.sink === sink)) throw new Error(`relay: two "${sink}" sinks for ${type}`)
      of.push({ sink, run: run as Route["run"] })
      routes.set(type, of)
    }
  }
  return routes
}

/** The sinks an event of this type goes to, in order. */
export const ROUTES = routesOf(SUBSCRIBERS)
