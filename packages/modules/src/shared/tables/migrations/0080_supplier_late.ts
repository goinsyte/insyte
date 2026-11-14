import { statements } from "../statements.ts"

/*
 * The hourly supplier check (M8.3): work a supplier has not shipped by its hand-off delays its order. The check reads
 * open work by its hand-off, so it has an index of its own over the open rows only, and it visits only the workspaces
 * that have work come due in the last seven days (its window: older work is the backlog, never raised at once).
 *
 * - `supplier_work_due`: open work (`to_accept`, `to_ship`, `problem`) by workspace and hand-off.
 * - `supplier_late_workspaces()`: the workspaces with open work whose hand-off fell in the window, read before any
 *   workspace is in scope, as the other sweeps' are. `supplier_work` gets a routing read for it, as `suppliers` has.
 */
export default statements(
  `create index supplier_work_due on supplier_work (workspace_id, handoff_by)
     where status in ('to_accept', 'to_ship', 'problem')`,
  "create policy supplier_work_routing on supplier_work as permissive for select to insyte_owner using (true)",
  `create function supplier_late_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct w.workspace_id from supplier_work w
                    join workspaces ws on ws.id = w.workspace_id
                    where w.status in ('to_accept', 'to_ship', 'problem')
                      and w.handoff_by < now() and w.handoff_by > now() - interval '7 days'
                      and ws.deleted_at is null;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function supplier_late_workspaces() from public",
  "grant execute on function supplier_late_workspaces() to insyte_app"
)
