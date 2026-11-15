import { SearchResult } from "@insyte/modules/knowledge/domain/Knowledge"
import { KnowledgeService } from "@insyte/modules/knowledge/Knowledge"
import { Context, Effect, Layer } from "effect"
import { withEmbedder } from "../../../platform/Embeddings.ts"
import { notFound, scopeMissing } from "../shared/errors.ts"
import { articleListV1, articleV1, searchV1 } from "./present.ts"

/* Kennisbank (M15 step 7): the published chapters, one with its text, and the search, as the key the door let in. */

const make = Effect.gen(function*() {
  const knowledge = yield* KnowledgeService
  return {
    articles: knowledge.published(null).pipe(
      Effect.map(articleListV1),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    article: (id: string) =>
      knowledge.published(id).pipe(
        Effect.flatMap((
          [p]
        ) => (p === undefined ? notFound({ entity: "knowledge_article" }) : Effect.succeed(articleV1(p)))),
        Effect.catchTag("Forbidden", scopeMissing)
      ),
    search: (
      input: {
        readonly query: string
        readonly audience?: "customer_agent" | "assistant" | "any" | undefined
        readonly limit?: number | undefined
      }
    ) => {
      const query = input.query.trim().slice(0, 2000)
      const limit = Math.min(Math.max(Math.trunc(input.limit ?? 3), 1), 10)
      return (query === ""
        ? Effect.succeed(searchV1(new SearchResult({ hits: [], mode: "text" })))
        : withEmbedder(knowledge.search({ query, audience: input.audience ?? "customer_agent", limit })).pipe(
          Effect.map(searchV1)
        )).pipe(Effect.catchTag("Forbidden", scopeMissing))
    }
  }
})

/**
 * Kennisbank, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class KnowledgeV1 extends Context.Service<KnowledgeV1, Effect.Success<typeof make>>()("api-worker/KnowledgeV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(KnowledgeService.layer))
}
