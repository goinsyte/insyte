import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Mailboxes, threads and messages (M11 steps 1–2; domain.md §6.2, integrations.md §3). A mailbox is where the
 * workspace's support mail arrives: its own Gmail or Outlook account (a connection, M11 step 1b), or the forwarding
 * address Insyte gives it (`support-<slug>@in.goinsyte.com`, Cloudflare Email Routing to the Worker's `email()`
 * handler), to which the operator forwards their own support address (`address`). A thread is a conversation in one
 * mailbox; its messages are what came in and what went out. Bodies are personal data: the text in Postgres, the HTML
 * and attachments in R2 (`files`, kind `attachment`), never in a queue payload or a log.
 *
 * A reply waits out the undo window as `scheduled`; the relay's `support` sink sends it once (`sending` is claimed
 * before the provider is asked), then `sent`, or `failed` with the reason. "1 uur uitstellen" sets `snoozed_until`; a
 * passed snooze is simply back in the inbox, and new mail on the thread wakes it. Spam is `spam_at`, the Prullenbak
 * `deleted_at`. `inbox_threads_v` and `handovers` wait for the channels and the agent (M15).
 */
export default statements(
  `create table mailboxes (
     id                 text primary key,
     workspace_id       text not null references workspaces(id) on delete cascade,
     provider           text not null check (provider in ('forward', 'gmail', 'outlook')),
     connection_id      text references connections(id) on delete set null,
     forwarding_address text unique,
     address            text not null check (btrim(address) <> '' and char_length(address) <= 320),
     label              text not null check (btrim(label) <> '' and char_length(label) <= 60),
     signature          text not null default '' check (char_length(signature) <= 2000),
     is_default         boolean not null default false,
     status             text not null default 'connected' check (status in ('connected', 'disconnected')),
     history_cursor     text,
     last_synced_at     timestamptz,
     created_by         text not null,
     created_at         timestamptz not null default now(),
     disconnected_at    timestamptz,
     check ((provider = 'forward') = (forwarding_address is not null))
   )`,
  "create unique index mailboxes_default on mailboxes (workspace_id) where is_default",
  "create unique index mailboxes_address on mailboxes (workspace_id, lower(address))",
  tenantTable("mailboxes", { membersOnly: true }),
  `create table email_threads (
     id                   text primary key,
     workspace_id         text not null references workspaces(id) on delete cascade,
     mailbox_id           text not null references mailboxes(id) on delete cascade,
     provider_thread_id   text,
     subject              text not null default '' check (char_length(subject) <= 998),
     participants         jsonb not null default '[]',
     last_message_at      timestamptz not null default now(),
     last_message_preview text not null default '',
     unread               boolean not null default true,
     starred              boolean not null default false,
     labels               text[] not null default '{}',
     assignee_id          text references members(id) on delete set null,
     ticket_id            text references tickets(id) on delete set null,
     customer_id          text references customers(id) on delete set null,
     has_attachments      boolean not null default false,
     has_inbound          boolean not null default false,
     archived_at          timestamptz,
     snoozed_until        timestamptz,
     spam_at              timestamptz,
     deleted_at           timestamptz,
     created_at           timestamptz not null default now(),
     updated_at           timestamptz not null default now()
   )`,
  "create index email_threads_inbox on email_threads (workspace_id, last_message_at desc)",
  "create index email_threads_mailbox on email_threads (mailbox_id, last_message_at desc)",
  "create unique index email_threads_provider on email_threads (mailbox_id, provider_thread_id) where provider_thread_id is not null",
  "create index email_threads_ticket on email_threads (ticket_id) where ticket_id is not null",
  "create trigger email_threads_touch before update on email_threads for each row execute function touch_updated_at()",
  tenantTable("email_threads", { membersOnly: true }),
  `create table email_messages (
     id                  text primary key,
     workspace_id        text not null references workspaces(id) on delete cascade,
     thread_id           text not null references email_threads(id) on delete cascade,
     provider_message_id text,
     rfc822_message_id   text not null,
     in_reply_to         text,
     "references"        text[] not null default '{}',
     direction           text not null check (direction in ('inbound', 'outbound')),
     kind                text not null default 'message' check (kind in ('message', 'reply', 'forward')),
     from_name           text not null default '',
     from_address        text not null,
     "to"                jsonb not null default '[]',
     cc                  jsonb not null default '[]',
     subject             text not null default '',
     body_text           text not null default '',
     body_html_key       text,
     sent_at             timestamptz not null default now(),
     sent_by             text,
     send_state          text check (send_state in ('scheduled', 'sending', 'sent', 'failed')),
     send_error          text,
     created_at          timestamptz not null default now(),
     check ((direction = 'outbound') = (send_state is not null))
   )`,
  "create index email_messages_thread on email_messages (thread_id, sent_at)",
  "create index email_messages_rfc822 on email_messages (workspace_id, rfc822_message_id)",
  "create unique index email_messages_provider on email_messages (thread_id, provider_message_id) where provider_message_id is not null",
  tenantTable("email_messages", { membersOnly: true }),
  `create table attachments (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     message_id   text not null references email_messages(id) on delete cascade,
     file_id      text not null references files(id) on delete cascade,
     inline       boolean not null default false,
     content_id   text,
     position     integer not null default 0
   )`,
  "create index attachments_message on attachments (message_id, position)",
  tenantTable("attachments", { membersOnly: true }),
  // A ticket made from a thread names where it came from: the mailbox's provider, or `email` for the forwarding one.
  "alter table tickets drop constraint tickets_source_check",
  `alter table tickets add constraint tickets_source_check
     check (source in ('gmail', 'outlook', 'email', 'shopify', 'klarna', 'chat', 'insyte', 'manual', 'supplier'))`,
  // What the capture adapter keeps of a support mail, for the dev route and the tests (never written in production).
  "alter table captured_mail add column subject text",
  "alter table captured_mail add column body_text text",
  // The `email()` handler's door: which workspace and mailbox a forwarding address belongs to, read before any
  // workspace is in scope (as `api_key_route` is for a key). Ids only.
  "create policy mailboxes_routing on mailboxes as permissive for select to insyte_owner using (true)",
  `create function mailbox_route(forwarding text) returns table (workspace_id text, mailbox_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select m.workspace_id, m.id from mailboxes m
         where m.forwarding_address = lower(forwarding) and m.status = 'connected';
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function mailbox_route(text) from public",
  "grant execute on function mailbox_route(text) to insyte_app"
)
