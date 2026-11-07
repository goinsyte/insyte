import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * The Start checklist's tasks per workspace (06 §4, M4.1): what onboarding left for later (skipping the store step writes
 * `store`) and what the operator ticks off, by the checklist's ids (`Onboarding.start`). A task done by the workspace itself (a store connected,
 * a colleague joined) is read from the workspace, not stored here.
 */
export default statements(
  `create table setup_tasks (
     workspace_id text not null references workspaces(id) on delete cascade,
     task         text not null,
     created_at   timestamptz not null default now(),
     done_at      timestamptz,
     done_by      text,
     dismissed_at timestamptz,
     primary key (workspace_id, task)
   )`,
  tenantTable("setup_tasks", { membersOnly: true })
)
