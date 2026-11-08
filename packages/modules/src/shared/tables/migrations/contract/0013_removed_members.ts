import { statements } from "../../statements.ts"

/**
 * A removed member (`members.removed_at`, 0012) no longer sees the workspace or its roles: 0009's two policies again,
 * now also with `removed_at`. A contract migration because it replaces policies; no code before it removes anyone.
 */
export default statements(
  "drop policy roles_mine on roles",
  `create policy roles_mine on roles as permissive for select using (exists (
     select 1 from members m
     where m.workspace_id = roles.workspace_id and m.role_id = roles.id and m.user_id = app_user_id()
       and m.deactivated_at is null and m.removed_at is null
   ))`,
  "drop policy workspaces_member_of on workspaces",
  `create policy workspaces_member_of on workspaces as permissive for select using (exists (
     select 1 from members m
     where m.workspace_id = workspaces.id and m.user_id = app_user_id() and m.deactivated_at is null
       and m.removed_at is null
   ))`
)
