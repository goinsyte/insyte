import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Supplier statements (M13 step 6; domain.md §5, widgets/06 §0.5): what the brand owes each supplier for a month, line
 * by line. The monthly close (the 1st, 03:00 UTC) writes last month's, once per supplier and month: the lines the
 * supplier shipped at their cost price, less the supplier-fault returns refunded, in the workspace's currency (a cost
 * in another store currency at that day's `fx_rates`). A line booked once is never booked again, so a parcel or return
 * that arrives after its month closed lands in the next statement, and a closed month is never reopened. A line
 * without a cost price (or without a rate) is kept with `missing` and counts nothing, never priced at a guess.
 *
 * - `supplier_statements.status`: `processing` once closed ("Wordt verwerkt"), `paid` when the brand marks it paid. The
 *   running month (`open`, "Lopend") is not stored: it is read live from the same rule.
 * - `invoice_file_id`: the statement as a PDF (Browser Rendering), in the files bucket.
 * - `statement_workspaces()`: the close's workspaces, those with a supplier. Ids only.
 *
 * Members only for now; the supplier's own projection comes with the portal (M16).
 */
export default statements(
  `create table supplier_statements (
     id                text primary key,
     workspace_id      text not null references workspaces(id) on delete cascade,
     supplier_id       text not null references suppliers(id) on delete cascade,
     month             text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
     status            text not null default 'processing' check (status in ('open', 'processing', 'paid')),
     currency          char(3) not null,
     shipped_minor     bigint not null default 0,
     corrections_minor bigint not null default 0,
     total_minor       bigint not null default 0,
     shipped_lines     integer not null default 0,
     missing_lines     integer not null default 0,
     pay_day           date not null,
     closed_at         timestamptz not null default now(),
     paid_at           timestamptz,
     paid_by           text,
     paid_reference    text check (length(paid_reference) <= 120),
     invoice_file_id   text,
     created_at        timestamptz not null default now()
   )`,
  "create unique index supplier_statements_month on supplier_statements (workspace_id, supplier_id, month)",
  "create index supplier_statements_list on supplier_statements (workspace_id, month desc)",
  tenantTable("supplier_statements", { membersOnly: true }),
  `create table supplier_statement_lines (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     statement_id    text not null references supplier_statements(id) on delete cascade,
     supplier_id     text not null references suppliers(id) on delete cascade,
     kind            text not null check (kind in ('shipped', 'correction')),
     order_id        text references orders(id) on delete set null,
     order_line_id   text references order_lines(id) on delete set null,
     order_number    text not null,
     day             date not null,
     title           text not null,
     qty             integer not null check (qty > 0),
     unit_cost_minor bigint,
     total_minor     bigint not null default 0,
     missing         text check (missing in ('cost', 'rate')),
     reason          text,
     return_id       text references returns(id) on delete set null,
     return_line_id  text
   )`,
  "create index supplier_statement_lines_statement on supplier_statement_lines (statement_id, day, id)",
  // What is booked: a shipped line once per supplier, a returned one once per return line.
  `create unique index supplier_statement_lines_shipped on supplier_statement_lines (supplier_id, order_line_id)
     where kind = 'shipped'`,
  `create unique index supplier_statement_lines_correction on supplier_statement_lines (supplier_id, return_line_id)
     where kind = 'correction'`,
  tenantTable("supplier_statement_lines", { membersOnly: true }),
  `create function statement_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct s.workspace_id from suppliers s where s.deleted_at is null;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function statement_workspaces() from public",
  "grant execute on function statement_workspaces() to insyte_app"
)
