import { NEWCOMER_KIND, newcomerMay, NOT_NEWCOMER } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * More than one workspace per person (M3.1, M3.4): leaving one, and the invitations to another one in the switcher.
 *
 * - `members.left_at`: the member left on their own (`Workspaces.leave`). The row is removed as a removal is
 *   (`removed_at`), so it frees the seat and keeps authorship, but an undo of a removal (`Members.restore`) does not
 *   bring them back: only a new invitation does. Accepting one clears both.
 * - Inside a workspace, only that workspace: `members_own`, `roles_mine` and `workspaces_member_of` (0009, 0013) let a
 *   person list their memberships before choosing one, and are permissive, so inside a workspace's transaction they
 *   also showed that person's own rows of their *other* workspaces (Team listing them twice, a bare
 *   `select … from workspaces` reading the wrong one). Harmless with one workspace each; with several it mixes them.
 *   A restrictive policy per table now holds every read and write to the transaction's workspace whenever one is set;
 *   before one is (`Db.forUser`, routing, the sweeps) nothing changes.
 * - `invitations_to_user()`: the open team invitations addressed to the signed-in person's verified address, as
 *   `(invitation_id, workspace_id)` and nothing else; the switcher then reads each inside its workspace.
 * - `invitation_route_for_user(id, restoring)`: the workspace of one open team invitation to that address (accepting
 *   and declining from the switcher, where there is no link and so no secret: the signed-in address is the proof),
 *   or, with `restoring`, of one declined inside the decline's undo window (32 seconds: four times `UNDO_SECONDS`).
 *   Accepted, revoked and lapsed ones route nowhere. As 0014's functions, each looks as the owner with `app.principal_kind` at
 *   `system`, and puts the caller's value back before it returns.
 * - The newcomer (`Db.asNewcomerIn`): a person inside a workspace they are not a member of, founding it or taking up or
 *   turning down an invitation to it, has a principal kind of its own, `newcomer`, and the database holds it to those
 *   paths. On the tables they touch (`newcomerMay`), only the statements they make there, and on members and API keys
 *   only the person's own rows; every other table with row level security refuses it outright (`newcomerBlind`, made
 *   here for the ones there are; a table made later adds it, and `tenancy.test.ts` checks every one has one or the
 *   other). It counts as member side (`app_is_member_side`), so the members-only tables it may touch (invitations,
 *   their link, AI budgets, API keys, the audit log) let it through to what `newcomerMay` allows.
 */

/** The person's own member row in the transaction's workspace, and the keys that row made. */
const OWN_MEMBER = "user_id = app_user_id()"
const OWN_KEYS = "created_by in (select m.id from members m where m.user_id = app_user_id())"
/** The invitation the newcomer handles (`app.invitation_id`, the one accepted, declined or undone), and theirs. */
const HANDLED = "id = app_invitation_id()"
const ADDRESSED = "email = app_verified_email()"
/** What founding and an invitation write to the outbox, and the invitation mail a decline cancels. */
const WRITTEN = "event in ('workspace.created', 'member.joined', 'records.changed')"
const ITS_MAIL = "event = 'member.invited' and payload ->> 'invitationId' = app_invitation_id()"

export default statements(
  "alter table members add column left_at timestamptz",
  `create policy members_in_workspace on members as restrictive for all
     using (app_workspace_id() is null or workspace_id = app_workspace_id())
     with check (app_workspace_id() is null or workspace_id = app_workspace_id())`,
  `create policy roles_in_workspace on roles as restrictive for all
     using (app_workspace_id() is null or workspace_id = app_workspace_id())
     with check (app_workspace_id() is null or workspace_id = app_workspace_id())`,
  `create policy workspaces_in_workspace on workspaces as restrictive for all
     using (app_workspace_id() is null or id = app_workspace_id())
     with check (app_workspace_id() is null or id = app_workspace_id())`,
  `create function invitations_to_user() returns table (invitation_id text, workspace_id text)
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query
         select i.id, i.workspace_id from invitations i
         join auth."user" u on u.id = app_user_id() and u.email_verified
         where i.kind = 'team' and i.email = lower(u.email)
           and i.accepted_at is null and i.revoked_at is null and i.declined_at is null and i.expires_at > now()
         order by i.sent_at desc, i.id;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function invitations_to_user() from public",
  "grant execute on function invitations_to_user() to insyte_app",
  `create function invitation_route_for_user(invitation text, restoring boolean default false) returns text
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true); result text;
     begin
       perform set_config('app.principal_kind', 'system', true);
       select i.workspace_id into result from invitations i
         join auth."user" u on u.id = app_user_id() and u.email_verified
         where i.id = invitation and i.kind = 'team' and i.email = lower(u.email)
           and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
           and case when restoring then i.declined_at > now() - interval '32 seconds' else i.declined_at is null end;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return result;
     end $$`,
  "revoke all on function invitation_route_for_user(text, boolean) from public",
  "grant execute on function invitation_route_for_user(text, boolean) to insyte_app",
  //
  // The invitation a newcomer handles, and the signed-in person's verified address (both null when there is none).
  `create function app_invitation_id() returns text language sql stable as
     $$ select nullif(current_setting('app.invitation_id', true), '') $$`,
  `create function app_verified_email() returns text language sql stable as
     $$ select lower(u.email) from auth."user" u where u.id = app_user_id() and u.email_verified $$`,
  // The seats (Seats.ts) and a supplier's name (the landing) without the rows behind them: the subscription's card
  // and invoices and a supplier's contact details stay out of the newcomer's reach. Member side only; as the owner
  // with `app.principal_kind` at `system`, put back before they return.
  `create function workspace_seat_facts()
     returns table (workspace_plan text, status text, plan text, extra_seats int, started_at timestamptz,
                    active int, pending int)
     language plpgsql security definer set search_path = public, pg_temp as $$
     #variable_conflict use_column
     declare prior text := current_setting('app.principal_kind', true);
     begin
       if not coalesce(app_is_member_side(), false) then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       return query
         select w.plan, s.status, s.plan, s.extra_seats, s.started_at,
                (select count(*)::int from members m
                  where m.workspace_id = w.id and m.removed_at is null and m.deactivated_at is null),
                (select count(*)::int from invitations i
                  where i.workspace_id = w.id and i.accepted_at is null and i.revoked_at is null
                    and i.declined_at is null and i.expires_at > now())
         from workspaces w left join subscriptions s on s.workspace_id = w.id
         where w.id = app_workspace_id();
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function workspace_seat_facts() from public",
  "grant execute on function workspace_seat_facts() to insyte_app",
  `create function supplier_name_in_workspace(supplier text) returns text
     language plpgsql security definer set search_path = public, pg_temp as $$
     declare prior text := current_setting('app.principal_kind', true); result text;
     begin
       if not coalesce(app_is_member_side(), false) then return null; end if;
       perform set_config('app.principal_kind', 'system', true);
       select s.name into result from suppliers s where s.id = supplier and s.workspace_id = app_workspace_id();
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return result;
     end $$`,
  "revoke all on function supplier_name_in_workspace(text) from public",
  "grant execute on function supplier_name_in_workspace(text) to insyte_app",
  //
  // The newcomer counts as member side, so the members-only tables below let it through to what `newcomerMay` allows.
  `create or replace function app_is_member_side() returns boolean language sql stable as
     $$ select app_principal_kind() in ('member', '${NEWCOMER_KIND}', 'api_key', 'service_account', 'agent', 'system') $$`,
  // Founding: the workspace, its system roles, the founder's row, its counters, its AI limit, its audit line and event.
  newcomerMay("workspaces", { select: true, insert: true }),
  newcomerMay("roles", { select: true, insert: true }),
  newcomerMay("members", { select: true, insert: OWN_MEMBER, update: OWN_MEMBER }),
  newcomerMay("workspace_counters", { insert: true }),
  newcomerMay("ai_budgets", { insert: true }),
  newcomerMay("audit_events", { insert: true }),
  // `workspace.created`, `member.joined` and their `records.changed`; the `member.invited` mail a decline cancels.
  newcomerMay("outbox", { select: ITS_MAIL, insert: WRITTEN, update: ITS_MAIL }),
  // The onboarding row, the person's own anyway (0008): the founding step moves it, a new workspace adds one.
  newcomerMay("onboarding_progress", { select: true, insert: true, update: true }),
  // An invitation: the one handled and the others to the person's address (the undo of a decline checks none
  // replaced it), changed only when it is both; then the link and its count. The seats and whether the workspace
  // pays come from `workspace_seat_facts`, a supplier's name from `supplier_name_in_workspace`. A supplier's person
  // joins through `supplier_contact_join` (0075), as the system.
  newcomerMay("invitations", { select: `${HANDLED} or ${ADDRESSED}`, update: `${HANDLED} and ${ADDRESSED}` }),
  newcomerMay("invite_links", { select: true, update: true }),
  // A member back through a new invitation: the keys they made before stay revoked.
  newcomerMay("api_keys", { select: OWN_KEYS, update: OWN_KEYS }),
  // Every other table with row level security: `newcomerBlind`'s policy.
  `do $$
     declare t text;
     begin
       for t in
         select c.relname from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relrowsecurity
           and not c.relispartition
           and not exists (select 1 from pg_policy p
                           where p.polrelid = c.oid and p.polname in (c.relname || '_newcomer_select', c.relname || '_no_newcomer'))
         order by c.relname
       loop
         execute format('create policy %I on %I as restrictive for all using (%s) with check (%s)',
                        t || '_no_newcomer', t, '${NOT_NEWCOMER.replaceAll("'", "''")}', '${
    NOT_NEWCOMER.replaceAll("'", "''")
  }');
       end loop;
     end $$`
)
