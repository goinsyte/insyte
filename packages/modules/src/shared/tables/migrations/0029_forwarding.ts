import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Forwarding (M8.2; domain.md §5.1). One leg per paid order × supplier: the lines it carries (`line_ids`, kept through a
 * reroute), its state (`lib/forwarding.ts`'s vocabulary), how it went (`via`), and what went wrong (`error_kind` with the
 * founder's two additions, `send_failed` and `supplier_paused`, 2026-11-09). A leg without a supplier is one Insyte could
 * not route (`no_supplier`). `orders.supplier_note` is what suppliers read of the order: the operator's note with the
 * forward, never the internal note.
 */
export default statements(
  "alter table orders add column supplier_note text",
  `create table forwarding_items (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     store_id         text not null references stores(id) on delete cascade,
     order_id         text not null references orders(id) on delete cascade,
     supplier_id      text references suppliers(id) on delete set null,
     from_supplier_id text references suppliers(id) on delete set null,
     line_ids         text[] not null,
     state            text not null check (state in ('to_forward', 'sending', 'awaiting', 'confirmed', 'error',
                                                     'cancelled')),
     via              text check (via in ('portal', 'email', 'api')),
     since            timestamptz not null default now(),
     forwarded_at     timestamptz,
     forwarded_by     text,
     outbox_id        text,
     attempts         integer not null default 0,
     confirm_by       timestamptz,
     confirmed_at     timestamptz,
     confirmed_by     text,
     error_kind       text check (error_kind in ('stock', 'address', 'no_supplier', 'rejected', 'send_failed',
                                                 'supplier_paused')),
     error_note       text,
     operator_note    text,
     created_at       timestamptz not null default now()
   )`,
  `create unique index forwarding_leg on forwarding_items (order_id, coalesce(supplier_id, ''))
     where state <> 'cancelled'`,
  "create index forwarding_queue on forwarding_items (workspace_id, state, since)",
  "create index forwarding_supplier on forwarding_items (supplier_id, state)",
  tenantTable("forwarding_items", { membersOnly: true })
)
