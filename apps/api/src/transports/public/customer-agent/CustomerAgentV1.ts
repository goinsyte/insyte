import { ChannelAgentService } from "@insyte/modules/channel-agent/ChannelAgent"
import type { AgentDay, ChannelAgentView } from "@insyte/modules/channel-agent/domain/ChannelAgent"
import { Context, Effect, Layer } from "effect"
import { scopeMissing } from "../shared/errors.ts"

/* Klantagent (M15 step 8): its settings and its day, as the key the door let in. */

const customerAgentV1 = (v: ChannelAgentView) => ({
  on: v.settings.on,
  channels: v.settings.channels,
  effective: v.effective,
  send_reply: v.sendReply,
  hours: v.settings.hours,
  timezone: v.timezone,
  outside_hours: v.settings.outside,
  handover: {
    unsure: v.settings.handover.unsure,
    asks_person: v.settings.handover.asksPerson,
    topics: v.settings.handover.topics,
    after_messages: v.settings.handover.afterMessages
  },
  tone: v.settings.tone,
  handover_message: v.settings.handoverMessage,
  version: v.settings.version
})

const customerAgentDayV1 = (d: AgentDay) => ({
  conversations: d.conversations,
  handled: d.handled,
  handed_over: d.handedOver,
  waiting: d.waiting,
  first_reply_seconds: d.avgSeconds
})

const make = Effect.gen(function*() {
  const agent = yield* ChannelAgentService
  return {
    settings: agent.getForKey.pipe(Effect.map(customerAgentV1), Effect.catchTag("Forbidden", scopeMissing)),
    today: agent.today.pipe(Effect.map(customerAgentDayV1), Effect.catchTag("Forbidden", scopeMissing))
  }
})

/**
 * Klantagent, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class CustomerAgentV1 extends Context.Service<CustomerAgentV1, Effect.Success<typeof make>>()(
  "api-worker/CustomerAgentV1"
) {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(ChannelAgentService.layer))
}
