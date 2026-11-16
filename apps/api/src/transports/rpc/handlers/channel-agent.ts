import { ChannelAgentRpcs } from "@insyte/api/rpc/ChannelAgentRpcs"
import { ChannelAgentService } from "@insyte/modules/channel-agent/ChannelAgent"
import { Effect } from "effect"
import { SqlError } from "effect/sql"
import type * as CustomerAgent from "../../../platform/CustomerAgent.ts"

let platform: Promise<typeof CustomerAgent> | undefined

/** The test chat's model and search, loaded with the first test an isolate sees (as every AI call, ADR-0041 §3). */
const load = Effect.promise(() =>
  platform ??= import("../../../platform/CustomerAgent.ts").catch((error: unknown) => {
    platform = undefined
    throw error
  })
)

export const ChannelAgentHandlers = ChannelAgentRpcs.toLayer(Effect.gen(function*() {
  const agent = yield* ChannelAgentService
  return ChannelAgentRpcs.of({
    "ChannelAgent.get": () => agent.get,
    "ChannelAgent.set": (input) => agent.set(input),
    "ChannelAgent.today": () => agent.today,
    "ChannelAgent.test": (input) =>
      Effect.flatMap(load, (m) => m.tryChat(input)).pipe(Effect.catchIf(SqlError.isSqlError, Effect.die))
  })
}))
