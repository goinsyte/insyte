import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Autonomy and the agent log (M15 step 6; domain.md §2.10, §9.6–9.8, ADR-0027):
 *
 * - `agents`: the workspace's own Insyte agent, made on first need; `disabled_at` is the owner's off switch (every
 *   decision then asks).
 * - `autonomy_policies`: one row per workspace once someone saves Zelfstandigheid: the level per catalogue action
 *   (a missing one is the default, Eerst vragen), the limits Zelf doen keeps to, and the version. Every version is
 *   kept in `autonomy_policy_versions` with what changed and who changed it; an undo writes a new version.
 * - `agent_actions`: one row per thing an agent ran, proposed or was refused, with what it changed, why, and the way
 *   back while the window is open. Partitioned by month on `created_at` (a default partition until the monthly job
 *   lands, M18), like the audit log.
 * - `agent_touchpoints`: the touchpoint (`dedupe_key`) → its agent action, so a repeated trigger or a retried MCP call
 *   with the same idempotency key records once. A partitioned table cannot hold that unique key itself.
 * - `ai_budgets`: the Limieten page's monthly limits, the workspace's and each person's.
 *
 * `autonomy_decide` is `Autonomy.decide`: a security-definer function, because an agent principal reads no policy
 * table directly (domain.md §12); it answers run, propose or refuse for one action under the workspace's policy.
 * Proposals gain the origin `agent` for what an agent asked first.
 */

/** The catalogue's locked actions (`@insyte/domain/AgentActions`): never Zelf doen. A test holds the two in step. */
const LOCKED = "array['CancelOrder', 'RefundOrder', 'SubmitEvidence', 'AcceptDispute']"

const ACTIONS = `array['SetTicketStatus', 'SetPriority', 'AssignTicket', 'AddNote', 'ApplyLabel', 'CreateTicket',
  'SnoozeThread', 'SendReply', 'ForwardOrder', 'CancelOrder', 'ApproveReturn', 'SendReturnLabel', 'MessageSupplier',
  'RequestQualityCheck', 'PostChatMessage', 'RefundOrder', 'SubmitEvidence', 'AcceptDispute']`

export default statements(
  `create table agents (
     id           text primary key,
     workspace_id text not null unique references workspaces(id) on delete cascade,
     scopes       jsonb not null default '{}',
     disabled_at  timestamptz,
     created_at   timestamptz not null default now()
   )`,
  tenantTable("agents", { membersOnly: true }),
  //
  `create table autonomy_policies (
     workspace_id text primary key references workspaces(id) on delete cascade,
     version      integer not null default 1,
     levels       jsonb not null default '{}',
     limits       jsonb not null default '{}',
     updated_by   text,
     updated_at   timestamptz not null default now()
   )`,
  "create trigger autonomy_policies_touch before update on autonomy_policies for each row execute function touch_updated_at()",
  tenantTable("autonomy_policies", { membersOnly: true }),
  // An agent reads its policy only through `autonomy_decide`.
  `create policy autonomy_policies_people on autonomy_policies as restrictive for all
     using (app_principal_kind() is distinct from 'agent')`,
  `create table autonomy_policy_versions (
     workspace_id text not null references workspaces(id) on delete cascade,
     version      integer not null,
     levels       jsonb not null,
     limits       jsonb not null default '{}',
     diff         jsonb not null default '[]',
     changed_by   text,
     changed_at   timestamptz not null default now(),
     primary key (workspace_id, version)
   )`,
  tenantTable("autonomy_policy_versions", { membersOnly: true }),
  `create policy autonomy_policy_versions_people on autonomy_policy_versions as restrictive for all
     using (app_principal_kind() is distinct from 'agent')`,
  "revoke update, delete on autonomy_policy_versions from insyte_app",
  //
  `create table agent_actions (
     id               text not null,
     workspace_id     text not null references workspaces(id) on delete cascade,
     store_id         text,
     action           text not null,
     input            jsonb,
     subject_type     text,
     subject_id       text,
     subject_label    text,
     principal_kind   text not null check (principal_kind in ('agent', 'api_key', 'system')),
     principal_id     text not null,
     on_behalf_of     text,
     trigger          text not null,
     trigger_label    text not null,
     policy_version   integer not null,
     level            text not null check (level in ('auto', 'ask', 'never')),
     decision         text not null check (decision in ('run', 'propose', 'refuse')),
     refuse_reason    text check (refuse_reason in ('policy', 'scope', 'role', 'locked', 'budget', 'disabled',
                                                    'limit', 'unknown')),
     sources          jsonb not null default '[]',
     reason           text not null,
     sentence         text not null,
     before_text      text,
     after_text       text,
     effect           jsonb,
     compensation     text,
     dedupe_key       text,
     outcome          text not null check (outcome in ('done', 'failed', 'undone', 'compensated', 'proposed',
                                                      'refused')),
     error            text,
     proposal_id      text,
     undo_token_hash  bytea,
     undo_principal   text,
     undo_until       timestamptz,
     undone_by        text,
     undone_at        timestamptz,
     model            text,
     prompt_version   text,
     model_call_id    text,
     created_at       timestamptz not null default now(),
     primary key (id, created_at)
   ) partition by range (created_at)`,
  "create table agent_actions_default partition of agent_actions default",
  "create index agent_actions_log on agent_actions (workspace_id, created_at desc)",
  "create index agent_actions_subject on agent_actions (workspace_id, subject_type, subject_id, created_at desc)",
  "create index agent_actions_day on agent_actions (workspace_id, action, created_at) where decision = 'run'",
  tenantTable("agent_actions", { membersOnly: true }),
  // The log is append-only but for its outcome: the app never deletes a row.
  "revoke delete on agent_actions from insyte_app",
  `create table agent_touchpoints (
     workspace_id    text not null references workspaces(id) on delete cascade,
     dedupe_key      text not null,
     agent_action_id text not null,
     created_at      timestamptz not null default now(),
     primary key (workspace_id, dedupe_key)
   )`,
  tenantTable("agent_touchpoints", { membersOnly: true }),
  //
  `create table ai_budgets (
     id                  text primary key,
     workspace_id        text not null references workspaces(id) on delete cascade,
     member_id           text,
     monthly_limit_minor bigint check (monthly_limit_minor >= 0),
     currency            char(3) not null default 'EUR',
     warn_at_pct         integer not null default 80,
     warned_at           timestamptz,
     reached_at          timestamptz,
     updated_by          text,
     updated_at          timestamptz not null default now()
   )`,
  "create unique index ai_budgets_scope on ai_budgets (workspace_id, coalesce(member_id, ''))",
  tenantTable("ai_budgets", { membersOnly: true }),
  //
  // What an agent asked first is a proposal like any other, filed by a person.
  "alter table proposals drop constraint proposals_origin_check",
  `alter table proposals add constraint proposals_origin_check check (origin in ('queue', 'ask', 'analytics_finding',
     'low_stock', 'order_advice', 'evidence_pack', 'automation_recommendation', 'draft_reply', 'agent'))`,
  //
  /*
   * `Autonomy.decide`: for one catalogue action in the caller's workspace, whether it runs, becomes a proposal, or does
   * not happen. In order: an action outside the catalogue is refused; Nooit refuses; a locked action, a switched-off
   * agent, a spent budget and a limit reached all ask; Zelf doen runs; Eerst vragen asks. `p_amount_minor` is what the
   * action moves, where it moves money. Reads as `system` for its own duration (as 0043's sweep does), so an agent's
   * own principal needs no grant on the policy.
   */
  `create function autonomy_decide(p_action text, p_amount_minor bigint default null)
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
       -- Use is the month's model calls (M15 step 1); until they are recorded, only a limit of nothing is spent.
       select coalesce(b.monthly_limit_minor = 0, false) into spent
         from ai_budgets b where b.workspace_id = ws and b.member_id is null;
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
     end $$`,
  "revoke all on function autonomy_decide(text, bigint) from public",
  "grant execute on function autonomy_decide(text, bigint) to insyte_app"
)
