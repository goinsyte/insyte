import { KeyTools } from "@insyte/api/mcp/tools/KeyTools"
import { Effect, Layer } from "effect"
import { KeyV1 } from "./KeyV1.ts"

export const KeyMcp = KeyTools.toLayer(Effect.gen(function*() {
  const read = yield* KeyV1
  return {
    whoami: () => read.me
  }
})).pipe(Layer.provide(KeyV1.layer))
