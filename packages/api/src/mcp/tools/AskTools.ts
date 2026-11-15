import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { RateLimitedV1 } from "../../http/Errors.ts"
import { AskAnswerV1, AskQuestionV1 } from "../../http/groups/AskGroup.ts"
import { asKey, IdempotencyKey, WriteFailure } from "../Shared.ts"

/* Vraag Insyte (M15 step 3, W11.1): a question answered from what the key may read. */

export const AskInsyte = Tool.make("ask_insyte", {
  description:
    "Ask Insyte a question about this workspace in Dutch or English, as a person on the team would in the console: what waits, which orders are late, which chargebacks need evidence, how this month compares. It reads only what this key may, counts against the workspace's AI budget, and changes nothing. Every number in the answer is one of its figures. thread_id asks on in an earlier conversation.",
  parameters: Schema.Struct({
    question: AskQuestionV1,
    thread_id: Schema.optional(Schema.String),
    idempotency_key: IdempotencyKey
  }),
  success: AskAnswerV1,
  failure: Schema.Union([...WriteFailure.members, RateLimitedV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const AskToolkit = Toolkit.make(
  AskInsyte
)
