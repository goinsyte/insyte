import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * Workspaces, their roles and teams, and who belongs to them (06 §3.2, M3.1). From here every row belongs to a
 * workspace, and Postgres refuses a query for the wrong one.
 *
 * A workspace row is its own tenant (`id = app_workspace_id()`). A person may also read the workspaces they belong to,
 * and their own memberships in each, before any workspace is chosen: that is how the session lists its principals. The
 * creating transaction sets the new workspace as `app.workspace_id`, so the workspace, its roles and its first member
 * pass the same policies every later write does.
 */
export default statements(
  `create table workspaces (
     id                      text primary key,
     name                    text not null check (length(trim(name)) between 1 and 80),
     slug                    text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$'),
     legal_entity            text,
     vat_number              text,
     billing_email           text,
     country                 char(2) not null default 'NL',
     timezone                text not null default 'Europe/Amsterdam',
     currency                char(3) not null default 'EUR',
     logo_file_id            text,
     team_size               text check (team_size in ('1', '2-5', '6-20', '21+')),
     retention_days          int not null default 90 check (retention_days in (30, 90, 180)),
     alerts                  jsonb not null default '{"delay_hours": 48, "dispute_amount_minor": 10000}',
     regional                jsonb not null default '{}',
     require_mfa             boolean not null default false,
     sso_policy              jsonb not null default '{"kind": "off"}',
     plan                    text not null default 'trial',
     trial_ends_at           timestamptz,
     onboarding_completed_at timestamptz,
     settled_at              timestamptz,
     deleted_at              timestamptz,
     created_at              timestamptz not null default now(),
     updated_at              timestamptz not null default now()
   )`,
  `create trigger workspaces_touch before update on workspaces for each row execute function touch_updated_at()`,
  //
  `create table roles (
     id                 text not null,
     workspace_id       text not null references workspaces(id) on delete cascade,
     label              text not null,
     kind               text not null check (kind in ('system', 'custom')),
     based_on           text,
     levels             jsonb not null,
     specials           jsonb not null default '{}',
     refund_limit_minor bigint,
     stores             jsonb not null default '"all"',
     version            int not null default 1,
     created_at         timestamptz not null default now(),
     updated_at         timestamptz not null default now(),
     primary key (workspace_id, id),
     unique (workspace_id, label)
   )`,
  `create trigger roles_touch before update on roles for each row execute function touch_updated_at()`,
  tenantTable("roles"),
  // The role of each of a person's own memberships: the session names it before any workspace is chosen.
  `create policy roles_mine on roles as permissive for select using (exists (
     select 1 from members m
     where m.workspace_id = roles.workspace_id and m.role_id = roles.id and m.user_id = app_user_id() and m.deactivated_at is null
   ))`,
  //
  `create table teams (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     name         text not null,
     created_at   timestamptz not null default now(),
     unique (workspace_id, name)
   )`,
  tenantTable("teams"),
  //
  `create table members (
     id             text primary key,
     workspace_id   text not null references workspaces(id) on delete cascade,
     user_id        text not null references auth."user"(id) on delete cascade,
     role_id        text not null,
     team_id        text references teams(id),
     stores         jsonb not null default '"all"',
     overrides      jsonb not null default '{}',
     invited_by     text,
     joined_at      timestamptz not null default now(),
     last_active_at timestamptz,
     deactivated_at timestamptz,
     foreign key (workspace_id, role_id) references roles(workspace_id, id),
     unique (workspace_id, user_id)
   )`,
  "create index members_active on members (workspace_id) where deactivated_at is null",
  "create index members_user on members (user_id) where deactivated_at is null",
  tenantTable("members"),
  // A person's own memberships, in every workspace: the session's list of principals.
  "create policy members_own on members as permissive for select using (user_id = app_user_id())",
  // Exactly one active owner per workspace, checked when the transaction commits (a transfer passes through two).
  `create function members_one_owner() returns trigger language plpgsql as $$
     declare ws text := coalesce(new.workspace_id, old.workspace_id);
     begin
       if (select count(*) from members where workspace_id = ws and role_id = 'owner' and deactivated_at is null) <> 1 then
         raise exception 'workspace % must have exactly one active owner', ws using errcode = 'check_violation';
       end if;
       return null;
     end $$`,
  `create constraint trigger one_owner after insert or update or delete on members
     deferrable initially deferred for each row execute function members_one_owner()`,
  //
  "alter table workspaces enable row level security",
  "alter table workspaces force row level security",
  `create policy workspaces_self on workspaces as permissive for all
     using (id = app_workspace_id()) with check (id = app_workspace_id())`,
  // Onboarding's progress names its workspace from the organisation step on (0008 waited for this table).
  `alter table onboarding_progress add constraint onboarding_progress_workspace
     foreign key (workspace_id) references workspaces(id) on delete cascade`,
  `create policy workspaces_member_of on workspaces as permissive for select using (exists (
     select 1 from members m where m.workspace_id = workspaces.id and m.user_id = app_user_id() and m.deactivated_at is null
   ))`
)
