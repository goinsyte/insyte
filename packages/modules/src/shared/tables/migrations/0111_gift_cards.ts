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
 * - `stores.gift_cards_read_at`: when the reconcile sweep last read the store's gift cards on their own. The products
 *   mirrored before this migration (or by an import that was running when it came) have no flag, and the sweep reads
 *   only what changed in Shopify; so a store's next sweep reads its gift cards once (`gift_card:true`) and notes it.
 */
export default statements(
  "alter table products add column is_gift_card boolean not null default false",
  "alter table stores add column gift_cards_read_at timestamptz",
  `create or replace function close_untracked_stockout() returns trigger language plpgsql as $$
     begin
       update stockouts set to_at = greatest(from_at, now()) where variant_id = new.id and to_at is null;
       return null;
     end $$`,
  `create trigger variants_untracked_stockout after update of tracked on variants
     for each row when (new.tracked is false and old.tracked is distinct from false)
     execute function close_untracked_stockout()`
)
