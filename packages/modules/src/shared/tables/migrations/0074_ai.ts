import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Insyte AI's platform (M15 steps 1 and 2; domain.md §9.4, §9.5, §9.7; ADR-0015):
 *
 * - `model_calls`: one row per call to a model, whatever it was for: the prompt and its version, the model, the
 *   tokens, what it cost in US dollar micros (the provider's price), how long it took, and how it ended. Never the
 *   prompt or the answer: what came out is kept where a person sees it (a draft, a comment, a pack). `member_id` is
 *   whose budget it counts against, null for background work (a ticket's topic, an evidence pack). Append-only.
 * - `drafts`: what Insyte wrote for a person to take or leave: a reply for a thread or a ticket (and its rewrites,
 *   Warmer and Korter, as children), a summary, a knowledge text. Never sent by itself; `used_at` is when someone
 *   took it into the composer.
 * - `tickets.topic_source`: whether the topic came from the keyword rules or the model.
 *
 * `ai_month_used` is the month's use in euro micros, the calendar month in the workspace's time zone, each call at its
 * day's rate (the latest the ECB had by then; none yet counts a dollar as a euro). `autonomy_decide` now reads it: a
 * workspace limit reached makes every agent action ask first, not only a limit of nothing.
 */

const PURPOSES = `'plate', 'draft', 'ask', 'finding_text', 'automation_from_sentence', 'classify', 'summarize',
  'evidence_narrative', 'weekly_report', 'agent', 'channel_agent', 'embedding', 'knowledge_answer'`

/** As in 0070: the catalogue's actions and its locked ones (`@insyte/domain/AgentActions`). */
const LOCKED = "array['CancelOrder', 'RefundOrder', 'SubmitEvidence', 'AcceptDispute']"

const ACTIONS = `array['SetTicketStatus', 'SetPriority', 'AssignTicket', 'AddNote', 'ApplyLabel', 'CreateTicket',
  'SnoozeThread', 'SendReply', 'ForwardOrder', 'CancelOrder', 'ApproveReturn', 'SendReturnLabel', 'MessageSupplier',
  'RequestQualityCheck', 'PostChatMessage', 'RefundOrder', 'SubmitEvidence', 'AcceptDispute']`

export default statements(
  `create table model_calls (
     id                 text primary key,
     workspace_id       text not null references workspaces(id) on delete cascade,
     member_id          text,
     principal_kind     text not null,
     purpose            text not null check (purpose in (${PURPOSES})),
     prompt_id          text not null,
     prompt_version     text not null,
     provider           text not null check (provider in ('anthropic', 'workers_ai', 'fake')),
     model              text not null,
     input_tokens       integer not null default 0,
     output_tokens      integer not null default 0,
     cached_tokens      integer not null default 0,
     cache_write_tokens integer not null default 0,
     cost_micros        bigint not null default 0 check (cost_micros >= 0),
     latency_ms         integer not null default 0,
     gateway_log_id     text,
     outcome            text not null check (outcome in ('ok', 'refused', 'error', 'guardrail_blocked')),
     error              text,
     subject_type       text,
     subject_id         text,
     test               boolean not null default false,
     created_at         timestamptz not null default now()
   )`,
  "create index model_calls_month on model_calls (workspace_id, created_at desc)",
  "create index model_calls_member on model_calls (workspace_id, member_id, created_at desc) where member_id is not null",
  tenantTable("model_calls", { membersOnly: true }),
  "revoke update, delete on model_calls from insyte_app",
  //
  `create table drafts (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     subject_type    text not null check (subject_type in ('thread', 'ticket', 'chat', 'knowledge_gap',
                                                           'knowledge_article', 'chargeback')),
     subject_id      text not null,
     kind            text not null check (kind in ('reply', 'summary', 'supplier_message', 'evidence_narrative',
                                                   'knowledge_answer')),
     text            text not null check (char_length(text) <= 20000),
     tone            text check (tone in ('warm', 'zakelijk', 'speels', 'warmer', 'korter')),
     parent_draft_id text references drafts(id) on delete set null,
     principal_kind  text not null,
     principal_id    text not null,
     model_call_id   text references model_calls(id) on delete set null,
     prompt_id       text not null,
     prompt_version  text not null,
     used_at         timestamptz,
     created_at      timestamptz not null default now()
   )`,
  "create index drafts_subject on drafts (workspace_id, subject_type, subject_id, created_at desc)",
  "create index drafts_today on drafts (workspace_id, created_at) where kind = 'reply'",
  tenantTable("drafts", { membersOnly: true }),
  "revoke delete on drafts from insyte_app",
  //
  `alter table tickets add column topic_source text not null default 'rule'
     check (topic_source in ('rule', 'model'))`,
  //
  /*
   * The month's use in euro micros: the workspace's (`p_member` null) or one person's. Invoked as the caller, so the
   * workspace's own rows only.
   */
  `create function ai_month_used(p_member text default null) returns bigint
     language sql stable set search_path = public as $$
       with ws as (
         select coalesce(w.timezone, 'Europe/Amsterdam') as tz from workspaces w where w.id = app_workspace_id()
       )
       select coalesce(round(sum(m.cost_micros * coalesce(r.rate, 1))), 0)::bigint
       from model_calls m
       cross join ws
       left join lateral (
         select f.rate from fx_rates f
         where f.base = 'USD' and f.quote = 'EUR' and f.day <= (m.created_at at time zone ws.tz)::date
         order by f.day desc limit 1
       ) r on true
       where m.workspace_id = app_workspace_id()
         and m.created_at >= (date_trunc('month', now() at time zone ws.tz) at time zone ws.tz)
         and (p_member is null or m.member_id = p_member)
     $$`,
  "revoke all on function ai_month_used(text) from public",
  "grant execute on function ai_month_used(text) to insyte_app",
  //
  // `Autonomy.decide` as 0070 wrote it, with the budget now the month's use against the workspace's limit.
  `create or replace function autonomy_decide(p_action text, p_amount_minor bigint default null)
     returns table (decision text, level text, policy_version integer, refuse_reason text)
     language plpgsql security definer set search_path = public as $$
     declare
       prior    text := current_setting('app.principal_kind', true);
       ws       text := app_workspace_id();
       pol      autonomy_policies%rowtype;
       lvl      text;
       ver      integer;
       lim      jsonb;
       tz       text;
       today    integer;
       off      timestamptz;
       cap      bigint;
       spent    boolean := false;
     begin
       if ws is null then raise exception 'autonomy_decide needs a workspace'; end if;
       perform set_config('app.principal_kind', 'system', true);
       select * into pol from autonomy_policies p where p.workspace_id = ws;
       ver := coalesce(pol.version, 1);
       if not (p_action = any(${ACTIONS})) then
         perform set_config('app.principal_kind', coalesce(prior, ''), true);
         return query select 'refuse'::text, 'never'::text, ver, 'unknown'::text;
         return;
       end if;
       lvl := coalesce(pol.levels ->> p_action, 'ask');
       if lvl not in ('auto', 'ask', 'never') then lvl := 'ask'; end if;
       lim := coalesce(pol.limits -> p_action, '{}');
       select a.disabled_at into off from agents a where a.workspace_id = ws;
       -- The month's model calls against the workspace's limit (in cents; use is in euro micros).
       select b.monthly_limit_minor into cap from ai_budgets b where b.workspace_id = ws and b.member_id is null;
       if cap is not null then spent := ai_month_used(null) >= cap * 10000; end if;
       select w.timezone into tz from workspaces w where w.id = ws;
       select count(*)::integer into today from agent_actions x
         where x.workspace_id = ws and x.action = p_action and x.decision = 'run' and x.outcome <> 'failed'
           and x.created_at >= (date_trunc('day', now() at time zone coalesce(tz, 'Europe/Amsterdam'))
                                at time zone coalesce(tz, 'Europe/Amsterdam'));
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       if lvl = 'never' then
         return query select 'refuse'::text, lvl, ver, 'policy'::text;
       elsif p_action = any(${LOCKED}) then
         return query select 'propose'::text, lvl, ver, 'locked'::text;
       elsif off is not null then
         return query select 'propose'::text, lvl, ver, 'disabled'::text;
       elsif coalesce(spent, false) then
         return query select 'propose'::text, lvl, ver, 'budget'::text;
       elsif lvl = 'auto' and lim ? 'perDay' and today >= (lim ->> 'perDay')::integer then
         return query select 'propose'::text, lvl, ver, 'limit'::text;
       elsif lvl = 'auto' and lim ? 'maxAmountMinor' and p_amount_minor is not null
             and p_amount_minor > (lim ->> 'maxAmountMinor')::bigint then
         return query select 'propose'::text, lvl, ver, 'limit'::text;
       elsif lvl = 'auto' then
         return query select 'run'::text, lvl, ver, null::text;
       else
         return query select 'propose'::text, lvl, ver, 'policy'::text;
       end if;
     end $$`
)
