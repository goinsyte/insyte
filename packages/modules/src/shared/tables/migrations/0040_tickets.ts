import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Tickets (M11 step 3; domain.md §6.1, §12.3): the board's work, numbered `#n` from `workspace_counters(ticket)`, the one
 * scheme. Who has it, who follows it and its labels are rows of their own; its activity is `ticket_comments`, every
 * kind in one table so the card's comment count is one query. `position` is one ordering over the workspace's
 * tickets, as the design's board keeps them in one list: a column shows its tickets in that order. The four set-aside
 * fields are orthogonal to the status; "open" is not done and none of them set. At most one related record, by its
 * own foreign key; chargebacks have no table yet (M12), so a ticket names an order or a customer. A ticket made by hand
 * has no store; one about an order or a customer is in that record's store, so a role fenced to stores sees only its
 * own. The workspace's own templates sit beside the system ones the code holds.
 */
export default statements(
  `create table tickets (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     number          bigint not null,
     title           text not null check (btrim(title) <> '' and char_length(title) <= 200),
     description     text not null default '' check (char_length(description) <= 20000),
     status          text not null default 'intake'
                       check (status in ('intake', 'in_progress', 'awaiting_reply', 'done')),
     priority        text not null default 'medium' check (priority in ('low', 'medium', 'high')),
     position        double precision not null default 0,
     source          text not null default 'manual'
                       check (source in ('gmail', 'outlook', 'shopify', 'klarna', 'chat', 'insyte', 'manual',
                                         'supplier')),
     source_ref      text,
     store_id        text references stores(id) on delete set null,
     order_id        text references orders(id) on delete set null,
     customer_id     text references customers(id) on delete set null,
     template        text,
     topic           text,
     due_at          timestamptz,
     resolved_at     timestamptz,
     snoozed_until   timestamptz,
     archived_at     timestamptz,
     deleted_at      timestamptz,
     spam_at         timestamptz,
     created_by      text not null,
     created_at      timestamptz not null default now(),
     updated_at      timestamptz not null default now(),
     check (num_nonnulls(order_id, customer_id) <= 1)
   )`,
  "create unique index tickets_number on tickets (workspace_id, number)",
  "create index tickets_board on tickets (workspace_id, position)",
  "create index tickets_order on tickets (order_id) where order_id is not null",
  "create index tickets_customer on tickets (customer_id) where customer_id is not null",
  "create trigger tickets_touch before update on tickets for each row execute function touch_updated_at()",
  tenantTable("tickets", { membersOnly: true }),
  `create table ticket_assignees (
     workspace_id text not null references workspaces(id) on delete cascade,
     ticket_id    text not null references tickets(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     assigned_by  text not null,
     assigned_at  timestamptz not null default now(),
     primary key (ticket_id, member_id)
   )`,
  "create index ticket_assignees_member on ticket_assignees (workspace_id, member_id)",
  tenantTable("ticket_assignees", { membersOnly: true }),
  `create table ticket_watchers (
     workspace_id text not null references workspaces(id) on delete cascade,
     ticket_id    text not null references tickets(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     since        timestamptz not null default now(),
     primary key (ticket_id, member_id)
   )`,
  tenantTable("ticket_watchers", { membersOnly: true }),
  `create table ticket_labels (
     workspace_id text not null references workspaces(id) on delete cascade,
     ticket_id    text not null references tickets(id) on delete cascade,
     label        text not null check (btrim(label) <> '' and char_length(label) <= 60),
     position     integer not null default 0,
     primary key (ticket_id, label)
   )`,
  "create index ticket_labels_ws on ticket_labels (workspace_id, label)",
  tenantTable("ticket_labels", { membersOnly: true }),
  `create table ticket_comments (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     ticket_id    text not null references tickets(id) on delete cascade,
     kind         text not null default 'comment' check (kind in ('comment', 'activity', 'ai_summary', 'email_sent')),
     author_kind  text not null,
     author_id    text not null,
     body         text not null check (btrim(body) <> '' and char_length(body) <= 5000),
     mentions     text[] not null default '{}',
     created_at   timestamptz not null default now(),
     edited_at    timestamptz,
     deleted_at   timestamptz
   )`,
  "create index ticket_comments_ticket on ticket_comments (ticket_id, created_at desc)",
  tenantTable("ticket_comments", { membersOnly: true }),
  `create table ticket_templates (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     label        text not null check (btrim(label) <> ''),
     title        text not null default '',
     description  text not null default '',
     priority     text not null default 'medium' check (priority in ('low', 'medium', 'high')),
     labels       text[] not null default '{}',
     position     integer not null default 0,
     created_by   text not null,
     created_at   timestamptz not null default now(),
     deleted_at   timestamptz
   )`,
  tenantTable("ticket_templates", { membersOnly: true })
)
