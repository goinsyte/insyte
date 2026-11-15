import { AskToolkit } from "@insyte/api/mcp/tools/AskTools"
import { Effect, Layer } from "effect"
import { AskV1 } from "./AskV1.ts"

export const AskMcp = AskToolkit.toLayer(Effect.gen(function*() {
  const act = yield* AskV1
  return {
    ask_insyte: ({ question, thread_id, idempotency_key }) =>
      act.ask({ question, ...(thread_id === undefined ? {} : { thread_id }) }, idempotency_key)
  }
})).pipe(Layer.provide(AskV1.layer))
