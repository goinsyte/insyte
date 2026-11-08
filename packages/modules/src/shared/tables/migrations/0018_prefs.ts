import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/**
 * A member's own corner of the workspace (M4.2, 06 §4): preferences per section (versioned, so two tabs do not
 * overwrite each other), saved views, to-dos and recently opened records. Each row is one member's; a restrictive
 * policy keeps every other member, and every key, out of it.
 */
const ownRows = (table: string) =>
  `create policy ${table}_own on ${table} as restrictive for all
     using (app_principal_kind() = 'system' or (app_principal_kind() = 'member' and member_id = app_principal_id()))
     with check (app_principal_kind() = 'member' and member_id = app_principal_id())`

export default statements(
  `create table user_prefs (
     workspace_id text not null references workspaces(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     section      text not null,
     value        jsonb not null,
     version      int not null default 1,
     updated_at   timestamptz not null default now(),
     primary key (member_id, section)
   )`,
  tenantTable("user_prefs"),
  ownRows("user_prefs"),
  `create table saved_views (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     list_key     text not null,
     name         text not null check (length(trim(name)) between 1 and 60),
     filter       jsonb not null,
     sort         jsonb,
     pinned       boolean not null default false,
     position     int not null default 0,
     deleted_at   timestamptz,
     created_at   timestamptz not null default now()
   )`,
  "create index saved_views_member on saved_views (workspace_id, member_id, list_key) where deleted_at is null",
  `create unique index saved_views_name on saved_views (member_id, list_key, lower(name)) where deleted_at is null`,
  tenantTable("saved_views"),
  ownRows("saved_views"),
  `create table todos (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     text         text not null check (length(trim(text)) between 1 and 280),
     due          date,
     done_at      timestamptz,
     deleted_at   timestamptz,
     created_at   timestamptz not null default now()
   )`,
  "create index todos_member on todos (workspace_id, member_id, created_at desc) where deleted_at is null",
  tenantTable("todos"),
  ownRows("todos"),
  `create table recents (
     workspace_id text not null references workspaces(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     path         text not null,
     kind         text not null,
     label        text not null,
     visited_at   timestamptz not null default now(),
     primary key (member_id, path)
   )`,
  "create index recents_member on recents (member_id, visited_at desc)",
  tenantTable("recents"),
  ownRows("recents")
)
