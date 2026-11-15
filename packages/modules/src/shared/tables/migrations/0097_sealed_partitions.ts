import { sealedPartition } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The partitions of the partitioned tenant tables, closed to direct use (security cleanup, W11.0). Each parent is
 * behind the workspace policy (`tenantTable`), but its default partition was made with row level security off, so
 * `insyte_app` naming `audit_events_default` (or the others) read and wrote every workspace's rows, past the parent's
 * policies and past the audit log's revoked update and delete. Now each partition has row level security on and
 * forced with no policy: direct use sees nothing and writes nothing. Through the parent nothing changes, since a query
 * on a partitioned table is held to the parent's policies only. `sealedPartition` is what a partition made later gets.
 */
export default statements(
  ...["audit_events_default", "notifications_default", "automation_run_steps_default", "agent_actions_default"].map(
    sealedPartition
  )
)
