import type { ReturnDetail, ReturnList, ReturnRow } from "@insyte/modules/returns/domain/Returns"
import { iso } from "../shared/time.ts"

/* Returns in the public shape (M9): a return, the queue's page, and one with its lines, window and resolutions. */

export const returnV1 = (r: ReturnRow) => ({
  id: r.id,
  number: r.number,
  kind: r.kind,
  order: { id: r.orderId, number: r.orderNumber },
  store_id: r.storeId,
  customer: { id: r.customerId, name: r.customerName, email: r.customerEmail },
  status: r.status,
  reason: { id: r.reasonId, label: r.reasonLabel },
  note: r.note,
  requested_resolution: r.requested,
  units: r.units,
  amount: { amount_minor: r.amountMinor, currency: r.currency },
  review_by: iso(r.deadline)!,
  late: r.status === "review" && r.deadline < Date.now(),
  resolution: r.resolution === null
    ? null
    : { kind: r.resolution.kind, amount_minor: r.resolution.amountMinor, resolved_at: iso(r.resolution.at)! },
  rejected_reason: r.rejectReason,
  label: r.label !== null
    ? {
      state: "issued",
      carrier: r.label.carrier,
      tracking: r.label.tracking,
      tracking_url: r.label.trackingUrl,
      reason: null
    }
    : r.labelRequest === null
    ? null
    : { state: r.labelRequest.state, carrier: null, tracking: null, tracking_url: null, reason: r.labelRequest.reason },
  created_at: iso(r.createdAt)!
})

/** The queue's page: every return, or those in one status, with the counts of all. */
export const returnPageV1 = (list: ReturnList, status: ReturnRow["status"] | undefined) => ({
  data: list.rows.filter((r) => status === undefined || r.status === status).map(returnV1),
  counts: {
    total: list.counts.total,
    review: list.counts.review,
    late: list.counts.late,
    awaiting: list.counts.awaiting,
    ready: list.counts.ready
  }
})

export const returnDetailV1 = (d: ReturnDetail) => ({
  ...returnV1(d.record),
  lines: d.lines.map((l) => ({
    id: l.id,
    order_line_id: l.orderLineId,
    title: l.title,
    variant_title: l.variantTitle,
    quantity: l.qty,
    condition: l.condition
  })),
  window: { inside: d.window.inside, days: d.window.days, closes_on: iso(d.window.closesOn)! },
  allowed_resolutions: d.allowed.map((a) => ({ kind: a.kind, amount_minor: a.amountMinor }))
})
