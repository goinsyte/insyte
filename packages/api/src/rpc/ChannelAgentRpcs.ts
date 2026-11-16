import { Forbidden, Invalid } from "@insyte/domain/Errors"
import { BudgetExceeded, ModelUnavailable } from "@insyte/modules/ai/domain/Ai"
import {
  AgentDay,
  AutoNotAllowedOnChannel,
  ChannelAgentSaved,
  ChannelAgentView,
  CustomerAgentSettingsInput,
  HoursInvalid,
  TestAnswer,
  TestInput
} from "@insyte/modules/channel-agent/domain/ChannelAgent"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Klantagent (M15 step 8; api.md §2.25): the customer agent's settings, its day and the test chat. Instellingen ·
 * Bekijken reads and tries; Beheren saves, and a save that lets the agent say more by itself (switching it on, a
 * channel to Zelf antwoorden, the hours, answering outside them) also needs `ai.autonomy`. Every save has its undo
 * token. The day is Klantenservice · Bekijken's, within the reader's stores. The test sends nothing; its model call
 * counts against the person's own budget.
 */
export class ChannelAgentRpcs extends RpcGroup.make(
  Rpc.make("ChannelAgent.get", { success: ChannelAgentView, error: Forbidden }),
  Rpc.make("ChannelAgent.set", {
    payload: CustomerAgentSettingsInput,
    success: ChannelAgentSaved,
    error: Schema.Union([Forbidden, AutoNotAllowedOnChannel, HoursInvalid, Invalid])
  }),
  Rpc.make("ChannelAgent.today", { success: AgentDay, error: Forbidden }),
  Rpc.make("ChannelAgent.test", {
    payload: TestInput,
    success: TestAnswer,
    error: Schema.Union([Forbidden, BudgetExceeded, ModelUnavailable])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
