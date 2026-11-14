import { Db } from "@insyte/database/Db"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect, Option, Schema } from "effect"
import { Relay } from "../../shared/domain/Outbox.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { BillingProvider, type StripeEvent, type SubscriptionSnapshot } from "../domain/Ports.ts"
import { writeInvoice, writeSubscription } from "./state.ts"

/*
 * Stripe's webhooks (M13 step 1): `customer.subscription.*`, `invoice.*` and `checkout.session.completed`, on the API's
 * public hostname. The raw bytes are verified against the stage's signing secret before anything is parsed (a bad or
 * stale signature is 400, as Stripe's own libraries answer). The event's id is the dedupe key (`inbound_events`,
 * provider `stripe`): it is written and applied on one transaction, so a delivery Stripe sends again is applied once,
 * and one that failed to apply is not recorded and is applied when Stripe retries. The subscription is read again from
 * Stripe where it can be (the event may be old by the time it arrives); otherwise the event's own copy is applied
 * unless a newer event already was. A change is told as `billing.changed`; seats follow `subscriptions.extra_seats`.
 */

export interface Delivery {
  readonly body: Uint8Array
  readonly signature: string
}

export type Received = { readonly status: 200 | 400 }

const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)))

const customerOf = (event: StripeEvent): { customer: string; workspace: string | null } | undefined => {
  switch (event.kind) {
    case "subscription":
      return { customer: event.subscription.customerId, workspace: event.subscription.workspaceId }
    case "invoice":
      return { customer: event.invoice.customerId, workspace: null }
    case "checkout":
      return { customer: event.customerId, workspace: event.workspaceId }
    case "other":
      return undefined
  }
}

export const receive = Effect.fn("Billing.webhooks.receive")(function*(delivery: Delivery) {
  const provider = yield* BillingProvider
  if (!(yield* provider.verifyWebhook(delivery.body, delivery.signature, new Date()))) {
    return { status: 400 } satisfies Received
  }
  const body = decodeJson(new TextDecoder().decode(delivery.body))
  if (Option.isNone(body)) return { status: 400 } satisfies Received
  const event = yield* provider.readEvent(body.value)
  if (event === undefined) return { status: 400 } satisfies Received
  const of = customerOf(event)
  // An event Insyte does not act on: acknowledged, so Stripe stops sending it.
  if (of === undefined) return { status: 200 } satisfies Received
  const db = yield* Db
  const [route] = yield* db.routing((sql) =>
    sql<{ workspaceId: WorkspaceId }>`select workspace_id from billing_route(${of.customer}, ${of.workspace ?? ""})`
  )
  if (route === undefined) {
    yield* Effect.logInfo("stripe webhook for an unknown customer", { type: event.type })
    return { status: 200 } satisfies Received
  }
  // Read again from Stripe, outside the transaction: what it is now, written as of now.
  const subscriptionId = event.kind === "subscription"
    ? event.subscription.subscriptionId
    : event.kind === "checkout"
    ? event.subscriptionId
    : null
  const fresh = subscriptionId === null ? undefined : yield* provider.subscription(subscriptionId).pipe(
    Effect.catchTag("BillingUnavailable", (e) =>
      // Stripe did not answer: refused, so Stripe sends it again.
      Effect.logWarning("stripe subscription not read again", { reason: e.reason }).pipe(Effect.as(null)))
  )
  if (fresh === null) return { status: 400 } satisfies Received
  const subscription: { readonly s: SubscriptionSnapshot; readonly at: Date } | undefined = fresh !== undefined
    ? { s: fresh, at: new Date() }
    : event.kind === "subscription"
    ? { s: event.subscription, at: event.created }
    : undefined
  const kicked = yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      const [written] = yield* sql<{ id: string }>`
        insert into inbound_events (id, workspace_id, provider, delivery_id, topic, account_ref, processed_at)
        values (${mintId("inb")}, ${route.workspaceId}, 'stripe', ${event.id}, ${event.type}, ${of.customer}, now())
        on conflict (provider, delivery_id) do nothing
        returning id`
      // Delivered before: the first one was applied.
      if (written === undefined) return []
      if (event.kind === "invoice") yield* writeInvoice(sql, route.workspaceId, event.invoice, event.created)
      if (subscription === undefined) return []
      const [before] = yield* sql<{ status: string | null; startedBy: string | null }>`
        select status, started_by from subscriptions`
      const changed = yield* writeSubscription(sql, route.workspaceId, subscription.s, subscription.at)
      if (!changed) return []
      return [
        yield* Outbox.write(sql, route.workspaceId, {
          type: "billing.changed",
          workspaceId: route.workspaceId,
          userId: before?.startedBy ?? null,
          status: subscription.s.status,
          plan: subscription.s.plan,
          cycle: subscription.s.cycle,
          started: (before?.status ?? null) === null && subscription.s.status === "active"
        })
      ]
    })
  ).pipe(Effect.provideService(CurrentWorkspace, { id: route.workspaceId }))
  if (kicked.length > 0) yield* (yield* Relay).kick(kicked)
  return { status: 200 } satisfies Received
})
