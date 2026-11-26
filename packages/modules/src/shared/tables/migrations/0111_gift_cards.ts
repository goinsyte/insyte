import { statements } from "../statements.ts"

/*
 * Gift cards hold no stock (M6.3, M9.5): Shopify sells them, but nothing is counted, so they never sell out and never
 * need ordering again.
 *
 * - `products.is_gift_card`: Shopify's `isGiftCard`, mirrored with the product. A gift card's variants are written
 *   untracked (`mirror.ts`), so every stock rule that skips an untracked variant (0079) skips them too.
 * - `close_untracked_stockout()`: a variant that becomes untracked closes its open stock-out period. 0079's trigger
 *   only looks when a count changes, so a variant read again as untracked (a gift card, a product no longer counted)
 *   kept its period, its "is uitverkocht" row and its reorder plate.
 * - The products mirrored before this migration have no flag yet, and the reconcile sweep reads only what changed in
 *   Shopify. Each store's products watermark goes back to its oldest product, so the next sweeps read every product
 *   again (a hundred a sweep, oldest first): its gift cards get the flag, their variants go untracked, and their
 *   periods close. The tables' row level security steps aside for that one update, as 0059 does.
 */
export default statements(
  "alter table products add column is_gift_card boolean not null default false",
  `create or replace function close_untracked_stockout() returns trigger language plpgsql as $$
     begin
       update stockouts set to_at = greatest(from_at, now()) where variant_id = new.id and to_at is null;
       return null;
     end $$`,
  `create trigger variants_untracked_stockout after update of tracked on variants
     for each row when (new.tracked is false and old.tracked is distinct from false)
     execute function close_untracked_stockout()`,
  "alter table sync_cursors no force row level security",
  "alter table products no force row level security",
  "alter table stores no force row level security",
  `update sync_cursors c set watermark_at = least(c.watermark_at, x.oldest - interval '1 minute')
     from (select s.connection_id, min(p.external_updated_at) as oldest
           from products p join stores s on s.id = p.store_id
           where s.connection_id is not null group by s.connection_id) x
     where c.connection_id = x.connection_id and c.resource = 'products'`,
  "alter table stores force row level security",
  "alter table products force row level security",
  "alter table sync_cursors force row level security"
)
