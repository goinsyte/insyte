import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { Landing } from "@insyte/modules/members/Landing"
import { Members } from "@insyte/modules/members/Members"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Layer } from "effect"
import { RpcSerialization } from "effect/rpc"
import { LandingHandlers } from "./handlers/landing.ts"
import { MembersHandlers } from "./handlers/members.ts"
import { OnboardingHandlers } from "./handlers/onboarding.ts"
import { SessionHandlers } from "./handlers/session.ts"
import { SystemHandlers } from "./handlers/system.ts"
import { RpcHttp } from "./RpcHttp.ts"

/** The console's RPC transport. */
export const RpcRoutes = RpcHttp(ConsoleRpcs, RPC_PATH)

/**
 * What the RPC route reads per request: the handlers and the serialization. NDJSON on both ends: the console's client
 * uses the same (13 §2). The composition root `provideMerge`s this after the transports (see `RpcHttp`).
 */
export const RpcContext = Layer.mergeAll(
  SystemHandlers,
  SessionHandlers.pipe(Layer.provide(Workspaces.layer)),
  OnboardingHandlers.pipe(
    Layer.provide(Onboarding.layer),
    Layer.provide(Layer.mergeAll(Workspaces.founder, Workspaces.setup))
  ),
  MembersHandlers.pipe(Layer.provide(Members.layer)),
  LandingHandlers.pipe(Layer.provide(Landing.layer))
).pipe(
  Layer.provideMerge(RpcSerialization.layerNdjson)
)
