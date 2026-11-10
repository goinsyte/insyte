import { statements } from "../statements.ts"

/*
 * The public returns portal (M9.3), `/retour/{handle}`: the handle is the workspace's (`return_settings.portal_slug`).
 * `route_portal` finds the workspace a handle belongs to, and whether its portal is on, before anything else is read;
 * the rest runs in that workspace as `system`. The shopper finds an order by its number and the address it was placed
 * with, so the lookup has an index on the address.
 */
export default statements(
  "create policy return_settings_routing on return_settings as permissive for select to insyte_owner using (true)",
  `create function route_portal(handle text) returns table (workspace_id text, portal_on boolean)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select s.workspace_id, s.portal_on from return_settings s where s.portal_slug = handle;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_portal(text) from public",
  "grant execute on function route_portal(text) to insyte_app",
  "create index orders_portal_lookup on orders (workspace_id, lower(customer_email))"
)
