import { KnowledgeTools } from "@insyte/api/mcp/tools/KnowledgeTools"
import { Effect, Layer } from "effect"
import { KnowledgeV1 } from "./KnowledgeV1.ts"

export const KnowledgeMcp = KnowledgeTools.toLayer(Effect.gen(function*() {
  const read = yield* KnowledgeV1
  return {
    list_knowledge: () => read.articles,
    search_knowledge: (input) => read.search(input)
  }
})).pipe(Layer.provide(KnowledgeV1.layer))
