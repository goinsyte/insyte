import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The automation engine (M12 steps 2 and 3; domain.md §11). A published flow acts as its own service account, never as
 * a person: `service_accounts` holds one per flow, with the rights its live version needs less what was switched off
 * plus what was added. Publishing makes or renews it, pausing or removing the flow disables it.
 *
 * A run is one trigger event for one record (`automation_runs`), on the version that was live when it started, so a
 * version published mid-run does not change it. `(automation_id, trigger_event, record_id)` is unique: the relay that
 * delivers an event twice starts each run once. `automation_run_steps` is what each step did, per attempt: partitioned
 * by the run's start (a default partition until the monthly job lands, M18), keyed so a retried step rewrites its row.
 */
export default statements(
  `create table service_accounts (
     id             text primary key,
     workspace_id   text not null references workspaces(id) on delete cascade,
     automation_id  text not null unique references automations(id) on delete cascade,
     label          text not null,
     scopes         text[] not null default '{}',
     version        integer not null default 1 check (version > 0),
     disabled_at    timestamptz,
     created_at     timestamptz not null default now(),
     rotated_at     timestamptz not null default now()
   )`,
  tenantTable("service_accounts", { membersOnly: true }),
  `create table automation_runs (
     id                  text primary key,
     workspace_id        text not null references workspaces(id) on delete cascade,
     automation_id       text not null references automations(id) on delete cascade,
     version             integer not null check (version > 0),
     service_account_id  text references service_accounts(id) on delete set null,
     trigger_event       text not null,
     trigger_variant     text not null,
     summary             text not null default '',
     record_kind         text not null,
     record_id           text not null,
     status              text not null default 'running'
                           check (status in ('running', 'waiting', 'succeeded', 'failed', 'stopped', 'skipped')),
     reason              text,
     started_at          timestamptz not null default now(),
     finished_at         timestamptz,
     unique (automation_id, trigger_event, record_id)
   )`,
  "create index automation_runs_flow on automation_runs (workspace_id, automation_id, started_at desc)",
  tenantTable("automation_runs", { membersOnly: true }),
  `create table automation_run_steps (
     workspace_id  text not null references workspaces(id) on delete cascade,
     run_id        text not null,
     run_at        timestamptz not null,
     node_id       text not null,
     attempt       integer not null default 1 check (attempt > 0),
     variant       text not null,
     status        text not null check (status in ('succeeded', 'failed', 'skipped', 'waiting', 'stopped')),
     input         jsonb not null default '{}',
     output        jsonb not null default '{}',
     error         text,
     explanation   text,
     started_at    timestamptz not null default now(),
     finished_at   timestamptz,
     primary key (run_id, node_id, attempt, run_at)
   ) partition by range (run_at)`,
  "create table automation_run_steps_default partition of automation_run_steps default",
  tenantTable("automation_run_steps", { membersOnly: true })
)
