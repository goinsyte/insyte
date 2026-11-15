import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { ConflictV1, NotFoundV1, RateLimitedV1 } from "../Errors.ts"
import { List } from "../Paging.ts"
import { ById, WriteErrors, Writes } from "../Requests.ts"

/*
 * Vraag Insyte (M15 step 3, W11.1): a question about the workspace answered from what the key may read, and the key's
 * own conversations. The answer only reads: nothing it says is carried out. Every number in it is one of its
 * `figures`, computed by Insyte from the key's stores, never written by the model.
 */

export const AskFigureV1 = Schema.Struct({
  label: Schema.String.annotate({ description: "What the number is, in Dutch: Vertraagde bestellingen." }),
  value: Schema.String.annotate({ description: "As the answer shows it: 3, € 1.240,00, 92%." }),
  path: Schema.String.annotate({ description: "The console page that holds its rows." })
}).annotate({ identifier: "AskFigure" })

export const AskRecordV1 = Schema.Struct({
  kind: Schema.String.annotate({ description: "order, ticket, chargeback, customer, supplier, store or return." }),
  label: Schema.String,
  path: Schema.String.annotate({ description: "The console page that opens it." })
}).annotate({ identifier: "AskRecord" })

export const AskTurnV1 = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  state: Schema.Literals(["streaming", "settled", "failed"]),
  failure: Schema.NullOr(Schema.String).annotate({
    description: "Why an answer did not come: budget, model, rate, interrupted; limit when it settled with what it had."
  }),
  text: Schema.String.annotate({
    description: "The question, or the answer's words with its figures and records in place."
  }),
  figures: Schema.Array(AskFigureV1),
  records: Schema.Array(AskRecordV1),
  sources: Schema.Array(Schema.Struct({ kind: Schema.String, title: Schema.String, path: Schema.String })),
  follow_ups: Schema.Array(Schema.String),
  withheld: Schema.Boolean.annotate({
    description: "The answer read from a store this key no longer reaches, and is not given back."
  }),
  created_at: Schema.String
}).annotate({ identifier: "AskTurn" })

export const AskAnswerV1 = Schema.Struct({
  thread_id: Schema.String,
  title: Schema.String,
  question: AskTurnV1,
  answer: AskTurnV1
}).annotate({ identifier: "AskAnswer" })

export const AskThreadRowV1 = Schema.Struct({ id: Schema.String, title: Schema.String, last_turn_at: Schema.String })
  .annotate({ identifier: "AskThreadRow" })

export const AskThreadV1 = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  last_turn_at: Schema.String,
  turns: Schema.Array(AskTurnV1)
}).annotate({ identifier: "AskThread" })

export const AskQuestionV1 = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4000))

export class AskGroup extends HttpApiGroup.make("ask")
  .add(
    HttpApiEndpoint.post("ask", "/ask", {
      headers: Writes,
      payload: Schema.Struct({
        question: AskQuestionV1,
        thread_id: Schema.optional(Schema.String).annotate({
          description: "A conversation of this key's to ask on; absent, a new one, titled by the question."
        })
      }),
      success: AskAnswerV1,
      error: [...WriteErrors, RateLimitedV1]
    }).annotate(
      OpenApi.Description,
      "Asks Vraag Insyte a question about the workspace and answers when it has settled. It reads only what this key's scopes and stores may (orders, tickets, chargebacks, the queue, Analyse and the month figures), counts against the workspace's AI budget, and changes nothing. A spent budget or a model that did not answer settles the answer as `failed`. An agent's key asks over MCP (`ask_insyte`). Needs no scope of its own; each read needs the scope it would on its own."
    ),
    HttpApiEndpoint.get("threads", "/ask/threads", { success: List(AskThreadRowV1) }).annotate(
      OpenApi.Description,
      "This key's conversations with Vraag Insyte, the latest first, up to 50. Needs no scope: they are the key's own."
    ),
    HttpApiEndpoint.get("thread", "/ask/threads/:id", {
      params: ById,
      success: AskThreadV1,
      error: [NotFoundV1, ConflictV1]
    }).annotate(
      OpenApi.Description,
      "One of this key's conversations, every question and answer in order. Needs no scope: it is the key's own. An answer that read a store the key no longer reaches is withheld."
    )
  )
  .annotate(OpenApi.Title, "Vraag Insyte")
{}
