import type { ProposalView } from "@insyte/modules/proposals/domain/Proposals"
import { iso } from "../shared/time.ts"

/* A plate in the public shape: what filing it runs, as a kind and its record, and the plate's blocks as their values. */

/** What a plate's filing runs, as a kind and the record it acts on. */
const actionV1 = (a: ProposalView["action"]) => {
  switch (a._tag) {
    case "ApproveReturn":
      return { kind: "approve_return" as const, subject_id: a.returnId }
    case "ApproveQualityCheck":
      return { kind: "approve_quality_check" as const, subject_id: a.checkId }
    case "NotifyDelayedOrder":
      return { kind: "notify_delayed_order" as const, subject_id: a.orderId }
    case "CreateSupplierTicket":
      return { kind: "create_supplier_ticket" as const, subject_id: a.productId }
    case "AssembleEvidencePack":
      return { kind: "assemble_evidence_pack" as const, subject_id: a.chargebackId }
    case "ReconnectStore":
      return { kind: "reconnect_store" as const, subject_id: a.storeId }
    case "CancelOrder":
      return { kind: "cancel_order" as const, subject_id: a.orderId }
    case "RefundOrder":
      return { kind: "refund_order" as const, subject_id: a.orderId }
    case "ResolveReturn":
      return { kind: "resolve_return" as const, subject_id: a.returnId }
    case "ForwardOrder":
      return { kind: "forward_orders" as const, subject_id: a.legIds[0] ?? "" }
    case "SendReturnLabel":
      return { kind: "send_return_label" as const, subject_id: a.returnId }
    case "TagOrder":
      return { kind: "tag_order" as const, subject_id: a.orderId }
    case "SetOrderNote":
      return { kind: "set_order_note" as const, subject_id: a.orderId }
    case "CreateTicket":
      return { kind: "create_ticket" as const, subject_id: a.related?.id ?? "" }
    case "UpdateTicket":
      return { kind: "update_ticket" as const, subject_id: a.ticketId }
    case "SetTicketStatus":
      return { kind: "set_ticket_status" as const, subject_id: a.ticketId }
    case "AssignTicket":
      return { kind: "assign_ticket" as const, subject_id: a.ticketId }
    case "CommentTicket":
      return { kind: "comment_on_ticket" as const, subject_id: a.ticketId }
  }
}

/** A plate in the public shape: the action as a kind and its record, the blocks as their values. */
export const proposalV1 = (p: ProposalView) => ({
  id: p.id,
  number: p.number,
  state: p.state,
  subject_type: p.subjectType,
  subject_id: p.subjectId,
  action: actionV1(p.action),
  revision: p.plate.revision,
  heading: p.plate.heading,
  body: p.plate.body,
  dimension: p.plate.dimension,
  before: p.plate.before.value,
  after: p.plate.after.value,
  store: p.plate.witness,
  confidence: p.plate.confidence,
  confidence_basis: p.plate.confidenceBasis,
  file_label: p.plate.fileLabel,
  why: p.plate.why,
  evidence: p.plate.evidence,
  filed_at: iso(p.filedAt),
  executed_at: iso(p.executedAt),
  execution_error: p.executionError
})
