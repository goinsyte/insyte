import { Health, SystemRpcs } from "@insyte/api/rpc/SystemRpcs"
import { Effect } from "effect"
import { AppInfo } from "../../../platform/Bindings.ts"

export const SystemHandlers = SystemRpcs.toLayer(Effect.gen(function*() {
  const info = yield* AppInfo
  return SystemRpcs.of({
    "System.health": () => Effect.succeed(new Health(info))
  })
}))
