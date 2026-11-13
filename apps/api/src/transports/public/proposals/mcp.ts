import { ProposalsTools } from "@insyte/api/mcp/tools/ProposalsTools"
import type { AgentActionId } from "@insyte/domain/AgentActions"
import { Effect, Layer } from "effect"
import { governed, type Plan, token } from "../mcp/Governance.ts"
import { kicker } from "../mcp/Outbox.ts"
import { ProposalsV1 } from "./ProposalsV1.ts"

/** A filed plate's action, as the catalogue action it is. */
const FILED: Record<string, AgentActionId> = {
  approve_return: "ApproveReturn",
  approve_quality_check: "RequestQualityCheck",
  notify_delayed_order: "SendReply",
  create_supplier_ticket: "MessageSupplier",
  cancel_order: "CancelOrder",
  refund_order: "RefundOrder",
  resolve_return: "RefundOrder",
  forward_orders: "ForwardOrder",
  send_return_label: "SendReturnLabel",
  tag_order: "ApplyLabel",
  set_order_note: "AddNote",
  create_ticket: "CreateTicket",
  update_ticket: "SetPriority",
  set_ticket_status: "SetTicketStatus",
  assign_ticket: "AssignTicket",
  comment_on_ticket: "AddNote"
}

export const ProposalsMcp = ProposalsTools.toLayer(Effect.gen(function*() {
  const read = yield* ProposalsV1
  const kicking = yield* kicker
  return {
    get_proposal: ({ proposal_id }) => read.proposal(proposal_id),
    file_proposal: ({ proposal_id, idempotency_key }) =>
      governed(
        "file_proposal",
        idempotency_key,
        Effect.map(read.proposal(proposal_id), (prop): Plan<unknown> => ({
          action: FILED[prop.action.kind] ?? ("Unknown" as AgentActionId),
          storeId: prop.store,
          subject: { type: prop.subject_type, id: prop.subject_id, label: prop.number },
          sentence: `Voorstel ${prop.number} uitgevoerd: ${prop.heading}`,
          // A proposal is a person's to file; an agent files one only where it may do the action itself.
          ask: null,
          effect: token
        })),
        kicking(read.fileProposal(proposal_id, idempotency_key))
      )
  }
})).pipe(Layer.provide(ProposalsV1.layer))
