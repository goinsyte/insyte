import type {
  ChargebackDetail,
  ChargebackList,
  ChargebackRow,
  ChargebackStats
} from "@insyte/modules/chargebacks/domain/Chargebacks"
import { iso } from "../shared/time.ts"

/* Chargebacks in the public shape (M13): a case, the tabs' page with the workspace's record, and one case in full. */

const chargebackV1 = (c: ChargebackRow) => ({
  id: c.id,
  case_number: c.caseNumber,
  provider: c.provider,
  from_provider: c.fromProvider,
  status: c.status,
  reason: c.reason,
  reason_code: c.reasonCode,
  amount: { amount_minor: c.amountMinor, currency: c.currency },
  customer: { id: c.customerId, name: c.customerName },
  order: c.orderId === null ? null : { id: c.orderId, number: c.orderNumber },
  store_id: c.storeId,
  deadline_at: iso(c.deadlineAt)!,
  opened_at: iso(c.openedAt)!,
  submitted_at: iso(c.submittedAt),
  outcome_at: iso(c.outcomeAt),
  note: c.note,
  evidence_count: c.evidenceCount
})

const chargebackStatsV1 = (s: ChargebackStats) => ({
  open: s.open,
  won: s.won,
  decided: s.decided,
  won_pct: s.wonPct,
  recovered: { amount_minor: s.recoveredMinor, currency: s.currency }
})

export const chargebackPageV1 = (list: ChargebackList) => ({
  data: list.rows.map(chargebackV1),
  counts: {
    all: list.counts.all,
    action_required: list.counts.actionRequired,
    submitted: list.counts.submitted,
    won: list.counts.won,
    lost: list.counts.lost
  },
  stats: chargebackStatsV1(list.stats)
})

export const chargebackDetailV1 = (d: ChargebackDetail) => ({
  ...chargebackV1(d.chargeback),
  evidence: d.evidence.map((e) => ({
    id: e.id,
    kind: e.kind,
    source: e.source,
    name: e.name,
    size_bytes: e.sizeBytes,
    file_id: e.fileId,
    added_at: iso(e.addedAt)!
  })),
  timeline: d.timeline.map((t) => ({
    id: t.id,
    at: iso(t.at)!,
    kind: t.kind,
    actor: { kind: t.actor.kind, name: t.actor.name },
    data: t.data
  }))
})
