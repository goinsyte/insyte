import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * In-app notifications (M5.2, 06 §4): one row per recipient, written by the relay's notifications sink as `system`,
 * read by the recipient only. Ids and figures in `data`; the console renders the words. Partitioned by month on
 * `created_at` (a default partition until the monthly job lands, M18). A member's in-app switches per kind live in
 * `notification_prefs`; the other channels arrive with M11.
 */
export default statements(
  `create table notifications (
     id             text not null,
     workspace_id   text not null references workspaces(id) on delete cascade,
     recipient_kind text not null check (recipient_kind in ('member', 'supplier_contact', 'affiliate')),
     recipient_id   text not null,
     kind           text not null,
     subject_type   text,
     subject_id     text,
     actor_kind     text,
     actor_id       text,
     data           jsonb not null default '{}',
     created_at     timestamptz not null default now(),
     read_at        timestamptz,
     archived_at    timestamptz,
     snoozed_until  timestamptz,
     primary key (id, created_at)
   ) partition by range (created_at)`,
  "create table notifications_default partition of notifications default",
  `create index notifications_inbox on notifications (workspace_id, recipient_kind, recipient_id, created_at desc)
     where archived_at is null`,
  tenantTable("notifications"),
  `create policy notifications_recipient on notifications as restrictive for all
     using (app_principal_kind() = 'system'
            or (recipient_kind = app_principal_kind() and recipient_id = app_principal_id()))
     with check (app_principal_kind() = 'system'
                 or (recipient_kind = app_principal_kind() and recipient_id = app_principal_id()))`,
  `create table notification_prefs (
     workspace_id text not null references workspaces(id) on delete cascade,
     recipient_id text not null,
     kind         text not null,
     channels     text[] not null,
     primary key (workspace_id, recipient_id, kind)
   )`,
  tenantTable("notification_prefs"),
  `create policy notification_prefs_own on notification_prefs as restrictive for all
     using (app_principal_kind() = 'system' or recipient_id = app_principal_id())
     with check (recipient_id = app_principal_id())`
)
