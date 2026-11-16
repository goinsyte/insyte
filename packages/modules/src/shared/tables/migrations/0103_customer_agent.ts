import { newcomerBlind, tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The customer agent (M15 step 8; widgets/04 Klantagent, domain.md §6.4): Insyte answering shoppers on the website chat
 * by itself, within the autonomy policy's `SendReply` level and the settings below.
 *
 * - `customer_agent_settings`: one row per workspace, the Klantagent page as one rule set (domain §6.4 changed
 *   2026-11-04): on or off, a mode per channel kind (`auto` "Zelf antwoorden", only on the website chat; `drafts`;
 *   `off`), the opening hours (Monday first, in the workspace's time zone; `null` until saved, when the offline plan's
 *   hours or the default week stand), what it does outside them, the handover rules, the tone and the handover
 *   sentence. `version` counts saves. No row is the default: off.
 * - `customer_agent_threads`: what the agent keeps per chat thread, so a turn knows the conversation's standing without
 *   reading its words: how many shopper turns and replies, when it first answered (the day's "Eerste reactie"), how
 *   many times the shopper tried to prove an order and failed (the cap against guessing), the one order the shopper
 *   proved (`verified_order_id`: the only order whose facts the agent may give on this thread), when it handed the
 *   thread over and why, a hold on a thread that ran away, and when it saw a person had taken the thread over (so the
 *   day's "Wachten" leaves it out). A hand-back starts the thread again without its proof. The newest shopper message
 *   counted (`counted_message_id`), so a burst counts as its messages; every order ever proved on it
 *   (`proved_order_ids`, kept past a hand-back, no reference: an erasure finds the questions filed there by it); the
 *   chat's last hand-back the agent acted on (`seen_hand_back_at`, the chat's own time, so a new one drops the proof);
 *   the newest shopper message its last reply answered (`answered_message_id`: a reply waits out the chat's undo window
 *   before anyone reads it, the agent too, so the next turn would answer it again). No message text is kept here.
 *
 * Both are the workspace's: members read them (the settings page and its day figures), the agent and the system write
 * them. A newcomer (0096) reads neither. A verified order going away (an erasure deletes nothing, it blanks; a store
 * disconnected deletes) leaves the thread unverified.
 *
 * `agent_actions.refuse_reason` widens with why the agent handed a chat to a person: `handover` asked for by the
 * shopper (`asks_person`), a complaint, legal or chargeback word or anger (`sensitive`), money, a cancellation, a
 * discount or an address change (`money`), a topic that is always a colleague's (`topic`), too many turns without an
 * answer (`turns`), nothing in the knowledge base (`no_knowledge`), Insyte unsure (`unsure`), too many failed order
 * checks (`verify_cap`), an order with no one plain status (`order_complex`), outside the opening hours with "Vraag
 * aannemen" (`outside_hours`), a thread that ran away (`runaway`), and a model that did not answer (`error`).
 */

const REASONS =
  `'policy', 'scope', 'role', 'locked', 'budget', 'disabled', 'limit', 'unknown', 'hours', 'guard', 'taken',
  'unclear', 'asks_person', 'sensitive', 'money', 'topic', 'turns', 'no_knowledge', 'unsure', 'verify_cap',
  'order_complex', 'outside_hours', 'runaway', 'error'`

export default statements(
  `create table customer_agent_settings (
     workspace_id      text primary key references workspaces(id) on delete cascade,
     enabled           boolean not null default false,
     channel_modes     jsonb not null default '{"webchat":"off","whatsapp":"off","instagram":"off","email":"off"}',
     opening_hours     jsonb,
     outside_hours     text not null default 'take' check (outside_hours in ('answer', 'take')),
     handover          jsonb not null default '{}',
     tone              text not null default 'brand' check (tone in ('brand', 'short', 'formal')),
     handover_sentence text not null check (char_length(handover_sentence) between 1 and 500),
     version           integer not null default 1,
     updated_by        text,
     updated_at        timestamptz not null default now()
   )`,
  "create trigger customer_agent_settings_touch before update on customer_agent_settings for each row execute function touch_updated_at()",
  tenantTable("customer_agent_settings", { membersOnly: true }),
  newcomerBlind("customer_agent_settings"),
  "revoke delete on customer_agent_settings from insyte_app",
  //
  `create table customer_agent_threads (
     workspace_id          text not null references workspaces(id) on delete cascade,
     thread_id             text not null,
     store_id              text not null,
     first_message_at      timestamptz not null default now(),
     first_reply_at        timestamptz,
     last_reply_at         timestamptz,
     replies               integer not null default 0,
     shopper_turns         integer not null default 0,
     verify_failures       integer not null default 0,
     last_verify_failed_at timestamptz,
     verified_order_id     text references orders(id) on delete set null,
     verified_at           timestamptz,
     handed_over_at        timestamptz,
     handover_reason       text,
     held_at               timestamptz,
     taken_over_at         timestamptz,
     counted_message_id    text,
     seen_hand_back_at     timestamptz,
     answered_message_id   text,
     proved_order_ids      text[] not null default '{}',
     updated_at            timestamptz not null default now(),
     primary key (workspace_id, thread_id)
   )`,
  "create index customer_agent_threads_day on customer_agent_threads (workspace_id, first_message_at desc)",
  `create index customer_agent_threads_checks on customer_agent_threads (workspace_id, store_id, last_verify_failed_at)
     where last_verify_failed_at is not null`,
  "create index customer_agent_threads_order on customer_agent_threads (verified_order_id) where verified_order_id is not null",
  "create trigger customer_agent_threads_touch before update on customer_agent_threads for each row execute function touch_updated_at()",
  tenantTable("customer_agent_threads", { membersOnly: true }),
  newcomerBlind("customer_agent_threads"),
  "revoke delete on customer_agent_threads from insyte_app",
  //
  "alter table agent_actions drop constraint agent_actions_refuse_reason_check",
  `alter table agent_actions add constraint agent_actions_refuse_reason_check check (refuse_reason in (${REASONS}))`
)
