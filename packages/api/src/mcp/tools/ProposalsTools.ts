import { Schema } from "effect"
import { Tool, Toolkit } from "effect/ai"
import { ActionNotAllowedV1, NotFoundV1, ScopeMissingV1 } from "../../http/Errors.ts"
import { ProposalV1 } from "../../http/groups/ProposalsGroup.ts"
import { asKey, Governed, IdempotencyKey, WriteFailure } from "../Shared.ts"

/* The queue's plates (M19.3): one read, and filed as the key. */

const ProposalId = Schema.String.annotate({
  description: "The plate's id (prp_…), as a list_queue row's proposal gives it."
})

export const GetProposal = Tool.make("get_proposal", {
  description:
    "One plate Insyte drew for a queue row: what it found, the record as it stands and as drawn, the confidence (0–1, computed from the records) with what it rests on, and what filing runs. Needs the read scope of its record.",
  parameters: Schema.Struct({ proposal_id: ProposalId }),
  success: ProposalV1,
  failure: Schema.Union([ScopeMissingV1, NotFoundV1]),
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const FileProposal = Tool.make("file_proposal", {
  description:
    "Files an open plate: the command it carries runs as this key (approve_return needs returns.write and returns.approve; a quality check needs quality.approve; notify_delayed_order mails the shopper the words in after and needs orders.write; create_supplier_ticket needs support.write; assemble_evidence_pack and reconnect_store are not for agents, and reconnect_store needs a person at Shopify). A plate in execution_failed is tried again. Read the plate first and file only what the person you act for would; refused with a conflict when it is no longer open (closed) or its record moved on (stale).",
  parameters: Schema.Struct({ proposal_id: ProposalId, idempotency_key: IdempotencyKey }),
  success: Governed(ProposalV1),
  failure: Schema.Union([...WriteFailure.members, ActionNotAllowedV1]),
  dependencies: asKey()
}).annotate(Tool.Idempotent, true)

export const ProposalsTools = Toolkit.make(
  GetProposal,
  FileProposal
)
