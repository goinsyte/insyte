import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { KnowledgeV1 } from "./KnowledgeV1.ts"

export const KnowledgeHttp = HttpApiBuilder.group(
  PublicApi,
  "knowledge",
  (handlers) =>
    Effect.map(
      Effect.service(KnowledgeV1),
      (read) =>
        handlers
          .handle("list", () => read.articles)
          .handle("get", ({ params }) => read.article(params.id))
    )
).pipe(Layer.provide(KnowledgeV1.layer))
