import { newcomerBlind, partnerBlind, staffHeld, tenantTable } from "@insyte/database/Tenancy"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
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
 *   workspace, always in a read-only transaction. Both count as member side for reading, so row level security holds
 *   them to the target workspace as it holds a member; but neither writes what a member may (`staffHeld` below).
 * - `staffHeld`, on every table with row level security: neither staff kind inserts, changes or removes a row, but
 *   `staff` its own sessions (begun, and ended once: only `ended_at`, never cleared), its own audit lines, the
 *   Logboek's support lines exactly as the slice writes them (`LOGBOOK_LINE`) and the banner's nudge in this
 *   workspace's own room; and `staff_viewer` reads a row only while `app_staff_session_live()`: its
 *   session not ended, not past its hour, of the workspace in scope, and the owner's consent still on. The database
 *   checks that on every statement, not only the code before the read.
 * - `staff_sessions`: a session of looking along, one workspace, one person of the team, a reason, at most 60
 *   minutes. Its members read it (the banner says while one is active); only `staff` writes it, and only while the
 *   workspace's consent holds, so a session the owner never allowed cannot even be written down.
 * - `staff_audit`: every search, health read, start, read and end the team did, with the workspace, the RPC, the
 *   record read and the outcome's code; never a payload. The team's alone (`staff`), append-only for the app. It
 *   outlives a workspace's deletion, but forgets what named it: when a workspace is purged, the searches that could
 *   have found it by its name, a shop domain or its id, and its own lines' details, read `[verwijderd]`. The
 *   workspace's own Logboek gets a line for each health read, start, read and end too (`audit_events`, actor
 *   `insyte`, section `support`).
 * - The sealed secrets (a connection's tokens, a webhook's signing secret, a supplier's integration secret, an OAuth
 *   flow's PKCE verifier) are closed to both staff kinds outright.
 */

/** The team's own kinds; neither is a principal a request authenticates as. */
const STAFF = "('staff', 'staff_viewer')"
const NOT_STAFF = `app_principal_kind() is null or app_principal_kind() not in ${STAFF}`

/** One of the caller's own sessions in the workspace in scope, named by `id`, and `state` true of it. */
const ownSession = (id: string, state: string) =>
  `exists (select 1 from staff_sessions s where s.id = ${id} and s.workspace_id = app_workspace_id()
             and s.staff_email = app_principal_id() and ${state})`

/**
 * The Logboek's support lines, exactly as `support/use-cases/staff.ts` writes them: actor `insyte`, section
 * `support`, the subject the actor, a diff of `said` alone, and per action who may say it and how it starts. A health
 * read is `support` itself; a start and a read name a session of the caller's that is live; an end names the one this
 * very transaction ended (its `ended_at` is this transaction's `now()`), so no end is said that did not happen.
 */
const LOGBOOK_LINE = `actor_kind = 'insyte' and section = 'support' and subject_type = 'support'
  and subject_id = actor_id and jsonb_typeof(diff -> 'said') = 'string' and diff - 'said' = '{}'::jsonb and (
    (action = 'support.status_viewed' and actor_id = 'support'
      and diff ->> 'said' = 'Insyte-support bekeek de status')
    or (action = 'support.session_started' and diff ->> 'said' like 'Meekijken gestart. Reden: %'
      and ${ownSession("actor_id", "s.ended_at is null and s.expires_at > now()")})
    or (action = 'support.read' and diff ->> 'said' like 'Bekeken: %'
      and ${ownSession("actor_id", "s.ended_at is null and s.expires_at > now()")})
    or (action = 'support.session_ended' and diff ->> 'said' = 'Meekijken beëindigd'
      and ${ownSession("actor_id", "s.ended_at = now()")}))`

/** What `staff` may write, where it may write anything (`staffHeld`'s `may`). */
const STAFF_MAY: Readonly<Record<string, Parameters<typeof staffHeld>[1]>> = {
  // Begun as itself; ended once, by itself, and never opened again.
  staff_sessions: {
    insert: "staff_email = app_principal_id()",
    update: {
      rows: "staff_email = app_principal_id() and ended_at is null",
      to: "staff_email = app_principal_id() and ended_at is not null"
    }
  },
  staff_audit: { insert: "staff_email = app_principal_id()" },
  audit_events: { insert: LOGBOOK_LINE },
  // The members' banner, nudged in this workspace's room alone (the realtime relay broadcasts to the payload's).
  outbox: {
    insert: `event = 'records.changed' and payload ->> 'workspaceId' = workspace_id and payload ->> 'kind' = 'support'`
  }
}

const schema = statements(
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
  // Ending one is the only change: its workspace, person, reason and hour stay as begun.
  "revoke update on staff_sessions from insyte_app",
  "grant update (ended_at) on staff_sessions to insyte_app",
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
  "grant execute on function staff_find_workspaces(text) to insyte_app",
  //
  // A session looking along may read now: the request's principal is that session, of the workspace in scope, not
  // ended, not past its hour, and the owner's consent still on. As the owner, so it reads the session and the
  // consent whatever the caller may (`staffHeld`'s policies are on `insyte_app`, so it does not meet itself).
  `create function app_staff_session_live() returns boolean
     language sql stable security definer set search_path = public, pg_temp as $$
       select exists (
         select 1 from staff_sessions s join workspaces w on w.id = s.workspace_id
         where s.id = app_principal_id() and s.workspace_id = app_workspace_id()
           and s.ended_at is null and s.expires_at > now()
           and w.deleted_at is null and w.support_access_until > now())
     $$`,
  "revoke all on function app_staff_session_live() from public",
  "grant execute on function app_staff_session_live() to insyte_app",
  //
  // A purged workspace's name, shop domains and id leave the team's audit: the searches that could have found it, and
  // its own lines' details (a record's id). The lines themselves stay: who of the team looked, when, at what.
  "create policy staff_audit_forget_read on staff_audit as permissive for select to insyte_owner using (true)",
  `create policy staff_audit_forget on staff_audit as permissive for update to insyte_owner
     using (true) with check (true)`,
  `create function staff_audit_forget_workspace() returns trigger
     language plpgsql security definer set search_path = public, pg_temp as $$
     begin
       update staff_audit a set detail = '[verwijderd]'
        where a.detail is not null and a.detail <> '[verwijderd]' and (
          a.workspace_id = old.id
          or (a.action = 'workspaces.search' and length(a.detail) >= 2 and (
                lower(a.detail) = lower(old.id)
                or position(lower(a.detail) in lower(old.name)) > 0
                or exists (select 1 from stores s
                            where s.workspace_id = old.id and position(lower(a.detail) in lower(s.shop_domain)) > 0))));
       return old;
     end $$`,
  "revoke all on function staff_audit_forget_workspace() from public",
  `create trigger workspaces_forget_staff_audit before delete on workspaces
     for each row execute function staff_audit_forget_workspace()`
)

/** Every table with row level security there is now, held as `staffHeld` says (a partition by its parent's). */
const held = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const tables = yield* sql<{ name: string }>`
    select c.relname as name from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relrowsecurity
      and not c.relispartition
    order by 1`
  yield* statements(tables.flatMap((t) => staffHeld(t.name, STAFF_MAY[t.name])))
})

export default Effect.andThen(schema, held)
