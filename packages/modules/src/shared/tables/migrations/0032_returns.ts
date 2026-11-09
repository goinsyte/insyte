import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Returns and claims (M9.1; domain.md §4.7, §12.17). One table for both, because the queue, the resolutions and the
 * portal are shared; the vocabularies are `lib/returns.ts`'s. A return's lines point at the order's lines, its history
 * is `return_events`. The settings are one row per workspace with the reasons, product rules, addresses and the claim
 * flow beside it, made with the code's defaults the first time they are read. `returns.quality` is the reason's
 * `counts_for_quality` when the return was made, so changing a reason later does not rewrite a product's history.
 */
export default statements(
  `create table return_settings (
     workspace_id        text primary key references workspaces(id) on delete cascade,
     return_days         integer not null default 30 check (return_days between 0 and 365),
     claim_days          integer not null default 60 check (claim_days between 0 and 365),
     special_windows     jsonb not null default '[]',
     offered_resolutions text[] not null default '{refund,exchange,gift_card,replacement}',
     gift_card_bonus_pct numeric(5, 2) not null default 10 check (gift_card_bonus_pct between 0 and 100),
     exchange_fee_minor  bigint not null default 0 check (exchange_fee_minor >= 0),
     reject_reasons      text[] not null default '{}',
     portal_on           boolean not null default false,
     portal_slug         text not null,
     portal_intro        text not null default '',
     portal_done         text not null default '',
     updated_by          text,
     updated_at          timestamptz not null default now()
   )`,
  "create unique index return_settings_slug on return_settings (portal_slug)",
  tenantTable("return_settings"),
  `create table return_reasons (
     id                 text not null,
     workspace_id       text not null references workspaces(id) on delete cascade,
     label              text not null check (btrim(label) <> ''),
     type               text not null check (type in ('return', 'claim', 'both')),
     photo_required     boolean not null default false,
     counts_for_quality boolean not null default false,
     window_days        integer check (window_days between 1 and 365),
     position           integer not null default 0,
     primary key (workspace_id, id)
   )`,
  tenantTable("return_reasons"),
  `create table return_rules (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     match        text not null check (match in ('product', 'variant', 'shopify_tag')),
     match_ref    text not null,
     label        text not null default '',
     policy       text not null check (policy in ('not_returnable', 'refund_only', 'exchange_only')),
     note         text not null check (btrim(note) <> ''),
     window_days  integer check (window_days between 1 and 365),
     position     integer not null default 0
   )`,
  "create index return_rules_ws on return_rules (workspace_id, position)",
  tenantTable("return_rules"),
  `create table return_addresses (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     country          text not null,
     label            text not null,
     address          text not null,
     carrier          text not null check (carrier in ('PostNL', 'DHL', 'DPD', 'UPS')),
     label_cost_minor bigint not null default 0,
     qr               boolean not null default false
   )`,
  "create unique index return_addresses_country on return_addresses (workspace_id, country)",
  tenantTable("return_addresses", { membersOnly: true }),
  `create table claim_flows (
     workspace_id text primary key references workspaces(id) on delete cascade,
     steps        text[] not null default '{}',
     solutions    text[] not null default '{refund,replacement,gift_card}'
   )`,
  tenantTable("claim_flows"),
  `create table returns (
     id                   text primary key,
     workspace_id         text not null references workspaces(id) on delete cascade,
     store_id             text not null references stores(id) on delete cascade,
     number               text not null,
     type                 text not null check (type in ('return', 'claim')),
     order_id             text not null references orders(id) on delete cascade,
     customer_id          text references customers(id) on delete set null,
     customer_name        text not null default '',
     customer_email       text,
     country              text,
     source               text not null check (source in ('portal', 'operator', 'agent', 'shopify')),
     status               text not null check (status in
                            ('review', 'awaiting_parcel', 'in_transit', 'received', 'ready', 'resolved', 'rejected')),
     reason_id            text not null,
     customer_note        text not null default '',
     requested_resolution text not null check (requested_resolution in
                            ('refund', 'exchange', 'gift_card', 'replacement', 'discount')),
     exchange_to          text,
     keep_item            boolean not null default false,
     resolution           text check (resolution in ('refund', 'exchange', 'gift_card', 'replacement', 'discount')),
     resolution_minor     bigint,
     currency             text not null,
     gift_card_bonus_pct  numeric(5, 2),
     exchange_fee_minor   bigint,
     label                jsonb,
     assignee_id          text,
     review_deadline      timestamptz not null,
     quality              boolean not null default false,
     tags                 text[] not null default '{}',
     delivered_at         timestamptz,
     window_until         timestamptz,
     outside_window       boolean not null default false,
     rule_id              text,
     received_at          timestamptz,
     inspected_at         timestamptz,
     resolved_at          timestamptz,
     resolved_by          text,
     replacement_order_id text references orders(id) on delete set null,
     rejected_reason      text,
     refund_id            text,
     shopify_return_id    text,
     created_by           text not null,
     created_at           timestamptz not null default now(),
     updated_at           timestamptz not null default now()
   )`,
  "create unique index returns_number on returns (workspace_id, number)",
  "create index returns_list on returns (workspace_id, created_at desc, id desc)",
  "create index returns_order on returns (order_id)",
  "create index returns_customer on returns (customer_id) where customer_id is not null",
  "create index returns_review on returns (workspace_id, review_deadline) where status = 'review'",
  "create trigger returns_touch before update on returns for each row execute function touch_updated_at()",
  tenantTable("returns", { membersOnly: true }),
  `create table return_lines (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     return_id     text not null references returns(id) on delete cascade,
     order_line_id text not null references order_lines(id) on delete cascade,
     quantity      integer not null check (quantity > 0),
     condition     text check (condition in ('ok', 'damaged', 'missing')),
     restock       boolean not null default false,
     photos        text[] not null default '{}'
   )`,
  "create index return_lines_return on return_lines (return_id)",
  "create index return_lines_order_line on return_lines (order_line_id)",
  tenantTable("return_lines", { membersOnly: true }),
  `create table return_events (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     return_id    text not null references returns(id) on delete cascade,
     at           timestamptz not null default now(),
     actor        text not null check (actor in ('shopper', 'team', 'carrier', 'insyte', 'hub')),
     name         text,
     kind         text not null check (kind in ('requested', 'approved', 'rejected', 'reopened', 'label_issued',
                                                 'in_transit', 'received', 'inspected', 'resolved', 'assigned',
                                                 'note', 'email_sent')),
     text         text not null,
     data         jsonb not null default '{}'
   )`,
  "create index return_events_return on return_events (return_id, at)",
  tenantTable("return_events", { membersOnly: true })
)
