import { statements } from "../../statements.ts"

/**
 * The supplier portal counts a product's stock as the console does (`VARIANT_UNITS`): a variant Shopify does not count
 * (`variants.tracked` false, 0079) is no stock at nothing. `supplier_variants_v` (0075) gains `tracked` for it, after
 * its columns, as `create or replace view` allows: every column it had stays, by its name and in its place, and its
 * grants with it. A contract view of 0075, so in `contract/`; additive only, it follows any release.
 */
export default statements(
  `create or replace view supplier_variants_v with (security_invoker = false) as
     select v.id, v.workspace_id, v.product_id, v.title, v.sku, v.position, v.tracked
     from variants v
     where app_principal_kind() = 'supplier_contact' and v.workspace_id = app_workspace_id()
       and exists (select 1 from product_supply ps where ps.product_id = v.product_id
                   and ps.supplier_id = app_partner_id())`
)
