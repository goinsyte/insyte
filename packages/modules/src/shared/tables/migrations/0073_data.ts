import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * The Data hub (M14 step 5; domain.md §5 "Imports", "Exports"; widgets/02 Part C): CSV files brought in, and any list
 * taken out as a file.
 *
 * - `imports`: one uploaded CSV (`files.kind = 'import_csv'`, owner `import`), parsed on the jobs Worker into
 *   `import_rows`. `state`: `uploaded` (waiting for the parse), `parsing`, `parsed` (the preview is ready, not yet
 *   imported), `failed` (`error` says why: not a CSV, no rows, too many rows, a row too wide, a cell too long, a quote
 *   that never closes, each at `error_line`; or `unreadable`, the jobs Worker gave up), `done` (committed: it is in
 *   Tabel and Exporteren). `deleted_at` is a removal the undo puts back; the nightly sweep purges it after an hour, and
 *   a file never imported after seven days. Workspace-wide.
 * - `import_rows`: the file's rows after the header, `n` from 1, every cell as text.
 * - `exports`: one file asked for, written by the `ExportWorkflow` (the registry's `source`: `orders`, `import`, and
 *   what other slices add). `columns` and `filter` are what the list showed; `store_scope` the requester's stores when
 *   asked, so the file holds what they could see. `state`: `queued`, `running`, `ready` (the file is `file_id` until
 *   `expires_at`, seven days), `failed` (`error` is `too_many_rows` for one over the hub's limit, else for the logs),
 *   `expired` (the sweep took the file away). Everything an export puts in the bucket is under its own folder;
 *   `cleared_at` is when that folder was emptied (its parts once ready; all of it once failed or expired), so the sweep
 *   tries again where a delete was refused. `requested_by` is a member.
 *
 * Members only: no partner reads them. `data_due_workspaces()`: the nightly sweep's workspaces, ids only.
 */
export default statements(
  `create table imports (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     file_id      text not null,
     file_name    text not null check (length(file_name) between 1 and 200),
     target       text not null default 'sheet' check (target in ('sheet')),
     state        text not null default 'uploaded'
                  check (state in ('uploaded', 'parsing', 'parsed', 'failed', 'done')),
     header       text[] not null default '{}',
     row_count    integer not null default 0 check (row_count >= 0),
     error        text check (error in ('not_csv', 'empty', 'too_large', 'too_wide', 'cell_too_long', 'parse_failed',
                                        'unreadable')),
     error_line   integer,
     created_by   text not null,
     created_at   timestamptz not null default now(),
     parsed_at    timestamptz,
     committed_at timestamptz,
     deleted_at   timestamptz
   )`,
  "create index imports_list on imports (workspace_id, created_at desc) where deleted_at is null",
  tenantTable("imports", { membersOnly: true }),
  `create table import_rows (
     workspace_id text not null references workspaces(id) on delete cascade,
     import_id    text not null references imports(id) on delete cascade,
     n            integer not null check (n >= 1),
     cells        text[] not null,
     primary key (import_id, n)
   )`,
  tenantTable("import_rows", { membersOnly: true }),
  `create table exports (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     source       text not null check (source ~ '^[a-z][a-z_]{1,39}$'),
     source_ref   text,
     columns      text[] not null default '{}',
     filter       jsonb,
     store_scope  text[],
     format       text not null default 'csv' check (format in ('csv', 'xlsx', 'zip')),
     file_name    text not null check (length(file_name) between 1 and 200),
     state        text not null default 'queued' check (state in ('queued', 'running', 'ready', 'failed', 'expired')),
     rows_written integer not null default 0 check (rows_written >= 0),
     rows_total   integer check (rows_total >= 0),
     file_id      text,
     error        text check (length(error) <= 500),
     requested_by text not null,
     created_at   timestamptz not null default now(),
     started_at   timestamptz,
     finished_at  timestamptz,
     expires_at   timestamptz,
     cleared_at   timestamptz
   )`,
  "create index exports_list on exports (workspace_id, requested_by, created_at desc)",
  "create index exports_expiring on exports (expires_at) where state = 'ready'",
  tenantTable("exports", { membersOnly: true }),
  // The nightly sweep's workspaces: an export to expire, to call stale or whose folder is still to empty, an import to
  // purge, or an upload never made an import. Ids only.
  "create policy exports_routing on exports as permissive for select to insyte_owner using (true)",
  "create policy imports_routing on imports as permissive for select to insyte_owner using (true)",
  "create policy files_import_routing on files as permissive for select to insyte_owner using (kind = 'import_csv')",
  `create function data_due_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query
         select e.workspace_id from exports e
         where (e.state = 'ready' and e.expires_at <= now())
            or (e.state in ('queued', 'running') and e.created_at < now() - interval '24 hours')
            or (e.state in ('failed', 'expired') and e.cleared_at is null)
            or (e.state = 'ready' and e.cleared_at is null and e.finished_at < now() - interval '1 hour')
         union
         select i.workspace_id from imports i
         where (i.deleted_at is not null and i.deleted_at < now() - interval '1 hour')
            or (i.state <> 'done' and i.created_at < now() - interval '7 days')
         union
         select f.workspace_id from files f
         where f.kind = 'import_csv' and f.owner_id is null and f.deleted_at is null
           and f.created_at < now() - interval '7 days';
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function data_due_workspaces() from public",
  "grant execute on function data_due_workspaces() to insyte_app"
)
