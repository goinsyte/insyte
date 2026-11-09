import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * An order's internal note (M7.1): what a person on the team typed about it, never sent to Shopify and never shown
 * to a supplier. One per order, edited in place; `orders.note` stays the shopper's own note from the checkout.
 */
export default statements(
  `create table order_notes (
     order_id     text primary key references orders(id) on delete cascade,
     workspace_id text not null references workspaces(id) on delete cascade,
     body         text not null check (length(body) between 1 and 5000),
     updated_by   text not null,
     updated_at   timestamptz not null default now()
   )`,
  "create index order_notes_workspace on order_notes (workspace_id)",
  tenantTable("order_notes", { membersOnly: true })
)
