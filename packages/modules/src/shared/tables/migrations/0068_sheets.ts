import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Rekenbladen (M14 step 4; widgets/02 Part C, api.md §2.31): a member's own sheets, kept as they were typed. A tab
 * holds its cells as the design's model, address → `{ v, fmt?, bold?, align? }` (≤ 480 cells, the 12 × 40 grid), and
 * its column widths; no computed value and no copy of a figure is stored, so a sheet never holds a stale number
 * (ADR-0028: the browser evaluates, the server only on export). `version` is the whole sheet's: a save names the
 * version it started from and a stale one is refused (`Conflict stale_version`). A sheet is its owner's and the
 * members it is shared with (edit rights); folders are the workspace's. Pinned and recent are each member's own
 * (`sheet_member_state`), so pinning a shared sheet pins it for nobody else. A removed sheet keeps its rows for the
 * undo window and the bin (`deleted_at`).
 */
export default statements(
  `create table sheet_folders (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     name         text not null check (btrim(name) <> '' and char_length(name) <= 60),
     created_by   text not null,
     created_at   timestamptz not null default now()
   )`,
  "create unique index sheet_folders_name on sheet_folders (workspace_id, lower(name))",
  tenantTable("sheet_folders", { membersOnly: true }),
  `create table sheets (
     id              text primary key,
     workspace_id    text not null references workspaces(id) on delete cascade,
     owner_member_id text not null references members(id) on delete cascade,
     title           text not null check (btrim(title) <> '' and char_length(title) <= 120),
     folder_id       text references sheet_folders(id) on delete set null,
     source          text not null default 'template:blank'
                       check (source in ('template:blank', 'template:profit', 'template:ads', 'csv',
                                         'first_analysis', 'duplicate')),
     version         integer not null default 1 check (version >= 1),
     archived_at     timestamptz,
     deleted_at      timestamptz,
     created_at      timestamptz not null default now(),
     updated_at      timestamptz not null default now()
   )`,
  "create index sheets_owner on sheets (workspace_id, owner_member_id) where deleted_at is null",
  "create index sheets_folder on sheets (folder_id) where folder_id is not null",
  "create trigger sheets_touch before update on sheets for each row execute function touch_updated_at()",
  tenantTable("sheets", { membersOnly: true }),
  `create table sheet_tabs (
     id           text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
     workspace_id text not null references workspaces(id) on delete cascade,
     sheet_id     text not null references sheets(id) on delete cascade,
     name         text not null check (btrim(name) <> '' and char_length(name) <= 40),
     position     integer not null,
     cells        jsonb not null default '{}'::jsonb check (jsonb_typeof(cells) = 'object'),
     widths       jsonb not null default '{}'::jsonb check (jsonb_typeof(widths) = 'object'),
     primary key (sheet_id, id)
   )`,
  "create index sheet_tabs_order on sheet_tabs (sheet_id, position)",
  tenantTable("sheet_tabs", { membersOnly: true }),
  `create table sheet_shares (
     workspace_id text not null references workspaces(id) on delete cascade,
     sheet_id     text not null references sheets(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     granted_by   text not null,
     granted_at   timestamptz not null default now(),
     primary key (sheet_id, member_id)
   )`,
  "create index sheet_shares_member on sheet_shares (workspace_id, member_id)",
  tenantTable("sheet_shares", { membersOnly: true }),
  `create table sheet_member_state (
     workspace_id text not null references workspaces(id) on delete cascade,
     sheet_id     text not null references sheets(id) on delete cascade,
     member_id    text not null references members(id) on delete cascade,
     pinned       boolean not null default false,
     opened_at    timestamptz,
     primary key (sheet_id, member_id)
   )`,
  "create index sheet_member_state_member on sheet_member_state (workspace_id, member_id)",
  tenantTable("sheet_member_state", { membersOnly: true })
)
