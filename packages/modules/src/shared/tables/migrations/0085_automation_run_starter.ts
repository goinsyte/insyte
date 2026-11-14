import { statements } from "../statements.ts"

/*
 * Who started a run by hand ("Uitvoeren", `/v1`, MCP, "Opnieuw"), and what they could refund themselves when they did
 * (W2.1): a flow's "Terugbetalen" never refunds more than its owner, its version's publisher, or the one who started
 * the run may refund, nor in a store one of them cannot reach. A run a trigger started has no starter (`started_by`
 * null).
 *
 * - `started_by`: the member's or key's id.
 * - `starter_refund_minor`: their refund limit per order then, in the workspace's minor units; 0 when they could not
 *   refund at all, null when their role sets no limit.
 * - `starter_stores`: the stores they reached then; null for every store.
 */
export default statements(
  `alter table automation_runs add column started_by text,
     add column starter_refund_minor bigint,
     add column starter_stores text[]`
)
