import { ConnectionsTools } from "@insyte/api/mcp/tools/ConnectionsTools"
import { Effect, Layer } from "effect"
import { ConnectionsV1 } from "./ConnectionsV1.ts"

export const ConnectionsMcp = ConnectionsTools.toLayer(Effect.gen(function*() {
  const read = yield* ConnectionsV1
  return { get_connection_health: () => read.health() }
})).pipe(Layer.provide(ConnectionsV1.layer))
