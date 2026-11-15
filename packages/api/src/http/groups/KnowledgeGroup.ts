import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { NotFoundV1, ScopeMissingV1 } from "../Errors.ts"
import { ById } from "../Requests.ts"

/* Kennisbank: the workspace's published chapters, as its agents read them. */

const Audience = Schema.Literals(["customer_agent", "assistant", "both"]).annotate({
  description:
    "Who reads it: the customer agent (answers to customers), the assistant (Vraag Insyte, for the team), or both."
})

export const KnowledgeArticleSummaryV1 = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  audience: Audience,
  store_id: Schema.NullOr(Schema.String).annotate({ description: "The store it is for; `null` for every store." }),
  version: Schema.Int.annotate({ description: "The published version." }),
  length: Schema.Int.annotate({ description: "The published text's length in characters." }),
  published_at: Schema.String
}).annotate({ identifier: "KnowledgeArticleSummary" })

export const KnowledgeArticleListV1 = Schema.Struct({ data: Schema.Array(KnowledgeArticleSummaryV1) }).annotate({
  identifier: "KnowledgeArticleList"
})

export const KnowledgeArticleV1 = Schema.Struct({
  ...KnowledgeArticleSummaryV1.fields,
  body: Schema.String.annotate({ description: "The published text, in Markdown." })
}).annotate({ identifier: "KnowledgeArticle" })

export class KnowledgeGroup extends HttpApiGroup.make("knowledge")
  .add(
    HttpApiEndpoint.get("list", "/knowledge_articles", {
      success: KnowledgeArticleListV1,
      error: [ScopeMissingV1]
    }).annotate(
      OpenApi.Description,
      "Kennisbank: the published chapters, by title. A draft, a change not yet published and an archived chapter are never here. Needs `support.read`."
    ),
    HttpApiEndpoint.get("get", "/knowledge_articles/:id", {
      params: ById,
      success: KnowledgeArticleV1,
      error: [ScopeMissingV1, NotFoundV1]
    }).annotate(
      OpenApi.Description,
      "One published chapter with its published text. A chapter never published, archived, or for a store the key does not reach is not found. Needs `support.read`."
    )
  )
  .annotate(OpenApi.Title, "Knowledge")
{}
