import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The queue on Start (M10.1): what needs the operator before the day ends. Each row is one condition about one record
 * (an order that is late, a return waiting for review, a quality check sent in, a variant sold out, a store that lost
 * its link), kept by the queue's refresh from the records themselves: a condition that holds has one unresolved row
 * (`dedupe_key`), a condition that ends resolves it. Seen ("Markeren als gezien") stays seen while the condition
 * lasts. `area` is the permission area of the record, so a role only sees rows it may open.
 */
export default statements(
  `create table queue_items (
     id            text primary key,
     workspace_id  text not null references workspaces(id) on delete cascade,
     kind          text not null check (kind in ('order_delayed', 'return_review', 'quality_review', 'stock_out',
                                                  'store_disconnected')),
     area          text not null,
     subject_type  text not null,
     subject_id    text not null,
     store_id      text references stores(id) on delete cascade,
     dedupe_key    text not null,
     signal        text not null check (signal in ('red', 'amber', 'green', 'idle')),
     title         text not null,
     value_minor   bigint,
     currency      text,
     due_at        timestamptz,
     state         text not null default 'open' check (state in ('open', 'seen', 'resolved')),
     proposal_id   text,
     decided_by    text,
     decided_at    timestamptz,
     resolved_at   timestamptz,
     created_at    timestamptz not null default now(),
     updated_at    timestamptz not null default now()
   )`,
  "create unique index queue_items_live on queue_items (workspace_id, dedupe_key) where resolved_at is null",
  "create index queue_items_open on queue_items (workspace_id, state, signal, due_at)",
  tenantTable("queue_items", { membersOnly: true }),
  // The 15-minute sweep's workspaces: those with a store, whose queue it brings up to date. Ids only.
  `create function queue_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct s.workspace_id from stores s;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function queue_workspaces() from public",
  "grant execute on function queue_workspaces() to insyte_app"
)
