import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { QueuePageV1, QueueTabV1 } from "../../http/groups/QueueGroup.ts"
import { asKey } from "../Shared.ts"

/* What needs the team on Start (M19.3). */

export const ListQueue = Tool.make("list_queue", {
  description:
    "What needs the team on Start, ranked by how soon: delayed orders, returns waiting for review, quality checks sent in, sold-out variants, stores without their link. tab needs_you (default: red or amber), drawn, or all (with what was seen in the last day).",
  parameters: Schema.Struct({ tab: Schema.optional(QueueTabV1) }),
  success: QueuePageV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const QueueTools = Toolkit.make(
  ListQueue
)
