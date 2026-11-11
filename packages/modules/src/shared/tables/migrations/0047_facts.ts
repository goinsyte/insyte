import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Daily facts, first split (M10.4; domain.md §10, ADR-0017, widgets/02 §0): orders by the day they were placed,
 * refunds by the day they were made, deliveries by the day they arrived, each day a `date` in the store's timezone
 * (the workspace's where the store has none). The rows stay the truth; a fact row is a day's sum of them, recomputed
 * whole from the rows, never added to. Which days need it is kept by triggers, so every writer (the Shopify mirror,
 * webhooks, Insyte's own commands, a supplier's parcel, AfterShip) is covered without knowing: a change to an order,
 * its lines, refunds, parcels or deliveries marks every day that order counts on (`fact_dirty_days`), and the day a
 * changed timestamp used to fall on. A refund twenty days after the order therefore marks its refund day and the
 * order's own day, so both are rebuilt (widgets/02's "targeted rebuild"). The `facts` sink drains the marks; a
 * nightly pass marks the last three days of every store as well.
 *
 * Order-level figures sit at a product × supplier grain: the order's counts land on its first line's row (so summing
 * any slice of rows counts each order once), its money is shared over its lines by their amounts with the remainder on
 * the first line (so the shares add up to the order exactly), and units are per line. Dimensions a row lacks are null.
 * The amounts are in the order's currency; conversion is the reader's, at the day's `fx_rates` (§0.4).
 */
export default statements(
  // When the shopper was told the order would arrive (domain.md §4.1): on time is delivered on or before it. Nothing
  // fills it yet; until it is, an order is late when Insyte flagged it delayed.
  "alter table orders add column promised_by timestamptz",
  // For the refund and delivery days' rebuilds.
  "create index refunds_day on refunds (store_id, created_at)",
  "create index fulfilments_delivered on fulfilments (store_id, delivered_at) where delivered_at is not null",
  "create index deliveries_delivered on deliveries (workspace_id, delivered_at) where delivered_at is not null",
  `create table fact_dirty_days (
     workspace_id text not null references workspaces(id) on delete cascade,
     store_id     text not null references stores(id) on delete cascade,
     day          date not null,
     marked_at    timestamptz not null default now(),
     primary key (store_id, day)
   )`,
  "create index fact_dirty_days_workspace on fact_dirty_days (workspace_id, marked_at)",
  // Not members-only: a supplier's parcel marks its order's days too. It holds a store and a day, nothing else.
  tenantTable("fact_dirty_days"),
  `create table fact_orders_day (
     workspace_id          text not null references workspaces(id) on delete cascade,
     store_id              text not null references stores(id) on delete cascade,
     day                   date not null,
     country               text,
     product_id            text,
     supplier_id           text,
     channel               text,
     currency              text not null,
     orders                integer not null default 0,
     paid_orders           integer not null default 0,
     counted_orders        integer not null default 0,
     counted_revenue_minor bigint not null default 0,
     units                 integer not null default 0,
     revenue_minor         bigint not null default 0,
     refunds               integer not null default 0,
     refunded_minor        bigint not null default 0,
     cancelled             integer not null default 0
   )`,
  `create unique index fact_orders_day_grain on fact_orders_day
     (store_id, day, country, product_id, supplier_id, channel, currency) nulls not distinct`,
  "create index fact_orders_day_range on fact_orders_day (workspace_id, day)",
  tenantTable("fact_orders_day", { membersOnly: true }),
  `create table fact_refunds_day (
     workspace_id text not null references workspaces(id) on delete cascade,
     store_id     text not null references stores(id) on delete cascade,
     day          date not null,
     reason       text,
     product_id   text,
     supplier_id  text,
     currency     text not null,
     refunds      integer not null default 0,
     amount_minor bigint not null default 0
   )`,
  `create unique index fact_refunds_day_grain on fact_refunds_day
     (store_id, day, reason, product_id, supplier_id, currency) nulls not distinct`,
  "create index fact_refunds_day_range on fact_refunds_day (workspace_id, day)",
  tenantTable("fact_refunds_day", { membersOnly: true }),
  `create table fact_deliveries_day (
     workspace_id  text not null references workspaces(id) on delete cascade,
     store_id      text not null references stores(id) on delete cascade,
     day           date not null,
     supplier_id   text,
     country       text,
     parcels       integer not null default 0,
     on_time       integer not null default 0,
     late          integer not null default 0,
     days_late_sum integer not null default 0,
     took_days_sum integer not null default 0
   )`,
  `create unique index fact_deliveries_day_grain on fact_deliveries_day (store_id, day, supplier_id, country)
     nulls not distinct`,
  "create index fact_deliveries_day_range on fact_deliveries_day (workspace_id, day)",
  tenantTable("fact_deliveries_day", { membersOnly: true }),
  // Every day these orders count on (placed, refunded, delivered), plus one more moment each (`ats`, aligned with
  // `ids`, null for none). As `system`, so a supplier's own write (a partner principal sees no orders) marks them too.
  `create function facts_mark(ids text[], ats timestamptz[]) returns void
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       if ids is null or cardinality(ids) = 0 then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       insert into fact_dirty_days (workspace_id, store_id, day)
       select distinct o.workspace_id, o.store_id, (t.at at time zone coalesce(s.timezone, w.timezone))::date
       from unnest(ids, ats) as x(order_id, extra)
       join orders o on o.id = x.order_id
       join stores s on s.id = o.store_id
       join workspaces w on w.id = o.workspace_id
       cross join lateral (
         select o.placed_at as at
         union all select x.extra
         union all select r.created_at from refunds r where r.order_id = o.id
         union all select f.delivered_at from fulfilments f where f.order_id = o.id
         union all select d.delivered_at from deliveries d where d.order_id = o.id
       ) t
       where t.at is not null
       on conflict (store_id, day) do nothing;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  // The days these moments fell on, per store: what a changed or removed row used to count on.
  `create function facts_mark_days(stores text[], ats timestamptz[]) returns void
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       if stores is null or cardinality(stores) = 0 then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       insert into fact_dirty_days (workspace_id, store_id, day)
       select distinct s.workspace_id, s.id, (x.at at time zone coalesce(s.timezone, w.timezone))::date
       from unnest(stores, ats) as x(store_id, at)
       join stores s on s.id = x.store_id
       join workspaces w on w.id = s.workspace_id
       where x.at is not null
       on conflict (store_id, day) do nothing;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function facts_mark(text[], timestamptz[]) from public",
  "grant execute on function facts_mark(text[], timestamptz[]) to insyte_app",
  "revoke all on function facts_mark_days(text[], timestamptz[]) from public",
  "grant execute on function facts_mark_days(text[], timestamptz[]) to insyte_app",
  // Statement triggers over the changed rows, so a backfill page of thousands marks its days in one statement.
  `create function facts_orders_touched() returns trigger language plpgsql as $$
     declare ids text[]; stores text[]; ats timestamptz[];
     begin
       if TG_OP <> 'DELETE' then
         select array_agg(id), array_agg(null::timestamptz) into ids, ats from new_rows;
         perform facts_mark(ids, ats);
       end if;
       if TG_OP <> 'INSERT' then
         select array_agg(store_id), array_agg(placed_at) into stores, ats from old_rows;
         perform facts_mark_days(stores, ats);
       end if;
       return null;
     end $$`,
  `create function facts_lines_touched() returns trigger language plpgsql as $$
     declare ids text[]; ats timestamptz[];
     begin
       if TG_OP <> 'DELETE' then
         select array_agg(order_id), array_agg(null::timestamptz) into ids, ats from new_rows;
         perform facts_mark(ids, ats);
       end if;
       if TG_OP <> 'INSERT' then
         select array_agg(order_id), array_agg(null::timestamptz) into ids, ats from old_rows;
         perform facts_mark(ids, ats);
       end if;
       return null;
     end $$`,
  `create function facts_refunds_touched() returns trigger language plpgsql as $$
     declare ids text[]; stores text[]; ats timestamptz[];
     begin
       if TG_OP <> 'DELETE' then
         select array_agg(order_id), array_agg(null::timestamptz) into ids, ats from new_rows;
         perform facts_mark(ids, ats);
       end if;
       if TG_OP <> 'INSERT' then
         select array_agg(order_id), array_agg(store_id), array_agg(created_at) into ids, stores, ats from old_rows;
         perform facts_mark(ids, ats);
         perform facts_mark_days(stores, ats);
       end if;
       return null;
     end $$`,
  `create function facts_fulfilments_touched() returns trigger language plpgsql as $$
     declare ids text[]; stores text[]; ats timestamptz[];
     begin
       if TG_OP <> 'DELETE' then
         select array_agg(order_id), array_agg(null::timestamptz) into ids, ats from new_rows;
         perform facts_mark(ids, ats);
       end if;
       if TG_OP <> 'INSERT' then
         select array_agg(order_id), array_agg(store_id), array_agg(delivered_at) into ids, stores, ats from old_rows;
         perform facts_mark(ids, ats);
         perform facts_mark_days(stores, ats);
       end if;
       return null;
     end $$`,
  `create function facts_deliveries_touched() returns trigger language plpgsql as $$
     declare ids text[]; ats timestamptz[];
     begin
       if TG_OP <> 'DELETE' then
         select array_agg(order_id), array_agg(null::timestamptz) into ids, ats from new_rows;
         perform facts_mark(ids, ats);
       end if;
       if TG_OP <> 'INSERT' then
         select array_agg(order_id), array_agg(delivered_at) into ids, ats from old_rows;
         perform facts_mark(ids, ats);
       end if;
       return null;
     end $$`,
  ...[
    ["orders", "facts_orders_touched"],
    ["order_lines", "facts_lines_touched"],
    ["refunds", "facts_refunds_touched"],
    ["fulfilments", "facts_fulfilments_touched"],
    ["deliveries", "facts_deliveries_touched"]
  ].flatMap(([table, fn]) => [
    `create trigger ${table}_facts_insert after insert on ${table} referencing new table as new_rows
       for each statement execute function ${fn}()`,
    `create trigger ${table}_facts_update after update on ${table} referencing old table as old_rows
       new table as new_rows for each statement execute function ${fn}()`,
    `create trigger ${table}_facts_delete after delete on ${table} referencing old table as old_rows
       for each statement execute function ${fn}()`
  ]),
  // A store whose timezone changed counts on other days: the days its facts are on now, and every day its orders
  // count on in the new zone, are marked.
  `create function facts_store_timezone() returns trigger language plpgsql as $$
     begin
       insert into fact_dirty_days (workspace_id, store_id, day)
       select new.workspace_id, new.id, f.day from (
         select day from fact_orders_day where store_id = new.id
         union select day from fact_refunds_day where store_id = new.id
         union select day from fact_deliveries_day where store_id = new.id
       ) f
       on conflict (store_id, day) do nothing;
       perform facts_mark(array(select id from orders where store_id = new.id),
                          array(select null::timestamptz from orders where store_id = new.id));
       return null;
     end $$`,
  `create trigger stores_facts_timezone after update of timezone on stores
     for each row when (old.timezone is distinct from new.timezone) execute function facts_store_timezone()`,
  // The sweep's workspaces, read across workspaces as the owner (row level security is forced, owner included): those
  // with days to rebuild, or (`with_stores`, the nightly pass) every workspace with a store. Ids only.
  "create policy fact_dirty_days_routing on fact_dirty_days as permissive for select to insyte_owner using (true)",
  `create function facts_workspaces(with_stores boolean) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       if with_stores then
         return query select distinct s.workspace_id from stores s;
       else
         return query select distinct d.workspace_id from fact_dirty_days d;
       end if;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function facts_workspaces(boolean) from public",
  "grant execute on function facts_workspaces(boolean) to insyte_app"
)
