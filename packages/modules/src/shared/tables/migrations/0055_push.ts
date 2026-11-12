import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Notifications beyond the app, part b (M11 step 13.5): web push and the answer to a notification mail.
 *
 * - `push_subscriptions`: one row per browser a member allowed push on, its endpoint and the keys its messages are
 *   encrypted to (RFC 8291). A member reads and writes their own; the sweep sends as `system`. An endpoint belongs to
 *   one member at a time, across workspaces: the browser was handed to someone else when another member subscribes it
 *   (`claim_push_endpoint`), so the first never reaches the second's screen. The push service saying the endpoint is
 *   gone (404, 410) removes the row.
 * - `notification_deliveries.reply_token`: a notification mail about a record that takes comments is answered to
 *   `reply+<token>@<inbound domain>`; the `email()` handler finds the delivery by it (`notification_reply`), across
 *   workspaces and before it knows which one, and the answer becomes the member's comment on the record.
 * - Routing reads for the security-definer functions, which run as `insyte_owner` and so see no workspace's rows
 *   through the `_ws` policies: `claim_push_endpoint`, `notification_reply`, and 13.5a's `notify_due_workspaces` and
 *   `digest_workspaces` (0052), which found nothing outside the worker tests until now.
 * - `digest_workspaces(at)`: only the workspaces with a member whose digest is due at the sweep's time (a weekday in
 *   the workspace's timezone, past their hour, none sent that day), the test `digestDue` makes per member, so the
 *   fifteen-minute sweep visits the few that have one instead of every workspace. Beside 0052's `digest_workspaces()`,
 *   which nothing calls any more; dropping it is a contract migration's.
 */
export default statements(
  `create table push_subscriptions (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     recipient_id  text not null,
     endpoint      text not null check (endpoint ~ '^https://'),
     endpoint_hash text not null,
     p256dh        text not null,
     auth          text not null,
     label         text not null default '',
     created_at    timestamptz not null default now(),
     last_sent_at  timestamptz
   )`,
  "create unique index push_subscriptions_endpoint on push_subscriptions (endpoint_hash)",
  "create index push_subscriptions_recipient on push_subscriptions (workspace_id, recipient_id, created_at)",
  tenantTable("push_subscriptions", { membersOnly: true }),
  "create policy push_subscriptions_routing on push_subscriptions as permissive for select to insyte_owner using (true)",
  "create policy push_subscriptions_claim on push_subscriptions as permissive for delete to insyte_owner using (true)",
  "create policy notification_deliveries_routing on notification_deliveries as permissive for select to insyte_owner using (true)",
  "create policy workspaces_routing on workspaces as permissive for select to insyte_owner using (true)",
  "create policy members_routing on members as permissive for select to insyte_owner using (true)",
  "create policy notification_settings_routing on notification_settings as permissive for select to insyte_owner using (true)",
  "create policy digests_routing on digests as permissive for select to insyte_owner using (true)",
  `create function digest_workspaces(due_at timestamptz) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select w.id from workspaces w
                    cross join lateral (select due_at at time zone w.timezone as local) h
                    where w.deleted_at is null
                      and extract(isodow from h.local) between 1 and 5
                      and exists (select 1 from members m
                                  left join notification_settings s on s.recipient_id = m.id
                                  where m.workspace_id = w.id and m.deactivated_at is null and m.removed_at is null
                                    and coalesce(s.digest_on, true)
                                    and to_char(h.local, 'HH24:MI') >= coalesce(s.digest_at, '08:00')
                                    and not exists (select 1 from digests g
                                                    where g.recipient_id = m.id and g.day = h.local::date));
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function digest_workspaces(timestamptz) from public",
  "grant execute on function digest_workspaces(timestamptz) to insyte_app",
  `create policy push_subscriptions_own on push_subscriptions as restrictive for all
     using (app_principal_kind() = 'system' or recipient_id = app_principal_id())
     with check (app_principal_kind() = 'system' or recipient_id = app_principal_id())`,
  /*
   * Before a member subscribes a browser: the same endpoint under anyone else (another member, another workspace) is
   * let go. Only rows with that endpoint's hash, never the caller's own.
   */
  `create function claim_push_endpoint(hash text) returns void
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     declare me text := app_principal_id();
     declare ws text := app_workspace_id();
     begin
       perform set_config('app.principal_kind', 'system', true);
       delete from push_subscriptions p
        where p.endpoint_hash = hash and not (p.workspace_id = ws and p.recipient_id = me);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function claim_push_endpoint(text) from public",
  "grant execute on function claim_push_endpoint(text) to insyte_app",
  "alter table notification_deliveries add column reply_token text",
  "create unique index notification_deliveries_reply on notification_deliveries (reply_token) where reply_token is not null",
  // Which delivery an answer is to, ids only: the `email()` handler reads it before it knows the workspace.
  `create function notification_reply(token text)
     returns table (workspace_id text, recipient_id text, subject_type text, subject_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select d.workspace_id, d.recipient_id, d.subject_type, d.subject_id from notification_deliveries d
                    where d.reply_token = token and d.channel = 'email';
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function notification_reply(text) from public",
  "grant execute on function notification_reply(text) to insyte_app"
)
