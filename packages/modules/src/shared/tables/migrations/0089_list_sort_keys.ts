import { statements } from "../statements.ts"

/*
 * The long lists' own orders (W3.1): Producten by title and Klanten by name, without case, the id breaking a tie, as
 * `PRODUCT_SORTS` and `CUSTOMER_SORTS` page them. Orders already have theirs (`orders_list`). Plain, not concurrent: a
 * migration runs in one transaction, and the tables are small enough for the build's short lock.
 */
export default statements(
  "create index if not exists products_title_key on products (workspace_id, lower(title), id)",
  "create index if not exists customers_name_key on customers (workspace_id, lower(name), id)"
)
