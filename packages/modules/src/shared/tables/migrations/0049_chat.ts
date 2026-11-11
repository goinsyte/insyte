import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Chats (M11 step 4; domain.md §7, §7.1): the team's channels, their DMs, and the shared channel with a supplier (whose
 * side joins in M16). A channel is the whole team's: anyone with Klantenservice reads it, and their row in
 * `conversation_members` (pinned, muted, read up to) is made the first time they open or write in it. A DM is between
 * two members, keyed by the pair so there is one. A message carries its text, the teammates it names, the records it
 * shares (live cards, read through their own slices), and, for a command, its action card (`chat_actions`). Read
 * positions are a time on the member's row, not a table of their own. Times are the database's.
 */
export default statements(
  `create table conversations (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     kind            text not null check (kind in ('channel', 'dm', 'supplier_channel')),
     name            text not null check (btrim(name) <> '' and char_length(name) <= 80),
     topic           text not null default '' check (char_length(topic) <= 500),
     supplier_id     text references suppliers(id) on delete cascade,
     dm_key          text,
     created_by      text not null,
     created_at      timestamptz not null default now(),
     last_message_at timestamptz,
     archived_at     timestamptz,
     check ((kind = 'dm') = (dm_key is not null)),
     check ((kind = 'supplier_channel') = (supplier_id is not null))
   )`,
  `create unique index conversations_channel_name on conversations (workspace_id, lower(name))
     where kind in ('channel', 'supplier_channel') and archived_at is null`,
  "create unique index conversations_dm on conversations (workspace_id, dm_key) where dm_key is not null",
  `create unique index conversations_supplier on conversations (workspace_id, supplier_id)
     where supplier_id is not null`,
  "create index conversations_recent on conversations (workspace_id, last_message_at desc nulls last)",
  tenantTable("conversations", { membersOnly: true }),
  `create table conversation_members (
     workspace_id    text not null references workspaces(id) on delete cascade,
     conversation_id text not null references conversations(id) on delete cascade,
     principal_kind  text not null default 'member',
     principal_id    text not null,
     joined_at       timestamptz not null default now(),
     last_read_at    timestamptz,
     pinned          boolean not null default false,
     muted           boolean not null default false,
     notify          text not null default 'all' check (notify in ('all', 'mentions')),
     primary key (conversation_id, principal_id)
   )`,
  "create index conversation_members_principal on conversation_members (workspace_id, principal_id)",
  tenantTable("conversation_members", { membersOnly: true }),
  `create table messages (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     conversation_id text not null references conversations(id) on delete cascade,
     author_kind     text not null,
     author_id       text not null,
     body            text not null default '' check (char_length(body) <= 10000),
     mentions        text[] not null default '{}',
     records         jsonb not null default '[]',
     cards           jsonb not null default '[]',
     attachments     text[] not null default '{}',
     reply_to        text references messages(id) on delete cascade,
     also_in_channel boolean not null default false,
     pinned_at       timestamptz,
     pinned_by       text,
     edited_at       timestamptz,
     deleted_at      timestamptz,
     created_at      timestamptz not null default clock_timestamp()
   )`,
  "create index messages_stream on messages (conversation_id, created_at desc, id desc)",
  "create index messages_thread on messages (reply_to, created_at) where reply_to is not null",
  "create index messages_pinned on messages (conversation_id, pinned_at desc) where pinned_at is not null",
  tenantTable("messages", { membersOnly: true }),
  `create table message_reactions (
     workspace_id text not null references workspaces(id) on delete cascade,
     message_id   text not null references messages(id) on delete cascade,
     principal_id text not null,
     emoji        text not null check (btrim(emoji) <> '' and char_length(emoji) <= 32),
     created_at   timestamptz not null default now(),
     primary key (message_id, principal_id, emoji)
   )`,
  tenantTable("message_reactions", { membersOnly: true }),
  `create table chat_actions (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     conversation_id text not null references conversations(id) on delete cascade,
     message_id      text not null references messages(id) on delete cascade,
     command         text not null
                       check (command in ('refund', 'cancel', 'note', 'ticket', 'assign', 'status', 'evidence',
                                          'accept')),
     target_kind     text,
     target_id       text,
     arg             text check (char_length(arg) <= 2000),
     by              text not null default 'person' check (by in ('person', 'insyte')),
     state           text not null
                       check (state in ('confirm', 'proposed', 'running', 'done', 'undone', 'declined', 'failed')),
     level           text,
     created_by      text not null,
     decided_by      text,
     undo_until      timestamptz,
     error           text,
     created_at      timestamptz not null default now(),
     updated_at      timestamptz not null default now(),
     unique (message_id)
   )`,
  "create trigger chat_actions_touch before update on chat_actions for each row execute function touch_updated_at()",
  tenantTable("chat_actions", { membersOnly: true })
)
