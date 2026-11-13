import {
  expire as expireDeliveries,
  fanOut as webhookFanOut,
  isWebhookSource,
  rearm as rearmDeliveries
} from "@insyte/modules/developer/use-cases/deliveries"
import { Effect } from "effect"
import { onEvery, subscriber } from "../Subscriber.ts"

/** Every minute: webhook deliveries whose run never started or died, re-armed (M19.4); `at` is the cron's time. */
export const webhooksRearm = Effect.fn("Relay.webhooksRearm")(function*(at: Date) {
  return yield* rearmDeliveries(at)
}, Effect.orDie)

/** Every 15 minutes: webhook deliveries past their 30 days, in every workspace (M19.4). */
export const webhooksSweep = Effect.fn("Relay.webhooksSweep")(function*() {
  return yield* expireDeliveries()
}, Effect.orDie)

export const Webhooks = subscriber(
  "webhooks",
  // The public events a fact is (M19.4): a delivery per subscribed endpoint; `deliver` starts their runs after commit.
  onEvery((id, event, sql) =>
    isWebhookSource(event) ? webhookFanOut(sql, id, event).pipe(Effect.asVoid, Effect.orDie) : undefined
  )
)
