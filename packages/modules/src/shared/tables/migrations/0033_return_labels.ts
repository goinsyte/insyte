import { statements } from "../statements.ts"

/*
 * Return labels (M9.2): a return address in the parts a carrier's label needs (the single `address` stays the line the
 * screens show), and the carrier's reference for a return's parcel, so its webhook finds the return. `returns.label`
 * holds the rest: requested, issued (carrier, tracking, the PDF in `files`) or failed. `route_return_parcel` lets the
 * carrier's webhook find its workspace before anything else is read, as `route_delivery` does for AfterShip.
 */
export default statements(
  "alter table return_addresses add column name text",
  "alter table return_addresses add column line1 text",
  "alter table return_addresses add column postcode text",
  "alter table return_addresses add column city text",
  "alter table returns add column label_parcel_ref text",
  "create unique index returns_label_parcel on returns (label_parcel_ref) where label_parcel_ref is not null",
  // The routing function reads across workspaces as its owner (row level security is forced, owner included).
  "create policy returns_routing on returns as permissive for select to insyte_owner using (true)",
  `create function route_return_parcel(parcel text) returns table (workspace_id text, return_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select r.workspace_id, r.id from returns r where r.label_parcel_ref = parcel;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_return_parcel(text) from public",
  "grant execute on function route_return_parcel(text) to insyte_app"
)
