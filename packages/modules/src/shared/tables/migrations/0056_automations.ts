import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Automations (M12 step 1; domain.md §11): a flow's definition, its published versions and its settings. Runs, their
 * steps and the flow's service account are later steps. `draft_nodes` is what the canvas holds now and saves as it
 * goes; publishing pins it as the next row of `automation_versions`, which never changes after (the executor reads the
 * live version, never the draft). `live_version` is 0 until the first publication, and the status says whether the
 * live version runs: a draft has none, active runs it, paused keeps it without running. `trigger_variant` is the live
 * version's trigger, so the executor finds the flows an event starts in one index. Removing a flow sets `deleted_at`
 * and Undo clears it. `runs_total` counts runs once the executor writes them.
 */
export default statements(
  `create table automations (
     id               text primary key,
     workspace_id     text not null references workspaces(id) on delete cascade,
     name             text not null check (btrim(name) <> '' and char_length(name) <= 120),
     description      text not null default '' check (char_length(description) <= 1000),
     status           text not null default 'draft' check (status in ('draft', 'active', 'paused')),
     owner_member_id  text references members(id) on delete set null,
     live_version     integer not null default 0 check (live_version >= 0),
     draft_nodes      jsonb not null default '[]' check (jsonb_typeof(draft_nodes) = 'array'),
     draft_saved_at   timestamptz not null default now(),
     template         text,
     trigger_variant  text,
     store_scope      text[],
     runs_total       bigint not null default 0,
     deleted_at       timestamptz,
     created_by       text not null,
     created_at       timestamptz not null default now(),
     updated_at       timestamptz not null default now(),
     check (status = 'draft' or live_version > 0)
   )`,
  "create index automations_list on automations (workspace_id, created_at desc) where deleted_at is null",
  `create index automations_trigger on automations (workspace_id, trigger_variant)
     where status = 'active' and deleted_at is null`,
  "create trigger automations_touch before update on automations for each row execute function touch_updated_at()",
  tenantTable("automations", { membersOnly: true }),
  `create table automation_versions (
     workspace_id     text not null references workspaces(id) on delete cascade,
     automation_id    text not null references automations(id) on delete cascade,
     version          integer not null check (version > 0),
     nodes            jsonb not null check (jsonb_typeof(nodes) = 'array'),
     note             text not null default '' check (char_length(note) <= 200),
     scopes_required  text[] not null default '{}',
     published_by     text not null,
     published_at     timestamptz not null default now(),
     primary key (automation_id, version)
   )`,
  tenantTable("automation_versions", { membersOnly: true }),
  // A version is what ran: it is never rewritten. Undoing a publication publishes the one before as a new version.
  `create function automation_versions_frozen() returns trigger language plpgsql as $$
   begin
     raise exception 'automation_versions rows are immutable';
   end $$`,
  `create trigger automation_versions_frozen before update on automation_versions
     for each row execute function automation_versions_frozen()`,
  `create table automation_settings (
     workspace_id         text not null references workspaces(id) on delete cascade,
     automation_id        text primary key references automations(id) on delete cascade,
     scopes_off           text[] not null default '{}',
     scopes_extra         text[] not null default '{}',
     notify_member_id     text references members(id) on delete set null,
     rate_limit_per_hour  integer not null default 0 check (rate_limit_per_hour in (0, 30, 60, 120, 500)),
     updated_at           timestamptz not null default now()
   )`,
  "create trigger automation_settings_touch before update on automation_settings for each row execute function touch_updated_at()",
  tenantTable("automation_settings", { membersOnly: true })
)
