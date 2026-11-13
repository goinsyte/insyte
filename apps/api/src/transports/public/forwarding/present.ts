import type { LegList, LegRow } from "@insyte/modules/forwarding/domain/Forwarding"
import type { StatementList } from "@insyte/modules/suppliers/domain/Statements"
import type { SupplierList } from "@insyte/modules/suppliers/domain/Suppliers"
import { iso } from "../shared/time.ts"

/* Forwarding in the public shape (M8.2, M13 step 6): a leg and the queue's page, the suppliers, their statements. */

export const legV1 = (l: LegRow) => ({
  id: l.id,
  order: { id: l.orderId, number: l.orderNumber },
  store_id: l.storeId,
  supplier: l.supplier,
  from_supplier: l.fromSupplier,
  lines: l.lines.map((x) => ({ title: x.title, variant_title: x.variantTitle, quantity: x.quantity })),
  state: l.state,
  via: l.via,
  since: iso(l.since)!,
  confirm_by: iso(l.confirmBy),
  late: l.late,
  error: l.errorKind === null ? null : { kind: l.errorKind, note: l.errorNote }
})

export const legPageV1 = (list: LegList) => ({
  data: list.rows.map(legV1),
  counts: {
    to_forward: list.counts.toForward,
    awaiting: list.counts.awaiting,
    late: list.counts.late,
    error: list.counts.error
  }
})

export const suppliersV1 = (list: SupplierList) => ({
  data: list.rows.map((r) => ({
    id: r.id,
    name: r.name,
    paused: r.pausedAt !== null,
    forward_channel: r.forwardChannel,
    auto_forward: r.autoForward,
    contact_email: r.contactEmail,
    stats: { products: r.stats.products, open: r.stats.open, delayed: r.stats.delayed }
  }))
})

export const statementsV1 = (list: StatementList) => ({
  supplier: list.supplier,
  data: list.rows.map((r) => ({
    id: r.id,
    month: r.month,
    status: r.status,
    currency: r.currency,
    shipped_minor: r.shippedMinor,
    corrections_minor: r.correctionsMinor,
    total_minor: r.totalMinor,
    shipped_lines: r.shippedLines,
    missing_lines: r.missingLines,
    pay_day: r.payDay,
    closed_at: iso(r.closedAt),
    paid_at: iso(r.paidAt),
    paid_reference: r.paidReference
  })),
  summary: {
    currency: list.summary.currency,
    paid_ytd_minor: list.summary.paidYtdMinor,
    pay_day: list.summary.payDay
  }
})
