import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The shopper's mails about their order (M10.2), in the store's name: at M10 the delay mail a filed plate sends. A row
 * is put in line on the filing's transaction with the words it will carry, and the relay's mail sink sends it once the
 * undo window has passed; an undo calls it off first. Once per order and kind: a second is refused while one is in line
 * or went. A mail that did not go keeps why (`error`), and the plate offers to try again.
 *
 * Proposals gain `expired` (domain.md §12.7): an open plate past its `expires_at` is set aside by the queue's refresh.
 */
export default statements(
  `create table order_mails (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     order_id     text not null references orders(id) on delete cascade,
     kind         text not null check (kind in ('delay')),
     state        text not null default 'scheduled' check (state in ('scheduled', 'sent', 'cancelled', 'failed')),
     to_address   text not null,
     subject      text not null,
     paragraphs   text[] not null,
     error        text,
     created_by   text not null,
     created_at   timestamptz not null default now(),
     sent_at      timestamptz
   )`,
  "create unique index order_mails_once on order_mails (order_id, kind) where state in ('scheduled', 'sent')",
  "create index order_mails_ws on order_mails (workspace_id, order_id)",
  tenantTable("order_mails", { membersOnly: true }),
  "alter table proposals drop constraint proposals_state_check",
  `alter table proposals add constraint proposals_state_check
     check (state in ('open', 'filed', 'executed', 'execution_failed', 'discarded', 'superseded', 'reverted',
                      'expired'))`
)
