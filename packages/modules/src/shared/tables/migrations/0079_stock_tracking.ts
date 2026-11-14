import { statements } from "../statements.ts"

/*
 * Stock that is real (M6.3, M7 9.3): which variants Shopify counts, when the import last saw a count, and the reads
 * over them made cheap.
 *
 * - `variants.tracked`: Shopify's `inventoryItem.tracked`. A variant it does not count (dropshipping often does not)
 *   has no stock: it is left out of a product's units, its level, the low-stock list and the stock-outs. `null` until
 *   the variant is read again, and counted as tracked meanwhile, as before.
 * - `inventory_levels.imported_at`: when a products import last saw this count. A Shopify count the latest complete
 *   import did not see, and that no webhook reported since it began, is gone from Shopify and is removed.
 * - `track_stockout()` (0037) counts each location at nothing or more (a negative count is an oversell, not stock),
 *   skips an untracked variant (closing its open period), follows a removed count, and steps aside while an import
 *   writes counts (`insyte.stock_import`): a variant's counts can span two pages, so the import settles the periods
 *   once its products are in, instead of opening one between pages.
 * - `order_lines (product_id, order_id)`: a product's orders, newest mirrored first (ids sort by creation), for its
 *   pace, its open orders and its delivery time. `variants (store_id, inventory_item_id)`: a count finds its variant.
 */
export default statements(
  "alter table variants add column tracked boolean",
  "alter table inventory_levels add column imported_at timestamptz",
  "create index order_lines_product on order_lines (product_id, order_id) where product_id is not null",
  "create index variants_inventory_item on variants (store_id, inventory_item_id) where inventory_item_id is not null",
  `create or replace function track_stockout() returns trigger language plpgsql as $$
     declare
       vid text := coalesce(new.variant_id, old.variant_id);
       at timestamptz := coalesce(new.reported_at, now());
       stock integer;
       v record;
     begin
       if coalesce(current_setting('insyte.stock_import', true), '') = 'on' then return null; end if;
       select store_id, product_id, tracked into v from variants where id = vid;
       if not found then return null; end if;
       if v.tracked is false then
         update stockouts set to_at = greatest(from_at, at) where variant_id = vid and to_at is null;
         return null;
       end if;
       select coalesce(
                (select sum(greatest(available, 0)) from inventory_levels where variant_id = vid and source = 'shopify'),
                (select sum(greatest(available, 0)) from inventory_levels where variant_id = vid and source = 'supplier'))
         into stock;
       if stock is null then
         update stockouts set to_at = greatest(from_at, at) where variant_id = vid and to_at is null;
       elsif stock <= 0 then
         insert into stockouts (workspace_id, store_id, product_id, variant_id, from_at)
         values (coalesce(new.workspace_id, old.workspace_id), v.store_id, v.product_id, vid, at)
         on conflict (variant_id) where to_at is null do nothing;
       else
         update stockouts set to_at = greatest(from_at, at) where variant_id = vid and to_at is null;
       end if;
       return null;
     end $$`,
  `create or replace trigger inventory_levels_stockout after insert or update of available or delete on inventory_levels
     for each row execute function track_stockout()`
)
