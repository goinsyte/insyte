import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Settings depth (M17 track 1, step 20.1b; domain.md §16.1): the workspace's settings sections and the retention runs.
 *
 * - `workspace_settings`: one row per workspace and section (Verzending `shipping`, Sjablonen `links`, Huisstijl
 *   `brand`, E-mail en domein `domain_senders`, Btw `vat`, Gegevens en privacy `retention`), the value as the slice
 *   checked it and a version: a save names the version it read, and an older one is refused (`stale_version`). A
 *   section never saved has no row; the slice answers its defaults at version 0.
 * - `retention_runs`: one row per dry-run count ("Nu tellen") and per nightly erase, with the periods it ran with and
 *   what it found per class. Turning erasing on needs a count of the saved periods; the erase is checked against it.
 * - `retention_due_workspaces(at)`: the workspaces whose erase is due at the sweep's time (erasing on, 03:00 in the
 *   workspace's timezone, none run that day), read before any workspace is in scope, as the digest's is (0055).
 */
export default statements(
  `create table workspace_settings (
     workspace_id text not null references workspaces(id) on delete cascade,
     section      text not null check (section in ('shipping', 'links', 'brand', 'domain_senders', 'vat', 'retention')),
     value        jsonb not null,
     version      integer not null default 1 check (version > 0),
     updated_by   text,
     updated_at   timestamptz not null default now(),
     primary key (workspace_id, section)
   )`,
  tenantTable("workspace_settings", { membersOnly: true }),
  `create table retention_runs (
     id           text primary key,
     workspace_id text not null references workspaces(id) on delete cascade,
     kind         text not null check (kind in ('count', 'erase')),
     periods      jsonb not null,
     per_class    jsonb not null,
     total        integer not null check (total >= 0),
     ran_by       text not null,
     ran_at       timestamptz not null default now()
   )`,
  "create index retention_runs_latest on retention_runs (workspace_id, kind, ran_at desc)",
  tenantTable("retention_runs", { membersOnly: true }),
  // Routing reads for the function below, which runs as `insyte_owner` and so sees no workspace's rows otherwise.
  "create policy workspace_settings_routing on workspace_settings as permissive for select to insyte_owner using (true)",
  "create policy retention_runs_routing on retention_runs as permissive for select to insyte_owner using (true)",
  `create function retention_due_workspaces(due_at timestamptz) returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select w.id from workspaces w
                    join workspace_settings s on s.workspace_id = w.id and s.section = 'retention'
                    cross join lateral (select due_at at time zone w.timezone as local) h
                    where w.deleted_at is null
                      and coalesce((s.value ->> 'erasing')::boolean, false)
                      and extract(hour from h.local) = 3
                      and not exists (select 1 from retention_runs r
                                      where r.workspace_id = w.id and r.kind = 'erase'
                                        and (r.ran_at at time zone w.timezone)::date = h.local::date);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function retention_due_workspaces(timestamptz) from public",
  "grant execute on function retention_due_workspaces(timestamptz) to insyte_app"
)
