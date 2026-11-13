import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The Marketplace (M17 step 3). The catalogue is code (`@insyte/domain/Marketplace`); what a workspace did with it is
 * here.
 *
 * - `app_installs`: one row per app a workspace installed: who, when, when it was last opened, the scopes taken back
 *   from it, and for a recipe app the API key made for it. Uninstalling stamps `removed_at`, so its Undo can put the
 *   row back; one live row per app.
 * - `app_feedback`: what a member wrote to the Marketplace team ("Feedback sturen").
 */
export default statements(
  `create table app_installs (
     id             text primary key,
     workspace_id   text not null references workspaces(id) on delete cascade,
     app_id         text not null,
     installed_by   text,
     installed_at   timestamptz not null default now(),
     last_opened_at timestamptz,
     revoked_scopes text[] not null default '{}',
     api_key_id     text references api_keys(id),
     removed_at     timestamptz,
     removed_by     text
   )`,
  "create unique index app_installs_live on app_installs (workspace_id, app_id) where removed_at is null",
  "create index app_installs_workspace on app_installs (workspace_id, installed_at)",
  tenantTable("app_installs", { membersOnly: true }),
  `create table app_feedback (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     member_id    text not null,
     category     text not null check (category in ('suggest', 'broken', 'listing', 'other')),
     message      text not null check (length(message) between 1 and 4000),
     created_at   timestamptz not null default now()
   )`,
  "create index app_feedback_workspace on app_feedback (workspace_id, created_at)",
  tenantTable("app_feedback", { membersOnly: true })
)
