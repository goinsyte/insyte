import { statements } from "../statements.ts"

/*
 * A return's parcel tracked (M9.2): the tracking number on its label (Sendcloud's, or the one the shopper sent it with,
 * "zelf versturen") registered with AfterShip by the 15-minute sweep, and its status as AfterShip last said it.
 * `return_parcels_due` lets the sweep find the workspaces with parcels to register; `route_return` lets AfterShip's
 * webhook find a return's workspace before anything else is read.
 */
export default statements(
  "alter table returns add column parcel_aftership_id text",
  "alter table returns add column parcel_status text",
  "alter table returns add column parcel_attempts integer not null default 0",
  "alter table returns add column parcel_error text",
  `create function return_parcels_due() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct r.workspace_id from returns r
         where r.label ->> 'tracking' is not null and r.parcel_aftership_id is null and r.parcel_attempts < 10
           and r.status in ('awaiting_parcel', 'in_transit');
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function return_parcels_due() from public",
  "grant execute on function return_parcels_due() to insyte_app",
  `create function route_return(return_id text) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select r.workspace_id from returns r where r.id = return_id;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_return(text) from public",
  "grant execute on function route_return(text) to insyte_app"
)
