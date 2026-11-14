import { statements } from "../statements.ts"

/*
 * Je gegevens (M17 step 5, PLAN 48; domain.md §17 `gdpr_requests`): the privacy requests Shopify sends (M6.3) and the
 * ones made in Insyte, in one table, with where each stands.
 *
 * - `gdpr_requests` gains `source` (`shopify`, from the app's GDPR topics; `operator`, asked for on Je gegevens;
 *   `insyte`, a scheduled export), the kinds Insyte adds (`workspace_export`, `workspace_delete`), the shopper it is
 *   about as Insyte knows them (`customer_id`, `subject` the address as typed), who asked (`requested_by`) and the
 *   stores their role reached then (`stores`, null for all), `state` (`open` → `running` → `ready` | `failed`; a
 *   deletion `waiting` → `purging` → `done`, or `cancelled` while it waits), `attempts` and `started_at` (each run
 *   is named by the request and its attempt, so asking again after a failure starts a new one), and the file it made
 *   (`file_id`, a `files` row the request owns; `files_removed_at` once the sweep removed it from the bucket after
 *   its 7 days).
 *   Shopify's rows keep their meaning: done when `completed_at` is set.
 * - `workspaces.export_schedule`: an export Insyte makes by itself, weekly or monthly, on the daily cron.
 * - Routing reads for the security-definer functions below, which run as `insyte_owner` and see no workspace's rows
 *   through the `_ws` policies (as 0055 did for others): `gdpr_requests_routing`.
 * - `privacy_exports_due()`, `privacy_files_expired()`, `privacy_deletions_stranded()`: the daily sweeps' work across
 *   workspaces, read before any workspace is in scope.
 * - `purge_workspace(id)`: the end of a deletion's waiting period. Only for the workspace in scope, as `system`, and
 *   only while its deletion is being purged; it removes every row the workspace holds, the append-only log too.
 * - `members_one_owner()` (0009) steps aside for a workspace that no longer exists (`workspace_exists`, read past the
 *   policies), which is the purge and only the purge.
 * - `scrub_workspace(patterns)`: a shopper's erasure, last step. Every text, jsonb and text[] column of every table
 *   in the workspace in scope (keys and ids aside), the append-only log included, with each pattern replaced by
 *   `[verwijderd]`; answers the rows it changed. As `system` only.
 */
export default statements(
  "alter table gdpr_requests drop constraint gdpr_requests_kind_check",
  `alter table gdpr_requests add constraint gdpr_requests_kind_check
     check (kind in ('data_request', 'customer_redact', 'shop_redact', 'workspace_export', 'workspace_delete'))`,
  `alter table gdpr_requests add column source text not null default 'shopify'
     check (source in ('shopify', 'operator', 'insyte'))`,
  "alter table gdpr_requests add column customer_id text references customers(id) on delete set null",
  "alter table gdpr_requests add column subject text check (length(subject) <= 320)",
  "alter table gdpr_requests add column requested_by text",
  "alter table gdpr_requests add column stores text[]",
  `alter table gdpr_requests add column state text not null default 'open'
     check (state in ('open', 'running', 'ready', 'failed', 'waiting', 'purging', 'done', 'cancelled'))`,
  "alter table gdpr_requests add column attempts integer not null default 0",
  "alter table gdpr_requests add column started_at timestamptz",
  "alter table gdpr_requests add column file_id text",
  "alter table gdpr_requests add column files_removed_at timestamptz",
  "alter table gdpr_requests add column error text",
  "update gdpr_requests set state = 'done' where completed_at is not null",
  "create index gdpr_requests_kind on gdpr_requests (workspace_id, kind, received_at desc)",
  "create index gdpr_requests_customer on gdpr_requests (workspace_id, customer_id) where customer_id is not null",
  // One deletion waits, or is purged, at a time.
  `create unique index gdpr_requests_one_deletion on gdpr_requests (workspace_id)
     where kind = 'workspace_delete' and state in ('waiting', 'purging')`,
  `alter table workspaces add column export_schedule text not null default 'off'
     check (export_schedule in ('off', 'weekly', 'monthly'))`,
  "create policy gdpr_requests_routing on gdpr_requests as permissive for select to insyte_owner using (true)",
  `create function privacy_exports_due() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       -- As 0055's routing reads: \`system\` for the members-side policy, put back after.
       perform set_config('app.principal_kind', 'system', true);
       return query
       select w.id from workspaces w
        where w.export_schedule <> 'off' and w.deleted_at is null
          and not exists (
            select 1 from gdpr_requests g
             where g.workspace_id = w.id and g.kind = 'workspace_export' and g.state in ('open', 'running', 'ready')
               and g.received_at > now() - case w.export_schedule when 'weekly' then interval '7 days'
                                                                  else interval '1 month' end + interval '1 hour')
        order by w.id;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function privacy_exports_due() from public",
  "grant execute on function privacy_exports_due() to insyte_app",
  // A file past its 7 days, or what a run left behind (failed, or started a day ago and stuck since).
  `create function privacy_files_expired() returns table (workspace_id text, request_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       -- As 0055's routing reads: \`system\` for the members-side policy, put back after.
       perform set_config('app.principal_kind', 'system', true);
       return query
       select g.workspace_id, g.id from gdpr_requests g
        where g.kind in ('workspace_export', 'data_request') and g.files_removed_at is null
          and ((g.state = 'ready' and g.completed_at < now() - interval '7 days')
            or (g.state = 'failed')
            or (g.state in ('open', 'running') and g.started_at < now() - interval '1 day'))
        order by g.workspace_id, g.id;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function privacy_files_expired() from public",
  "grant execute on function privacy_files_expired() to insyte_app",
  // A deletion past its time by an hour that is still waiting (its run never woke) or purging (its run gave up).
  `create function privacy_deletions_stranded() returns table (workspace_id text, request_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       -- As 0055's routing reads: \`system\` for the members-side policy, put back after.
       perform set_config('app.principal_kind', 'system', true);
       return query
       select g.workspace_id, g.id from gdpr_requests g
        where g.kind = 'workspace_delete' and g.state in ('waiting', 'purging') and g.due_at < now() - interval '1 hour'
        order by g.workspace_id, g.id;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function privacy_deletions_stranded() from public",
  "grant execute on function privacy_deletions_stranded() to insyte_app",
  `create function purge_workspace(target text) returns integer
     language plpgsql security definer set search_path = public as $$
     declare t record; n integer := 0; c integer;
     begin
       if target is null or target <> app_workspace_id() or app_principal_kind() <> 'system' then
         raise exception 'purge_workspace: only the workspace in scope, as system';
       end if;
       if not exists (select 1 from gdpr_requests where workspace_id = target and kind = 'workspace_delete'
                        and state = 'purging' and due_at <= now()) then
         raise exception 'purge_workspace: no deletion is being purged';
       end if;
       -- A course holds its chapter and module by a restricting key: it goes before them.
       delete from courses where workspace_id = target;
       delete from workspaces where id = target;
       get diagnostics n = row_count;
       -- What holds the workspace's id without a key to it: the log, the outbox, the files, the counters.
       for t in select c2.table_name from information_schema.columns c2
                  join information_schema.tables t2 on t2.table_schema = c2.table_schema and t2.table_name = c2.table_name
                 where c2.table_schema = 'public' and c2.column_name = 'workspace_id' and t2.table_type = 'BASE TABLE'
                   and not exists (select 1 from pg_inherits i where i.inhrelid = (quote_ident(c2.table_name))::regclass)
      loop
        execute format('delete from %I where workspace_id = $1', t.table_name) using target;
        get diagnostics c = row_count;
        n := n + c;
      end loop;
      return n;
     end $$`,
  "revoke all on function purge_workspace(text) from public",
  "grant execute on function purge_workspace(text) to insyte_app",
  `create function workspace_exists(target text) returns boolean
     language sql stable security definer set search_path = public as $$
       select exists (select 1 from workspaces where id = target)
     $$`,
  "revoke all on function workspace_exists(text) from public",
  "grant execute on function workspace_exists(text) to insyte_app",
  // The owner rule (0009) has nothing to keep once the workspace itself is gone: the purge.
  `create or replace function members_one_owner() returns trigger language plpgsql as $$
     declare ws text := coalesce(new.workspace_id, old.workspace_id);
     begin
       if not workspace_exists(ws) then
         return null;
       end if;
       if (select count(*) from members where workspace_id = ws and role_id = 'owner' and deactivated_at is null) <> 1 then
         raise exception 'workspace % must have exactly one active owner', ws using errcode = 'check_violation';
       end if;
       return null;
     end $$`,
  // Each pattern a regular expression (the caller escapes the literal it stands for).
  `create function scrub_workspace(patterns text[]) returns integer
     language plpgsql security definer set search_path = public as $$
     declare
       ws text := app_workspace_id();
       t record; p text; n integer := 0; c integer;
       col text; sets text; hits text;
     begin
       if ws is null or app_principal_kind() <> 'system' then
         raise exception 'scrub_workspace: only the workspace in scope, as system';
       end if;
       if patterns is null or cardinality(patterns) = 0 then
         return 0;
       end if;
       -- One pass over each table, every pattern at once.
       p := '(' || array_to_string(patterns, '|') || ')';
       for t in select c2.table_name,
                       array_agg(c2.column_name::text order by c2.ordinal_position) as cols,
                       array_agg(c2.udt_name::text order by c2.ordinal_position) as types
                  from information_schema.columns c2
                  join information_schema.tables t2 on t2.table_schema = c2.table_schema and t2.table_name = c2.table_name
                 where c2.table_schema = 'public' and t2.table_type = 'BASE TABLE'
                   and c2.udt_name in ('text', 'jsonb', '_text')
                   and c2.is_generated = 'NEVER'
                   and c2.column_name <> 'id' and c2.column_name !~ '(_id|_key|_ids|_hash)$'
                   and c2.table_name <> 'connection_credentials'
                   and exists (select 1 from information_schema.columns w
                                where w.table_schema = 'public' and w.table_name = c2.table_name
                                  and w.column_name = 'workspace_id')
                   and not exists (select 1 from pg_inherits i where i.inhrelid = (quote_ident(c2.table_name))::regclass)
                 group by c2.table_name
       loop
         sets := ''; hits := '';
         for i in 1 .. cardinality(t.cols) loop
           col := quote_ident(t.cols[i]);
           if t.types[i] = 'text' then
             sets := sets || format('%s = regexp_replace(%s, %L, ''[verwijderd]'', ''gi''), ', col, col, p);
             hits := hits || format('%s ~* %L or ', col, p);
           elsif t.types[i] = 'jsonb' then
             sets := sets || format('%s = regexp_replace(%s::text, %L, ''[verwijderd]'', ''gi'')::jsonb, ', col, col, p);
             hits := hits || format('%s::text ~* %L or ', col, p);
           else
             sets := sets || format('%s = regexp_replace(%s::text, %L, ''[verwijderd]'', ''gi'')::text[], ', col, col, p);
             hits := hits || format('%s::text ~* %L or ', col, p);
           end if;
         end loop;
         execute format('update %I set %s where workspace_id = $1 and (%s)',
                        t.table_name, left(sets, -2), left(hits, -4)) using ws;
         get diagnostics c = row_count;
         n := n + c;
       end loop;
       return n;
     end $$`,
  "revoke all on function scrub_workspace(text[]) from public",
  "grant execute on function scrub_workspace(text[]) to insyte_app"
)
