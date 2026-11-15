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
 * - `invitation_route_for_user(id)`: the workspace of one team invitation to that address, in whatever state (accepting,
 *   declining and undoing a decline from the switcher, where there is no link and so no secret: the signed-in address
 *   is the proof). As 0014's functions, each looks as the owner with `app.principal_kind` at `system`, and puts the
 *   caller's value back before it returns.
 */
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
     language plpgsql security definer set search_path = public as $$
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
  `create function invitation_route_for_user(invitation text) returns text
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true); result text;
     begin
       perform set_config('app.principal_kind', 'system', true);
       select i.workspace_id into result from invitations i
         join auth."user" u on u.id = app_user_id() and u.email_verified
         where i.id = invitation and i.kind = 'team' and i.email = lower(u.email);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return result;
     end $$`,
  "revoke all on function invitation_route_for_user(text) from public",
  "grant execute on function invitation_route_for_user(text) to insyte_app"
)
