import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Notifications beyond the app (M11 step 13.5): what a member hears, where and when.
 *
 * - `notification_prefs.only_mine`: "Alleen als het mij betreft" per kind, beside its channels.
 * - `notification_settings`: one row per member once they save the page: quiet hours (in the workspace's timezone),
 *   the daily digest and its hour, the follow rules and the Slack channel. No row is the design's defaults.
 * - `notification_deliveries`: one row per note per channel outside the app (e-mail now; push and Slack once their
 *   adapters land), with the note's facts so it can be sent though the in-app switch is off. `not_before` is when it may
 *   go: now, or the end of the member's quiet hours. The relay's sink sends what is due on its own transaction, the
 *   minute sweep what quiet hours or a failed try held back.
 * - `digests`: the daily overview, once per member per local day.
 *
 * Deliveries and digests are written as `system`; a member reads their own.
 */
export default statements(
  "alter table notification_prefs add column only_mine boolean not null default false",
  `create table notification_settings (
     workspace_id    text not null references workspaces(id) on delete cascade,
     recipient_id    text not null,
     quiet_on        boolean not null default true,
     quiet_from      text not null default '22:00' check (quiet_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
     quiet_to        text not null default '07:00' check (quiet_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
     quiet_weekend   boolean not null default false,
     digest_on       boolean not null default true,
     digest_at       text not null default '08:00' check (digest_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
     follow_assigned boolean not null default true,
     follow_mentioned boolean not null default true,
     follow_created  boolean not null default true,
     slack_channel   text,
     updated_at      timestamptz not null default now(),
     primary key (workspace_id, recipient_id),
     check (not quiet_on or quiet_from <> quiet_to)
   )`,
  tenantTable("notification_settings"),
  `create policy notification_settings_own on notification_settings as restrictive for all
     using (app_principal_kind() = 'system' or recipient_id = app_principal_id())
     with check (app_principal_kind() = 'system' or recipient_id = app_principal_id())`,
  `create table notification_deliveries (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     recipient_id    text not null,
     notification_id text,
     channel         text not null check (channel in ('email', 'push', 'slack')),
     kind            text not null,
     subject_type    text,
     subject_id      text,
     actor_id        text,
     data            jsonb not null default '{}',
     state           text not null default 'pending' check (state in ('pending', 'sent', 'failed', 'skipped')),
     not_before      timestamptz not null default now(),
     attempts        int not null default 0,
     error           text,
     created_at      timestamptz not null default now(),
     sent_at         timestamptz
   )`,
  "create index notification_deliveries_due on notification_deliveries (workspace_id, not_before) where state = 'pending'",
  "create index notification_deliveries_recipient on notification_deliveries (workspace_id, recipient_id, created_at desc)",
  tenantTable("notification_deliveries"),
  `create policy notification_deliveries_own on notification_deliveries as restrictive for all
     using (app_principal_kind() = 'system' or recipient_id = app_principal_id())
     with check (app_principal_kind() = 'system')`,
  `create table digests (
     workspace_id text not null references workspaces(id) on delete cascade,
     recipient_id text not null,
     day          date not null,
     notes        int not null,
     sent_at      timestamptz,
     created_at   timestamptz not null default now(),
     primary key (workspace_id, recipient_id, day)
   )`,
  tenantTable("digests"),
  `create policy digests_own on digests as restrictive for all
     using (app_principal_kind() = 'system' or recipient_id = app_principal_id())
     with check (app_principal_kind() = 'system')`,
  /*
   * The sweeps' workspaces, ids only: those with a delivery due (the minute sweep), and those with an active member
   * (the digest's quarter-hour turn, which decides per member whether their hour has come).
   */
  `create function notify_due_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct d.workspace_id from notification_deliveries d
                    where d.state = 'pending' and d.not_before <= now();
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function notify_due_workspaces() from public",
  "grant execute on function notify_due_workspaces() to insyte_app",
  `create function digest_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select w.id from workspaces w
                    where w.deleted_at is null
                      and exists (select 1 from members m where m.workspace_id = w.id
                                  and m.deactivated_at is null and m.removed_at is null);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function digest_workspaces() from public",
  "grant execute on function digest_workspaces() to insyte_app"
)
