import { newcomerBlind, staffHeld, tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Reliability of the background work (W13.6).
 *
 * - `dead_letters`: every message the queues gave up on, as the jobs Worker's dead-letter consumer read it: the queue,
 *   the message's id, its kind (`outbox`, `ingest`, `agent`, `classify_ticket`, `embed_knowledge`), the workspace when
 *   one is known, the first error's code (a tag such as `ShopifyThrottled`, never a message), how often it was tried,
 *   and when. Ids, enums and counts only: never a payload, never a shopper's words. The app neither reads nor writes
 *   the table; it records through `dead_letter_record(…)` and counts through `dead_letters_counts()` (for
 *   `/api/health/deep`), both as the owner. A workspace's purge takes its lines (0076 deletes by `workspace_id`).
 * - `pending_tasks`: the queue's tasks a person would miss if their message were lost (the agent's answer to a mail or
 *   a website chat, a ticket's topic by Insyte AI, a published chapter's embedding), written on the transaction that
 *   relays the event, removed once the task ran. The cron sends again what is still there after ten minutes, waiting
 *   longer each time, until it ran or it is too late to matter (`pending_tasks_due`): an hour for the agent, a day for
 *   a topic, a week for a chapter. Each task acts once however often it comes. Ids only.
 * - The tables without row level security (better-auth's, the rates, the relay's sink claims, the migrations, the
 *   capture tables of the fakes, the beta list, the Prullenbak's kinds) refuse every write from Insyte's support team
 *   (`staff`, `staff_viewer`, 0107): a statement trigger, so the database holds it, not only the code. Better-auth and
 *   every other writer never runs as staff, and pass.
 */

/** The tables without row level security that a staff transaction must not write. */
const UNGUARDED = [
  "auth.\"user\"",
  "auth.account",
  "auth.session",
  "auth.two_factor",
  "auth.verification",
  "public.beta_allowlist",
  "public.captured_mail",
  "public.captured_product_events",
  "public.fx_rates",
  "public.migrations",
  "public.outbox_sinks",
  "public.trash_kind_joins"
] as const

/** The trigger's name on a table, from its unquoted name. */
const triggerOf = (table: string) => `${table.split(".")[1]!.replaceAll("\"", "")}_no_staff_writes`

export default statements(
  `create table dead_letters (
     id           bigint generated always as identity primary key,
     queue        text not null check (length(queue) between 1 and 80),
     message_id   text not null check (length(message_id) between 1 and 200),
     kind         text not null check (kind in ('outbox', 'ingest', 'agent', 'classify_ticket', 'embed_knowledge',
                                                'unknown')),
     workspace_id text,
     error_code   text check (length(error_code) <= 80),
     attempts     int not null default 0,
     dead_at      timestamptz not null default now(),
     unique (queue, message_id)
   )`,
  "create index dead_letters_recent on dead_letters (dead_at desc)",
  "alter table dead_letters enable row level security",
  "alter table dead_letters force row level security",
  // The owner's alone, through the functions below (and the purge, which deletes a workspace's lines).
  "create policy dead_letters_owner on dead_letters as permissive for all to insyte_owner using (true) with check (true)",
  newcomerBlind("dead_letters"),
  ...staffHeld("dead_letters"),
  "revoke all on dead_letters from insyte_app",
  `create function dead_letter_record(q text, msg text, k text, ws text, code text, tries int) returns boolean
     language plpgsql security definer set search_path = public as $$
     begin
       if coalesce(app_principal_kind(), '') in ('staff', 'staff_viewer') then
         raise exception 'dead_letter_record: not for Insyte''s support team';
       end if;
       insert into dead_letters (queue, message_id, kind, workspace_id, error_code, attempts)
       values (left(q, 80), left(msg, 200), k, ws, left(code, 80), coalesce(tries, 0))
       on conflict (queue, message_id) do nothing;
       return found;
     end $$`,
  "revoke all on function dead_letter_record(text, text, text, text, text, int) from public",
  "grant execute on function dead_letter_record(text, text, text, text, text, int) to insyte_app",
  `create function dead_letters_counts() returns table (events bigint, ingest bigint, last_day bigint, last_at timestamptz)
     language sql stable security definer set search_path = public as $$
       select count(*) filter (where queue like 'insyte-events-dlq%'),
              count(*) filter (where queue like 'insyte-ingest-dlq%'),
              count(*) filter (where dead_at > now() - interval '1 day'),
              max(dead_at)
       from dead_letters
     $$`,
  "revoke all on function dead_letters_counts() from public",
  "grant execute on function dead_letters_counts() to insyte_app",
  //
  `create table pending_tasks (
     workspace_id text not null references workspaces(id) on delete cascade,
     kind         text not null check (kind in ('agent', 'classify_ticket', 'embed_knowledge')),
     ref          text not null check (length(ref) between 1 and 200),
     task         jsonb not null check (jsonb_typeof(task) = 'object' and octet_length(task::text) <= 4000),
     created_at   timestamptz not null default now(),
     next_at      timestamptz not null default now() + interval '10 minutes',
     attempts     int not null default 0,
     primary key (workspace_id, kind, ref)
   )`,
  "create index pending_tasks_due on pending_tasks (next_at)",
  tenantTable("pending_tasks"),
  newcomerBlind("pending_tasks"),
  ...staffHeld("pending_tasks"),
  `create function pending_tasks_due(lim int)
     returns table (workspace_id text, kind text, ref text, task jsonb, attempts int)
     language plpgsql security definer set search_path = public as $$
     #variable_conflict use_column
     begin
       if coalesce(app_principal_kind(), '') in ('staff', 'staff_viewer') then
         raise exception 'pending_tasks_due: not for Insyte''s support team';
       end if;
       -- Too late to matter, or tried often enough: the work is left to the team, as before this table.
       delete from pending_tasks p
        where p.attempts >= 6
           or p.created_at < now() - case p.kind when 'agent' then interval '1 hour'
                                                 when 'classify_ticket' then interval '1 day'
                                                 else interval '7 days' end;
       return query
         with due as (
           select p.workspace_id, p.kind, p.ref from pending_tasks p
           where p.next_at <= now()
           order by p.next_at
           limit least(lim, 500)
           for update skip locked)
         update pending_tasks p set attempts = p.attempts + 1, next_at = now() + make_interval(mins => (10 * power(2, least(p.attempts, 4)))::int)
         from due
         where p.workspace_id = due.workspace_id and p.kind = due.kind and p.ref = due.ref
         returning p.workspace_id, p.kind, p.ref, p.task, p.attempts;
     end $$`,
  "revoke all on function pending_tasks_due(int) from public",
  "grant execute on function pending_tasks_due(int) to insyte_app",
  //
  `create function refuse_staff_writes() returns trigger
     language plpgsql set search_path = public as $$
     begin
       if coalesce(public.app_principal_kind(), '') in ('staff', 'staff_viewer') then
         raise exception '%.%: Insyte''s support team writes nothing here', tg_table_schema, tg_table_name
           using errcode = 'insufficient_privilege';
       end if;
       return null;
     end $$`,
  UNGUARDED.flatMap((table) => [
    `create trigger ${triggerOf(table)} before insert or update or delete or truncate on ${table}
       for each statement execute function refuse_staff_writes()`
  ])
)
