import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * External accounts and the stores on them (M6.1, M6.2; domain.md §3, integrations.md §1.2). A `connections` row is the
 * only place an external account exists; its secrets are sealed in `connection_credentials` and read only by the
 * gate's refresh. A Shopify store is a `stores` row on its connection, and a shop domain is connected to one workspace
 * at a time: the partial unique index holds across workspaces, so a store is never silently moved (legacy's bug).
 * `oauth_states` holds a connect flow's nonce for ten minutes.
 */
export default statements(
  `create table connections (
     id             text primary key,
     workspace_id   text not null references workspaces(id) on delete cascade,
     provider       text not null,
     account_ref    text not null,
     status         text not null default 'connecting' check (status in
                      ('connecting', 'connected', 'token_expired', 'scope_missing', 'rate_limited', 'revoked', 'disconnected')),
     scopes         text[] not null default '{}',
     health         jsonb not null default '{}',
     last_synced_at timestamptz,
     last_error_at  timestamptz,
     connected_by   text,
     created_at     timestamptz not null default now()
   )`,
  "create index connections_workspace on connections (workspace_id, provider)",
  "create unique index connections_account on connections (workspace_id, provider, account_ref)",
  tenantTable("connections", { membersOnly: true }),
  `create table connection_credentials (
     connection_id    text primary key references connections(id) on delete cascade,
     workspace_id     text not null references workspaces(id) on delete cascade,
     sealed           text not null,
     kid              text not null,
     token_expires_at timestamptz,
     refreshed_at     timestamptz not null default now()
   )`,
  tenantTable("connection_credentials", { membersOnly: true }),
  `create table connection_incidents (
     id                 text primary key,
     workspace_id       text not null references workspaces(id) on delete cascade,
     connection_id      text not null references connections(id) on delete cascade,
     kind               text not null check (kind in
                          ('webhook_gap', 'token_expiring', 'scope_missing', 'rate_limited', 'sync_failed')),
     opened_at          timestamptz not null default now(),
     tried              jsonb not null default '[]',
     resolved_at        timestamptz,
     notified_member_id text
   )`,
  `create unique index connection_incidents_open on connection_incidents (connection_id, kind) where resolved_at is null`,
  "create index connection_incidents_recent on connection_incidents (workspace_id, resolved_at nulls first, opened_at desc)",
  tenantTable("connection_incidents", { membersOnly: true }),
  `create table oauth_states (
     nonce        text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     provider     text not null,
     account_ref  text,
     return_path  text not null,
     expires_at   timestamptz not null,
     used_at      timestamptz,
     created_at   timestamptz not null default now()
   )`,
  tenantTable("oauth_states", { membersOnly: true }),
  `create table sync_cursors (
     connection_id  text not null references connections(id) on delete cascade,
     workspace_id   text not null references workspaces(id) on delete cascade,
     resource       text not null,
     cursor         text,
     watermark_at   timestamptz,
     backfill_state jsonb,
     primary key (connection_id, resource)
   )`,
  tenantTable("sync_cursors", { membersOnly: true }),
  `create table stores (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     connection_id   text not null references connections(id),
     platform        text not null default 'shopify' check (platform = 'shopify'),
     shop_domain     text not null check (shop_domain ~ '^[a-z0-9][a-z0-9-]*\\.myshopify\\.com$'),
     name            text not null,
     country         text,
     currency        text,
     timezone        text,
     plan_name       text,
     status          text not null default 'connecting' check (status in
                       ('connecting', 'connected', 'action_required', 'disconnected')),
     connected_at    timestamptz,
     disconnected_at timestamptz,
     last_synced_at  timestamptz,
     ships_to        text[] not null default '{}',
     policies        jsonb not null default '{}',
     payment_methods text[] not null default '{}',
     created_at      timestamptz not null default now()
   )`,
  "create index stores_workspace on stores (workspace_id, created_at)",
  // One workspace per connected shop, across all workspaces (`StoreConnectedElsewhere`).
  `create unique index stores_shop_connected on stores (shop_domain) where status <> 'disconnected'`,
  tenantTable("stores"),
  // The routing function reads across workspaces as its owner (row level security is forced, owner included).
  "create policy stores_routing on stores as permissive for select to insyte_owner using (true)",
  // Which workspace a shop belongs to (webhooks, the callback's elsewhere check): ids and status only.
  `create function route_shop(domain text) returns table (workspace_id text, store_id text, status text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select s.workspace_id, s.id, s.status from stores s
         where s.shop_domain = domain and s.status <> 'disconnected';
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function route_shop(text) from public",
  "grant execute on function route_shop(text) to insyte_app"
)
