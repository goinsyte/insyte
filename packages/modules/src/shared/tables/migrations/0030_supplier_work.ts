import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Supplier work (M8.3; domain.md §5, §12.2): one row per order × supplier once its leg reached the supplier. The
 * supplier accepts it, reports a problem, or ships it; `handoff_by` is the deadline (the order's time plus the longest
 * lead time of its lines, at the supplier's 17:00), moved by a new date the supplier reports. `route_supplier` lets the
 * supplier's own API reach its workspace before anything else is read (the signature is checked inside it).
 */
export default statements(
  `create table supplier_work (
     workspace_id        text not null references workspaces(id) on delete cascade,
     order_id            text not null references orders(id) on delete cascade,
     supplier_id         text not null references suppliers(id) on delete cascade,
     status              text not null default 'to_accept'
                           check (status in ('to_accept', 'to_ship', 'problem', 'shipped', 'closed')),
     accepted_at         timestamptz,
     accepted_by         text,
     handoff_by          timestamptz,
     problem_kind        text check (problem_kind in ('stock', 'delay', 'address', 'damaged', 'other')),
     problem_note        text,
     problem_new_date    date,
     problem_reported_at timestamptz,
     problem_resolved_at timestamptz,
     shipped_at          timestamptz,
     updated_at          timestamptz not null default now(),
     primary key (order_id, supplier_id)
   )`,
  "create index supplier_work_supplier on supplier_work (supplier_id, status, handoff_by)",
  tenantTable("supplier_work", { membersOnly: true }),
  // The routing function reads across workspaces as its owner (row level security is forced, owner included).
  "create policy suppliers_routing on suppliers as permissive for select to insyte_owner using (true)",
  `create function route_supplier(supplier text) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select s.workspace_id from suppliers s where s.id = supplier and s.deleted_at is null;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_supplier(text) from public",
  "grant execute on function route_supplier(text) to insyte_app"
)
