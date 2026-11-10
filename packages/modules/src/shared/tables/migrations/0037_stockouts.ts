import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Stock-outs (M9.5; domain.md §4.8): the periods a variant could not be sold, derived from `inventory_levels` and never
 * typed. A trigger keeps them, so every writer of stock counts (Shopify's `inventory_levels/update`, a supplier's own
 * stock report) is covered without either knowing: when a variant's stock reaches nothing a period opens, and when it
 * comes back the period closes. Shopify's count is the variant's stock where the store reports one; a supplier's count
 * stands in where it does not. The finding detector (M14) reads them.
 */
export default statements(
  `create table stockouts (
     workspace_id text not null references workspaces(id) on delete cascade,
     store_id     text not null references stores(id) on delete cascade,
     product_id   text not null references products(id) on delete cascade,
     variant_id   text not null references variants(id) on delete cascade,
     from_at      timestamptz not null,
     to_at        timestamptz,
     primary key (variant_id, from_at),
     check (to_at is null or to_at >= from_at)
   )`,
  "create unique index stockouts_open on stockouts (variant_id) where to_at is null",
  "create index stockouts_product on stockouts (workspace_id, product_id, from_at desc)",
  tenantTable("stockouts", { membersOnly: true }),
  `create function track_stockout() returns trigger language plpgsql as $$
     declare
       stock integer;
       v record;
     begin
       select coalesce(
                (select sum(available) from inventory_levels where variant_id = new.variant_id and source = 'shopify'),
                (select sum(available) from inventory_levels where variant_id = new.variant_id and source = 'supplier'))
         into stock;
       if stock is null then return new; end if;
       if stock <= 0 then
         select store_id, product_id into v from variants where id = new.variant_id;
         insert into stockouts (workspace_id, store_id, product_id, variant_id, from_at)
         values (new.workspace_id, v.store_id, v.product_id, new.variant_id, coalesce(new.reported_at, now()))
         on conflict (variant_id) where to_at is null do nothing;
       else
         update stockouts set to_at = greatest(from_at, coalesce(new.reported_at, now()))
         where variant_id = new.variant_id and to_at is null;
       end if;
       return new;
     end $$`,
  `create trigger inventory_levels_stockout after insert or update of available on inventory_levels
     for each row execute function track_stockout()`
)
