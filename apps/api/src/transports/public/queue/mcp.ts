import { QueueTools } from "@insyte/api/mcp/tools/QueueTools"
import { Effect, Layer } from "effect"
import { QueueV1 } from "./QueueV1.ts"

export const QueueMcp = QueueTools.toLayer(Effect.gen(function*() {
  const read = yield* QueueV1
  return {
    list_queue: ({ tab }) => read.queue(tab)
  }
})).pipe(Layer.provide(QueueV1.layer))
