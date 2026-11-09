import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Suppliers (M8.1; domain.md §5). A supplier is the workspace's own record: made by hand ("Nieuwe leverancier") or from
 * a Shopify vendor on import (`vendor`, lowercased, so one vendor is one supplier and a removed one is not made again).
 * `product_supply` says who supplies a product; the primary row is the supplier of every line of it (M8's one rule).
 * How orders reach a supplier (`forward_channel`, `auto_forward`, `confirm_within_hours`) is read by forwarding (M8.2).
 * `supplier_contacts` is created empty (the portal fills it, M16); `supplier_integrations` holds a custom API (M8.2).
 */
export default statements(
  `create table suppliers (
     id                   text primary key,
     workspace_id         text not null references workspaces(id) on delete cascade,
     name                 text not null check (btrim(name) <> ''),
     contact_email        text,
     contact_phone        text,
     description          text not null default '',
     bio                  text not null default '',
     status               text not null default 'active' check (status in ('active', 'pending', 'inactive')),
     paused_at            timestamptz,
     auto_forward         boolean not null default false,
     forward_channel      text not null default 'email' check (forward_channel in ('portal', 'email', 'api')),
     forward_email        text,
     confirm_within_hours integer not null default 24 check (confirm_within_hours between 1 and 168),
     default_lead_days    integer not null default 2 check (default_lead_days between 0 and 30),
     stock_mode           text not null default 'manual' check (stock_mode in ('live', 'indicator', 'manual')),
     timezone             text not null default 'Europe/Amsterdam',
     vendor               text,
     created_by           text not null,
     created_at           timestamptz not null default now(),
     updated_at           timestamptz not null default now(),
     deleted_at           timestamptz
   )`,
  "create unique index suppliers_name on suppliers (workspace_id, lower(name)) where deleted_at is null",
  "create unique index suppliers_vendor on suppliers (workspace_id, vendor) where vendor is not null",
  tenantTable("suppliers", { membersOnly: true }),
  `create table supplier_contacts (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     supplier_id   text not null references suppliers(id) on delete cascade,
     user_id       text not null,
     name          text not null default '',
     role          text not null default 'staff' check (role in ('owner', 'staff')),
     portal_scopes text[] not null default '{orders}',
     notify        text[] not null default '{new_order,message,late}',
     invited_by    text,
     joined_at     timestamptz,
     revoked_at    timestamptz
   )`,
  "create unique index supplier_contacts_user on supplier_contacts (workspace_id, supplier_id, user_id)",
  tenantTable("supplier_contacts", { membersOnly: true }),
  `create table supplier_integrations (
     supplier_id   text primary key references suppliers(id) on delete cascade,
     workspace_id  text not null references workspaces(id) on delete cascade,
     kind          text not null default 'none' check (kind in ('none', 'custom')),
     enabled       boolean not null default false,
     webhook_url   text,
     secret_sealed text,
     last_ping_ok  boolean,
     last_ping_at  timestamptz,
     last_ping_ms  integer
   )`,
  tenantTable("supplier_integrations", { membersOnly: true }),
  `create table product_supply (
     workspace_id text not null references workspaces(id) on delete cascade,
     product_id   text not null references products(id) on delete cascade,
     supplier_id  text not null references suppliers(id) on delete cascade,
     is_primary   boolean not null default true,
     lead_days    integer not null default 2 check (lead_days between 0 and 30),
     created_at   timestamptz not null default now(),
     primary key (product_id, supplier_id)
   )`,
  "create unique index product_supply_primary on product_supply (product_id) where is_primary",
  "create index product_supply_supplier on product_supply (supplier_id)",
  tenantTable("product_supply", { membersOnly: true })
)
