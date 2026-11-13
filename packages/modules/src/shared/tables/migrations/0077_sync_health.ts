import { statements } from "../statements.ts"

/*
 * Sync health (M17 step 6, PLAN 49; domain.md §3.2, §12.25): a check every 15 minutes over each store's connection
 * opens a `connection_incidents` row per finding and resolves the row when the finding is gone.
 *
 * - `connection_incidents.facts`: what the check found (the missing scopes, when the grant lapses, since when no
 *   webhook came or no sync went through), beside `tried` (what Insyte already did about it). `token_expired` joins the
 *   kinds: the grant is gone and only the operator can approve the app again.
 * - `queue_items` gains `connection_incident`: an open incident on a connected store is a row on Start until it
 *   resolves (a store that needs reconnecting already has its `store_disconnected` row).
 * - `stores.last_order_hook_at`: when Shopify last delivered an order webhook for the store, kept by the consumer, so
 *   the webhook-gap check needs no scan or index on `inbound_events`.
 * - `health_due(…)`: which workspaces the check has to look at, decided in SQL over the stores and their connections,
 *   ids only (the cross-tenant rule: no row's content leaves it). Each one is then checked in its own scope. It and
 *   `stores_to_reconcile()` read `connections` as `insyte_owner`, which a select policy allows only while one of the two
 *   says so (`app.connection_scan`), not to every function the owner defines.
 * - `stores_to_reconcile()` now reads the store whose connection went longest without a sweep first, so a sweep cut
 *   short by its time budget leaves different stores for the next one, never the same tail.
 */
export default statements(
  "alter table connection_incidents add column facts jsonb not null default '{}'",
  "alter table connection_incidents drop constraint connection_incidents_kind_check",
  `alter table connection_incidents add constraint connection_incidents_kind_check
     check (kind in ('webhook_gap', 'token_expiring', 'token_expired', 'scope_missing', 'rate_limited', 'sync_failed'))`,
  "alter table queue_items drop constraint queue_items_kind_check",
  `alter table queue_items add constraint queue_items_kind_check
     check (kind in ('order_delayed', 'return_review', 'quality_review', 'stock_out', 'store_disconnected',
                     'chargeback_deadline', 'connection_incident'))`,
  "alter table stores add column last_order_hook_at timestamptz",
  `create policy connections_scan on connections as permissive for select to insyte_owner
     using (current_setting('app.connection_scan', true) = 'on')`,
  `create policy connection_incidents_scan on connection_incidents as permissive for select to insyte_owner
     using (current_setting('app.connection_scan', true) = 'on')`,
  `create function health_due(gap interval, stale interval, warn interval, failures integer, low integer,
                              resources text[])
     returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       perform set_config('app.connection_scan', 'on', true);
       return query
         select distinct s.workspace_id
         from stores s join connections c on c.id = s.connection_id
         where s.status <> 'disconnected' and c.provider = 'shopify' and (
           exists (select 1 from connection_incidents i where i.connection_id = c.id and i.resolved_at is null)
           or c.status not in ('connected', 'disconnected', 'revoked')
           or s.status = 'action_required'
           or coalesce((c.health ->> 'failures')::int, 0) >= failures
           or coalesce((c.health ->> 'lowSweeps')::int, 0) >= low
           or (c.status = 'connected' and (c.health ->> 'refreshExpiresAt')::timestamptz < now() + warn)
           or (c.status = 'connected' and exists (
                 select 1 from unnest(resources) r where not (c.scopes && array['read_' || r, 'write_' || r])))
           or (s.status = 'connected' and s.last_synced_at is not null and c.status = 'connected' and
               greatest(c.last_synced_at, (c.health ->> 'throttledAt')::timestamptz, s.last_synced_at, s.connected_at)
                 < now() - stale)
           or (s.status = 'connected' and s.last_synced_at is not null and c.status = 'connected' and
               (c.health ->> 'ordersWatermarkAt')::timestamptz
                 - greatest(s.last_order_hook_at, s.last_synced_at, s.connected_at) > gap and
               greatest(s.last_order_hook_at, s.last_synced_at, s.connected_at) < now() - gap));
       perform set_config('app.connection_scan', '', true);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function health_due(interval, interval, interval, integer, integer, text[]) from public",
  "grant execute on function health_due(interval, interval, interval, integer, integer, text[]) to insyte_app",
  `create or replace function stores_to_reconcile() returns table (workspace_id text, store_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       perform set_config('app.connection_scan', 'on', true);
       return query select s.workspace_id, s.id from stores s left join connections c on c.id = s.connection_id
         where s.status = 'connected' and s.last_synced_at is not null
         order by c.last_synced_at nulls first, s.last_synced_at;
       perform set_config('app.connection_scan', '', true);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`
)
