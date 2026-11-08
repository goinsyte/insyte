import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Webhooks in, and Shopify's privacy requests (M6.1, M6.3; integrations.md §1.5, §2 "Compliance"). `inbound_events`
 * (0002's ledger, unique per provider delivery) is routed when it is received now: the shop names its workspace before
 * the 200, so the row is the workspace's from the start and the `ingest` consumer applies it in that scope. Bodies stay
 * inline (Shopify's are small; `body_r2_key` waits for a provider that sends more than 100 KB). `gdpr_requests` keeps each request and when it was answered, with its 30 days.
 * `route_shop_any` finds a shop's workspace after an uninstall too (`shop/redact` arrives 48 hours later);
 * `stores_to_reconcile` lists the stores the sweep reads, ids only.
 */
export default statements(
  // The platform's table (0002), routed now when it is received: a tenant row from the start.
  "alter table inbound_events alter column workspace_id set not null",
  "alter table inbound_events add constraint inbound_events_workspace foreign key (workspace_id) references workspaces(id) on delete cascade",
  "alter table inbound_events add column store_id text references stores(id) on delete cascade",
  "alter table inbound_events add column attempts integer not null default 0",
  "grant select, insert, update on inbound_events to insyte_app",
  "create index inbound_events_pending on inbound_events (workspace_id, received_at) where processed_at is null",
  tenantTable("inbound_events", { membersOnly: true }),
  `create table gdpr_requests (
     id                  text primary key,
     workspace_id        text not null references workspaces(id) on delete cascade,
     store_id            text references stores(id) on delete set null,
     kind                text not null check (kind in ('data_request', 'customer_redact', 'shop_redact')),
     customer_shopify_id text,
     payload             jsonb not null,
     received_at         timestamptz not null default now(),
     due_at              timestamptz not null,
     completed_at        timestamptz
   )`,
  "create index gdpr_requests_open on gdpr_requests (workspace_id, due_at) where completed_at is null",
  tenantTable("gdpr_requests", { membersOnly: true }),
  // The shop's latest store, disconnected or not: privacy requests outlive the install.
  `create function route_shop_any(domain text) returns table (workspace_id text, store_id text, status text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select s.workspace_id, s.id, s.status from stores s
         where s.shop_domain = domain order by s.created_at desc limit 1;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_shop_any(text) from public",
  "grant execute on function route_shop_any(text) to insyte_app",
  // The reconcile sweep's stores: connected, with their first import in.
  `create function stores_to_reconcile() returns table (workspace_id text, store_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select s.workspace_id, s.id from stores s
         where s.status = 'connected' and s.last_synced_at is not null order by s.last_synced_at;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function stores_to_reconcile() from public",
  "grant execute on function stores_to_reconcile() to insyte_app"
)
