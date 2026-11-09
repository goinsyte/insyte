import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Tracking (M8.4; integrations.md AfterShip): one delivery per parcel with a tracking number, AfterShip's view of it
 * beside Shopify's own (`fulfilments.tracking_status`). Registered with AfterShip by the 15-minute sweep, kept current by
 * its webhooks and, for parcels it does not push, by that sweep. `orders.delayed_at` is Insyte's: set once, by a carrier
 * exception or a parcel that has not moved for too long, which tells the team (`order.delayed`). `route_delivery` and
 * `deliveries_due` let the webhook and the sweep find their workspaces before anything else is read.
 */
export default statements(
  "alter table orders add column delayed_at timestamptz",
  `create table deliveries (
     id                 text primary key,
     workspace_id       text not null references workspaces(id) on delete cascade,
     order_id           text not null references orders(id) on delete cascade,
     fulfilment_id      text not null unique references fulfilments(id) on delete cascade,
     carrier            text,
     tracking_number    text not null,
     aftership_id       text,
     slug               text,
     status             text not null default 'pending'
                          check (status in ('pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception',
                                            'expired', 'returned')),
     checkpoint         text,
     exception          text,
     estimated_delivery timestamptz,
     delivered_at       timestamptz,
     last_event_at      timestamptz,
     registered_at      timestamptz,
     polled_at          timestamptz,
     attempts           integer not null default 0,
     error              text,
     created_at         timestamptz not null default now()
   )`,
  // One AfterShip account serves every workspace: the same parcel may be tracked in two.
  "create unique index deliveries_aftership on deliveries (workspace_id, aftership_id) where aftership_id is not null",
  "create index deliveries_order on deliveries (order_id)",
  "create index deliveries_due on deliveries (workspace_id, status, polled_at)",
  tenantTable("deliveries", { membersOnly: true }),
  // The routing functions read across workspaces as their owner (row level security is forced, owner included).
  "create policy deliveries_routing on deliveries as permissive for select to insyte_owner using (true)",
  `create function route_delivery(delivery text) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select d.workspace_id from deliveries d where d.id = delivery;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_delivery(text) from public",
  "grant execute on function route_delivery(text) to insyte_app",
  `create function deliveries_due() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct d.workspace_id from deliveries d
         where (d.aftership_id is null and d.attempts < 10 and d.status not in ('delivered', 'expired', 'returned'))
            or (d.status not in ('delivered', 'expired', 'returned')
                and (d.polled_at is null or d.polled_at < now() - interval '4 hours'));
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function deliveries_due() from public",
  "grant execute on function deliveries_due() to insyte_app"
)
