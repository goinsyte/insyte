import { statements } from "../statements.ts"

/*
 * Sync health (M17 step 6, PLAN 49; domain.md §3.2, §12.25): the 15-minute check over every store's connection opens a
 * `connection_incidents` row per finding and resolves it when the check is healthy again.
 *
 * - `connection_incidents.facts`: what the check found (the missing scopes, when the grant lapses, since when no
 *   webhook came), beside `tried` (what Insyte already did about it). `token_expired` joins the kinds: the grant is
 *   gone and only the operator can approve the app again.
 * - `queue_items` gains `connection_incident`: an open incident on a connected store is a row on Start until it
 *   resolves (a store that needs reconnecting already has its `store_disconnected` row).
 * - `inbound_events_store_orders`: the store's newest order delivery, which the webhook-gap check reads every sweep.
 * - `health_observations()`: every store's connection as the check reads it, across workspaces, in one query, so a sweep
 *   where nothing changed costs one statement; only a workspace with something to write opens its own transaction. It
 *   runs as `insyte_owner`, so the four tables it reads get a routing read for that role (as `stores` has, 0020).
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
  `create index inbound_events_store_orders on inbound_events (store_id, received_at desc)
     where topic like 'orders/%'`,
  "create policy connections_routing on connections as permissive for select to insyte_owner using (true)",
  `create policy connection_incidents_routing on connection_incidents as permissive for select to insyte_owner
     using (true)`,
  "create policy sync_cursors_routing on sync_cursors as permissive for select to insyte_owner using (true)",
  "create policy inbound_events_routing on inbound_events as permissive for select to insyte_owner using (true)",
  `create function health_observations() returns table (
     workspace_id text, store_id text, store_status text, imported_at timestamptz, connection_id text,
     connection_status text, scopes text[], health jsonb, last_delivery_at timestamptz, watermark_at timestamptz,
     incidents jsonb)
     language plpgsql security definer set search_path = public as $$
     #variable_conflict use_column
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query
         select s.workspace_id, s.id, s.status, s.last_synced_at, c.id, c.status, c.scopes, c.health,
                (select max(e.received_at) from inbound_events e
                 where e.store_id = s.id and e.topic like 'orders/%'),
                (select k.watermark_at from sync_cursors k where k.connection_id = c.id and k.resource = 'orders'),
                coalesce((select jsonb_agg(jsonb_build_object(
                            'kind', i.kind,
                            'openedAt', (extract(epoch from i.opened_at) * 1000)::bigint,
                            'facts', i.facts,
                            'told', i.notified_member_id is not null))
                          from connection_incidents i where i.connection_id = c.id and i.resolved_at is null),
                         '[]'::jsonb)
         from stores s join connections c on c.id = s.connection_id
         where s.status <> 'disconnected' and c.provider = 'shopify';
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function health_observations() from public",
  "grant execute on function health_observations() to insyte_app"
)
