import { TeamTools } from "@insyte/api/mcp/tools/TeamTools"
import { Effect, Layer } from "effect"
import { TeamV1 } from "./TeamV1.ts"

export const TeamMcp = TeamTools.toLayer(Effect.gen(function*() {
  const read = yield* TeamV1
  return {
    list_members: () => read.members,
    list_roles: () => read.roles
  }
})).pipe(Layer.provide(TeamV1.layer))
