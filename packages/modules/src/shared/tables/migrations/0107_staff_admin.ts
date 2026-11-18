import { newcomerBlind, partnerBlind, tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The staff admin (M18, Support; security.md §8 "Staff access"): Insyte's support team behind Cloudflare Access at
 * `/api/__admin`, finding a workspace, reading its health and, with the owner's consent, looking along read-only.
 *
 * - `workspaces.support_access_until` / `support_access_by`: the owner's consent, "Insyte-support mag meekijken"
 *   (Instellingen → Gegevens en privacy), time-boxed: on until that moment, by that member. Absent or past is off.
 * - Two principal kinds of the database's own, set only by `Db` (`app.principal_kind`): `staff`, a person of Insyte's
 *   team as the admin acts (searching across workspaces through `staff_find_workspaces`, a workspace's health, and
 *   writing the sessions and both audit trails), and `staff_viewer`, a staff session looking along inside one
 *   workspace, always in a read-only transaction. Both count as member side, so the workspace's own policies decide
 *   what they see, as for any member: row level security still holds them to the target workspace.
 * - `staff_sessions`: a session of looking along, one workspace, one person of the team, a reason, at most 60
 *   minutes. Its members read it (the banner says while one is active); only `staff` writes it, and only while the
 *   workspace's consent holds, so a session the owner never allowed cannot even be written down.
 * - `staff_audit`: every search, health read, start, read and end the team did, with the workspace, the RPC and its
 *   outcome code; never a payload. The team's alone (`staff`), append-only for the app. The workspace's own Logboek
 *   gets a line for each start, read and end too (`audit_events`, actor `insyte`, section `support`).
 * - The sealed secrets (a connection's tokens, a webhook's signing secret, a supplier's integration secret, an OAuth
 *   flow's PKCE verifier) are closed to both staff kinds outright.
 */

/** The team's own kinds; neither is a principal a request authenticates as. */
const STAFF = "('staff', 'staff_viewer')"
const NOT_STAFF = `app_principal_kind() is null or app_principal_kind() not in ${STAFF}`

export default statements(
  "alter table workspaces add column support_access_until timestamptz",
  "alter table workspaces add column support_access_by text",
  //
  `create or replace function app_is_member_side() returns boolean language sql stable as
     $$ select app_principal_kind() in ('member', 'newcomer', 'api_key', 'service_account', 'agent', 'system',
                                        'staff', 'staff_viewer') $$`,
  //
  `create table staff_sessions (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     staff_email  text not null check (length(staff_email) between 3 and 320),
     reason       text not null check (length(trim(reason)) between 3 and 500),
     started_at   timestamptz not null default now(),
     expires_at   timestamptz not null,
     ended_at     timestamptz,
     check (expires_at > started_at and expires_at <= started_at + interval '60 minutes')
   )`,
  "create index staff_sessions_workspace on staff_sessions (workspace_id, expires_at desc)",
  tenantTable("staff_sessions"),
  newcomerBlind("staff_sessions"),
  partnerBlind("staff_sessions"),
  // Written by the team alone, and begun only while the owner's consent holds.
  `create policy staff_sessions_begun on staff_sessions as restrictive for insert
     with check (app_principal_kind() = 'staff' and exists (
       select 1 from workspaces w where w.id = workspace_id and w.support_access_until > now()))`,
  `create policy staff_sessions_ended on staff_sessions as restrictive for update
     using (app_principal_kind() = 'staff') with check (app_principal_kind() = 'staff')`,
  "revoke delete on staff_sessions from insyte_app",
  // A person of the team finds their own sessions before any workspace is in scope (the session's id is all they hold).
  `create policy staff_sessions_own on staff_sessions as permissive for select
     using (app_principal_kind() = 'staff' and staff_email = app_principal_id())`,
  //
  `create table staff_audit (
     id           text primary key,
     at           timestamptz not null default now(),
     staff_email  text not null check (length(staff_email) between 3 and 320),
     action       text not null check (action in ('workspaces.search', 'workspace.health', 'session.start',
                                                  'session.read', 'session.end')),
     workspace_id text,
     session_id   text,
     rpc          text check (length(rpc) <= 120),
     outcome      text not null check (outcome in ('ok', 'refused', 'failed')),
     code         text check (length(code) <= 80),
     detail       text check (length(detail) <= 300)
   )`,
  "create index staff_audit_recent on staff_audit (at desc)",
  "create index staff_audit_workspace on staff_audit (workspace_id, at desc) where workspace_id is not null",
  "alter table staff_audit enable row level security",
  "alter table staff_audit force row level security",
  `create policy staff_audit_team on staff_audit as permissive for all
     using (app_principal_kind() = 'staff') with check (app_principal_kind() = 'staff')`,
  newcomerBlind("staff_audit"),
  "revoke update, delete on staff_audit from insyte_app",
  //
  // The sealed secrets: no staff kind reads or writes a row of them, whatever else lets it into the workspace.
  `create policy connection_credentials_no_staff on connection_credentials as restrictive for all
     using (${NOT_STAFF}) with check (${NOT_STAFF})`,
  `create policy webhook_endpoints_no_staff on webhook_endpoints as restrictive for all
     using (${NOT_STAFF}) with check (${NOT_STAFF})`,
  `create policy supplier_integrations_no_staff on supplier_integrations as restrictive for all
     using (${NOT_STAFF}) with check (${NOT_STAFF})`,
  // …and an OAuth flow's PKCE verifier while it is under way.
  `create policy oauth_states_no_staff on oauth_states as restrictive for all
     using (${NOT_STAFF}) with check (${NOT_STAFF})`,
  //
  // Finding a workspace (the admin's search): by its id, a part of its name, a part of a store's shop domain, or its
  // owner's address in full (no partial address, so the search lists no one's addresses). Only what support needs:
  // the name, the plan, when it was made, its counts, the open incidents and the billing status, the consent. Only
  // for `staff`; as the owner (the policies `*_routing` and, for the incidents, `app.connection_scan`).
  `create function staff_find_workspaces(q text)
     returns table (id text, name text, plan text, created_at timestamptz, stores int, members int,
                    open_incidents int, billing text, support_access_until timestamptz)
     language plpgsql security definer set search_path = public, pg_temp as $$
     #variable_conflict use_column
     declare needle text := lower(trim(coalesce(q, '')));
     begin
       if app_principal_kind() is distinct from 'staff' or length(needle) < 2 then return; end if;
       perform set_config('app.connection_scan', 'on', true);
       return query
         select w.id, w.name, w.plan, w.created_at,
                (select count(*)::int from stores s where s.workspace_id = w.id and s.status <> 'disconnected'),
                (select count(*)::int from members m
                  where m.workspace_id = w.id and m.removed_at is null and m.deactivated_at is null),
                (select count(*)::int from connection_incidents i where i.workspace_id = w.id and i.resolved_at is null),
                (select s.status from subscriptions s where s.workspace_id = w.id),
                w.support_access_until
         from workspaces w
         where w.deleted_at is null and (
           w.id = trim(q)
           or position(needle in lower(w.name)) > 0
           or exists (select 1 from stores s where s.workspace_id = w.id and position(needle in s.shop_domain) > 0)
           or exists (select 1 from members m join auth."user" u on u.id = m.user_id
                      where m.workspace_id = w.id and m.role_id = 'owner' and m.removed_at is null
                        and lower(u.email) = needle))
         order by w.created_at desc, w.id
         limit 20;
       perform set_config('app.connection_scan', '', true);
     end $$`,
  "revoke all on function staff_find_workspaces(text) from public",
  "grant execute on function staff_find_workspaces(text) to insyte_app"
)
