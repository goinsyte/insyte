import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Marketing syncs (M7.5). An OAuth flow with PKCE (Klaviyo) keeps its verifier with its state, for the callback only.
 * A sync is one operator's "Synchroniseren naar Klaviyo": the customers picked, the list (by id, or by name until it
 * is made), whether tags go along; it waits out the undo window (`waiting`), then is sent once (`sent`, with Klaviyo's
 * import job and the counts) or `failed`. Undo inside the window makes it `undone`.
 */
export default statements(
  "alter table oauth_states add column code_verifier text",
  `create table marketing_syncs (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     connection_id text not null references connections(id) on delete cascade,
     provider      text not null check (provider in ('klaviyo')),
     list_id       text,
     list_name     text not null,
     customer_ids  text[] not null,
     with_tags     boolean not null default true,
     state         text not null default 'waiting' check (state in ('waiting', 'sent', 'failed', 'undone')),
     counts        jsonb not null default '{}',
     job_id        text,
     error         text,
     created_by    text not null,
     created_at    timestamptz not null default now(),
     sent_at       timestamptz
   )`,
  "create index marketing_syncs_workspace on marketing_syncs (workspace_id, created_at desc)",
  "create index marketing_syncs_customers on marketing_syncs using gin (customer_ids)",
  tenantTable("marketing_syncs", { membersOnly: true })
)
