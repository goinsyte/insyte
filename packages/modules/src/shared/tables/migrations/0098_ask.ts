import { newcomerBlind, tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Vraag Insyte (M15 step 3; widgets/02 Part D, api.md §2.12, ai.md §4): a person's conversations with Insyte and their
 * turns, as the drawer and `/ask` show them.
 *
 * - `ask_threads`: one conversation, its owner (the member, or the API key that asked over `/v1` or MCP), its title
 *   (the first question, cut), when it last moved, and `deleted_at` for "Gesprek verwijderd" with its Undo.
 * - `ask_turns`: the question and the answer, in order. An answer is written as it settles: its tokens (words, record
 *   chips, figures with where they come from), the tools it ran, the sources it read, the follow-ups, the thinking
 *   steps and how long they took, or how it failed. `store_ids` are the stores the answer read from, so a reader whose
 *   stores shrank does not get it back (the store fence on read); `refs` are the records it names, for a shopper's
 *   access request and erasure. No prompt and no tool output is kept: only what the person was shown.
 *
 * Both are the owner's alone: a restrictive policy holds every read and write to the principal that owns the row, with
 * `system` let through for the workspace export, a shopper's erasure and the purge. A newcomer (0096) reads and writes
 * neither (`newcomerBlind`). A thread goes with its workspace.
 */

const OWNER = "owner_id = app_principal_id() or app_principal_kind() = 'system'"

export default statements(
  `create table ask_threads (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     owner_kind   text not null check (owner_kind in ('member', 'api_key', 'agent')),
     owner_id     text not null,
     title        text not null check (char_length(title) <= 120),
     last_turn_at timestamptz not null default now(),
     deleted_at   timestamptz,
     created_at   timestamptz not null default now()
   )`,
  `create index ask_threads_owner on ask_threads (workspace_id, owner_id, last_turn_at desc)
     where deleted_at is null`,
  tenantTable("ask_threads", { membersOnly: true }),
  `create policy ask_threads_owner on ask_threads as restrictive for all using (${OWNER}) with check (${OWNER})`,
  newcomerBlind("ask_threads"),
  "revoke delete on ask_threads from insyte_app",
  //
  `create table ask_turns (
     id                 text primary key,
     workspace_id       text not null references workspaces(id) on delete cascade,
     thread_id          text not null references ask_threads(id) on delete cascade,
     owner_id           text not null,
     seq                integer not null,
     role               text not null check (role in ('user', 'assistant')),
     state              text not null default 'settled' check (state in ('streaming', 'settled', 'failed')),
     text               text not null default '' check (char_length(text) <= 20000),
     tokens             jsonb not null default '[]',
     tools              jsonb not null default '[]',
     sources            jsonb not null default '[]',
     follow_ups         text[] not null default '{}',
     thinking           text[] not null default '{}',
     thinking_ms        integer,
     context            jsonb,
     store_ids          text[] not null default '{}',
     refs               text[] not null default '{}',
     failure            text check (failure in ('budget', 'model', 'limit', 'interrupted', 'rate')),
     prompt_version     text,
     model_call_ids     text[] not null default '{}',
     retry_of           text,
     revise_proposal_id text,
     created_at         timestamptz not null default now(),
     settled_at         timestamptz,
     unique (thread_id, seq)
   )`,
  "create index ask_turns_thread on ask_turns (workspace_id, thread_id, seq)",
  "create index ask_turns_refs on ask_turns using gin (refs)",
  tenantTable("ask_turns", { membersOnly: true }),
  `create policy ask_turns_owner on ask_turns as restrictive for all using (${OWNER}) with check (${OWNER})`,
  newcomerBlind("ask_turns"),
  "revoke delete on ask_turns from insyte_app"
)
