import { ConsoleRpcs, RPC_PATH } from "@insyte/api/ConsoleRpcs"
import { Access } from "@insyte/modules/access/Access"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Landing } from "@insyte/modules/members/Landing"
import { Members } from "@insyte/modules/members/Members"
import { Onboarding } from "@insyte/modules/onboarding/Onboarding"
import { RolesService } from "@insyte/modules/roles/RolesService"
import { Workspaces } from "@insyte/modules/workspaces/Workspaces"
import { Layer } from "effect"
import { RpcSerialization } from "effect/rpc"
import { AccessHandlers } from "./handlers/access.ts"
import { DeveloperHandlers } from "./handlers/developer.ts"
import { LandingHandlers } from "./handlers/landing.ts"
import { MembersHandlers } from "./handlers/members.ts"
import { OnboardingHandlers } from "./handlers/onboarding.ts"
import { RolesHandlers } from "./handlers/roles.ts"
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
  LandingHandlers.pipe(Layer.provide(Landing.layer)),
  AccessHandlers.pipe(Layer.provide(Access.layer)),
  RolesHandlers.pipe(Layer.provide(RolesService.layer)),
  DeveloperHandlers.pipe(Layer.provide(ApiKeys.layer))
).pipe(
  Layer.provideMerge(RpcSerialization.layerNdjson)
)
