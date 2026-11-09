import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Customer merges and duplicates (M7.4). A profile merged into another keeps its row with `merged_into`: the lists
 * leave it out, its orders move to the survivor (the mirror keeps them there as Shopify updates them), and the
 * survivor counts its orders and value. `customer_not_duplicates` holds the groups an operator said are different
 * people, by who is in them, so the review does not ask again.
 */
export default statements(
  "alter table customers add column merged_into text references customers(id) on delete set null",
  "alter table customers add column merged_at timestamptz",
  "create index customers_merged on customers (merged_into) where merged_into is not null",
  `create table customer_not_duplicates (
     workspace_id text not null references workspaces(id) on delete cascade,
     key          text not null,
     decided_by   text not null,
     decided_at   timestamptz not null default now(),
     primary key (workspace_id, key)
   )`,
  tenantTable("customer_not_duplicates", { membersOnly: true })
)
