import { statements } from "../statements.ts"

/*
 * Je gegevens (M17 step 5, PLAN 48; domain.md §17 `gdpr_requests`): the privacy requests Shopify sends (M6.3) and the
 * ones made in Insyte, in one table, with where each stands.
 *
 * - `gdpr_requests` gains `source` (`shopify`, from the app's GDPR topics; `operator`, asked for on Je gegevens;
 *   `insyte`, a scheduled export), the kinds Insyte adds (`workspace_export`, `workspace_delete`), the shopper it is
 *   about as Insyte knows them (`customer_id`, `subject` the address as typed), who asked (`requested_by`), `state`
 *   (`open` → `running` → `ready` | `failed`; a deletion `waiting` → `done` | `cancelled`) and the file it made
 *   (`file_id`, a `files` row the request owns). Shopify's rows keep their meaning: done when `completed_at` is set.
 * - `workspaces.export_schedule`: an export Insyte makes by itself, weekly or monthly, on the daily cron.
 * - `privacy_exports_due()`: the workspaces whose scheduled export is due, read before any workspace is in scope.
 * - `purge_workspace(id)`: the end of a deletion's waiting period. Only for the workspace in scope, as `system`, and
 *   only while its deletion is still waiting; it removes every row the workspace holds, the append-only log too.
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
  `alter table gdpr_requests add column state text not null default 'open'
     check (state in ('open', 'running', 'ready', 'failed', 'waiting', 'done', 'cancelled'))`,
  "alter table gdpr_requests add column file_id text",
  "alter table gdpr_requests add column error text",
  "update gdpr_requests set state = 'done' where completed_at is not null",
  "create index gdpr_requests_kind on gdpr_requests (workspace_id, kind, received_at desc)",
  // One deletion waits at a time.
  `create unique index gdpr_requests_one_deletion on gdpr_requests (workspace_id)
     where kind = 'workspace_delete' and state = 'waiting'`,
  `alter table workspaces add column export_schedule text not null default 'off'
     check (export_schedule in ('off', 'weekly', 'monthly'))`,
  `create function privacy_exports_due() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select w.id from workspaces w
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
  `create function purge_workspace(target text) returns integer
     language plpgsql security definer set search_path = public as $$
     declare t record; n integer := 0; c integer;
     begin
       if target is null or target <> app_workspace_id() or app_principal_kind() <> 'system' then
         raise exception 'purge_workspace: only the workspace in scope, as system';
       end if;
       if not exists (select 1 from gdpr_requests where workspace_id = target and kind = 'workspace_delete'
                        and state = 'waiting' and due_at <= now()) then
         raise exception 'purge_workspace: no deletion is due';
       end if;
       -- A course holds its chapter and module by a restricting key: it goes before them.
       delete from courses where workspace_id = target;
       -- The owner rule checks at commit that one owner remains; with the workspace gone there is none to keep.
       perform set_config('app.purging', target, true);
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
  // The owner rule (0009) steps aside for the workspace being purged in this transaction, and only for it.
  `create or replace function members_one_owner() returns trigger language plpgsql as $$
     declare ws text := coalesce(new.workspace_id, old.workspace_id);
     begin
       if ws = current_setting('app.purging', true) then
         return null;
       end if;
       if (select count(*) from members where workspace_id = ws and role_id = 'owner' and deactivated_at is null) <> 1 then
         raise exception 'workspace % must have exactly one active owner', ws using errcode = 'check_violation';
       end if;
       return null;
     end $$`,
  "grant execute on function purge_workspace(text) to insyte_app"
)
