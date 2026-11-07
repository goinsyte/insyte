import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/** The helpers every policy uses and the platform tables every slice writes to (06 §1–2). */
export default statements(
  // `stable`, so the planner evaluates each once per statement.
  `create function app_workspace_id() returns text language sql stable as
     $$ select nullif(current_setting('app.workspace_id', true), '') $$`,
  `create function app_principal_kind() returns text language sql stable as
     $$ select nullif(current_setting('app.principal_kind', true), '') $$`,
  `create function app_partner_id() returns text language sql stable as
     $$ select nullif(current_setting('app.partner_id', true), '') $$`,
  `create function app_principal_id() returns text language sql stable as
     $$ select nullif(current_setting('app.principal_id', true), '') $$`,
  `create function app_user_id() returns text language sql stable as
     $$ select nullif(current_setting('app.user_id', true), '') $$`,
  `create function app_is_member_side() returns boolean language sql stable as
     $$ select app_principal_kind() in ('member', 'api_key', 'service_account', 'agent', 'system') $$`,
  // `updated_at` maintenance, attached per table.
  `create function touch_updated_at() returns trigger language plpgsql as
     $$ begin new.updated_at = now(); return new; end $$`,
  //
  // Human numbers, per workspace: `update … set next = next + 1 returning next - 1` in the caller's transaction.
  `create table workspace_counters (
     workspace_id text not null,
     kind         text not null check (kind in ('order','ticket','chargeback','return','invoice','automation_run')),
     next         bigint not null default 1,
     primary key (workspace_id, kind)
   )`,
  tenantTable("workspace_counters"),
  //
  // Who changed what. Monthly partitions are made three months ahead by the daily cron; the default partition only
  // catches a row the cron has not yet made room for.
  `create table audit_events (
     id              text not null,
     workspace_id    text not null,
     at              timestamptz not null default now(),
     actor_kind      text not null check (actor_kind in
                       ('member','supplier_contact','affiliate','api_key','service_account','agent','system','insyte')),
     actor_id        text not null,
     on_behalf_of    text,
     action          text not null,
     subject_type    text not null,
     subject_id      text not null,
     section         text,
     diff            jsonb not null default '{}',
     request_id      text,
     ip              inet,
     user_agent      text,
     proposal_id     text,
     run_id          text,
     agent_action_id text,
     primary key (id, at)
   ) partition by range (at)`,
  "create table audit_events_default partition of audit_events default",
  "create index audit_subject on audit_events (workspace_id, subject_type, subject_id, at desc)",
  "create index audit_actor on audit_events (workspace_id, actor_kind, actor_id, at desc)",
  "create index audit_section on audit_events (workspace_id, section, at desc) where section is not null",
  tenantTable("audit_events", { membersOnly: true }),
  // Append-only for the app.
  "revoke update, delete on audit_events from insyte_app",
  //
  // Effects of a write, relayed after it commits. Payloads hold ids and enums only.
  `create table outbox (
     id           text primary key,
     workspace_id text not null,
     event        text not null,
     payload      jsonb not null,
     not_before   timestamptz,
     created_at   timestamptz not null default now(),
     relayed_at   timestamptz,
     cancelled_at timestamptz,
     attempts     int not null default 0
   )`,
  `create index outbox_pending on outbox (coalesce(not_before, created_at))
     where relayed_at is null and cancelled_at is null`,
  tenantTable("outbox"),
  // Per-sink idempotency: a redelivered event is a no-op per sink.
  `create table outbox_sinks (
     outbox_id text not null,
     sink      text not null,
     done_at   timestamptz not null default now(),
     primary key (outbox_id, sink)
   )`,
  //
  `create table undo_tokens (
     token_hash   bytea primary key,
     workspace_id text not null,
     principal_id text not null,
     command      text not null,
     compensation jsonb not null,
     outbox_ids   text[] not null default '{}',
     expires_at   timestamptz not null,
     used_at      timestamptz
   )`,
  "create index undo_expiry on undo_tokens (expires_at) where used_at is null",
  tenantTable("undo_tokens"),
  //
  `create table idempotency_keys (
     workspace_id text not null,
     principal_id text not null,
     key          text not null,
     request_hash bytea not null,
     response     jsonb,
     created_at   timestamptz not null default now(),
     expires_at   timestamptz not null,
     primary key (workspace_id, principal_id, key)
   )`,
  tenantTable("idempotency_keys"),
  //
  // A webhook or mail before it is routed to a workspace: no tenant yet, and the app reads it only through the
  // routing functions, so it gets no grant at all.
  `create table inbound_events (
     id            text primary key,
     provider      text not null,
     delivery_id   text not null,
     topic         text not null,
     account_ref   text not null,
     received_at   timestamptz not null default now(),
     workspace_id  text,
     body_r2_key   text,
     body_inline   jsonb,
     processed_at  timestamptz,
     error         text,
     unique (provider, delivery_id)
   )`,
  "revoke all on inbound_events from insyte_app",
  //
  `create table files (
     id           text primary key,
     workspace_id text not null,
     r2_key       text not null unique,
     name         text not null,
     mime         text not null,
     size_bytes   bigint not null,
     sha256       bytea,
     kind         text not null,
     owner_type   text,
     owner_id     text,
     uploaded_by  text,
     scan_state   text not null default 'pending' check (scan_state in ('pending','clean','rejected')),
     created_at   timestamptz not null default now(),
     deleted_at   timestamptz
   )`,
  "create index files_owner on files (workspace_id, owner_type, owner_id)",
  tenantTable("files"),
  //
  // ECB daily rates, filled by the daily cron. Not tenant data.
  `create table fx_rates (
     day   date not null,
     base  char(3) not null,
     quote char(3) not null,
     rate  numeric(18,8) not null,
     primary key (day, base, quote)
   )`
)
