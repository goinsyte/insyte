import type { QueueList } from "@insyte/modules/queue/domain/Queue"
import { proposalV1 } from "../proposals/present.ts"
import { iso } from "../shared/time.ts"

/* The queue in the public shape: each row with the plate drawn for it while it is open, and each tab's count. */

export const queuePageV1 = (list: QueueList) => ({
  data: list.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    subject_type: r.subjectType,
    subject_id: r.subjectId,
    store: r.storeName,
    signal: r.signal,
    title: r.title,
    value_minor: r.valueMinor,
    currency: r.currency,
    due_at: iso(r.dueAt),
    state: r.state,
    proposal: r.proposal === null ? null : proposalV1(r.proposal)
  })),
  counts: { needs_you: list.counts.needsYou, drawn: list.counts.drawn, all: list.counts.all }
})
