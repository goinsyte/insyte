import { statements } from "../statements.ts"
import { KINDS, trashView } from "./0101_trash_kinds.ts"

/*
 * Leftovers of earlier waves (W13.4).
 *
 * - `scrub_workspace(patterns)` (0076) keeps every column's checks. It replaced each pattern by `[verwijderd]` in one
 *   `update` per table, so a row whose text grew past its column's length check (a 7-letter name in a 200-character
 *   title at its limit), whose unique key collided once two values became the same placeholder, or whose JSON no
 *   longer parsed, failed that update, and the whole erasure rolled back with it. Each table's `update` now runs on
 *   its own; when it breaks a check, the table is done again row by row and column by column, each cell with the
 *   first value its checks take: the placeholder, the text without the match, a placeholder of its own (for a unique
 *   key), null where the column allows it, and an empty value of the same JSON type. Each cell is read and written
 *   through its table (`ctid` and `tableoid`), never through a partition: 0097 seals the partitions themselves, so a
 *   write there finds no row. A write that finds no row is no fit. A cell none of them fits (a column whose check
 *   admits a fixed list or format only) fails the erasure: `scrub_workspace` raises, naming the tables and columns,
 *   never a value, so the whole erasure rolls back and its request never reads as done. Shopify's redact is tried
 *   again; an operator's "Gegevens wissen" answers the failure.
 * - `automation_versions_frozen()` (0056) lets that scrub through: a published version is immutable, except for a
 *   shopper's erasure, which may blank their words in its `note` and `nodes` and nothing else. Only inside the scrub:
 *   as `insyte_owner` (its definer, which the app never is) with the scrub's own setting, as `system`.
 * - The outbox's dead letters (`dead_lettered_at`, `dead_letter_reason`): a row the relay cannot read as its event is
 *   set aside there, never marked relayed, and `outbox_dead_letters()` counts them, and the rows held back, for
 *   `/api/health/deep` (counts only, across workspaces). A privacy, billing or webhook event is never set aside: it
 *   stays due, waits longer each time, and is logged as an error until someone reads it (`Relay.deliver`).
 * - Suppliers join the Prullenbak (`supplier`, 0101's pattern). A removed supplier is listed for 30 days (from now for
 *   one removed before), put back through Leveranciers, and purged. A purge does not delete the row: its statements,
 *   quality checks, conversations and supplier work are bookkeeping history that `on delete cascade` would take with
 *   it. It marks the supplier `purged_at` (out of the trash, never back), and takes out what is theirs alone: the
 *   contact details on the row, its contacts and their invitations, its integrations, and the products it supplied;
 *   its name becomes "Verwijderde leverancier" and its vendor is cleared, since a sole trader's name is a person's.
 */

const SUPPLIER = `select workspace_id, 'supplier'::text, id, name, null::text, null::text, deleted_at,
                          'supplier'::text, 'supplier.removed'::text
                   from suppliers where deleted_at is not null and purged_at is null`

/** The errors a cell's value can cause against its column: a check, not-null, unique or key (23), or its type (22). */
const BROKEN = "integrity_constraint_violation or data_exception"

export default statements(
  "alter table suppliers add column purged_at timestamptz",
  "alter table suppliers add constraint suppliers_purged_removed check (purged_at is null or deleted_at is not null)",
  `create index suppliers_trash on suppliers (workspace_id, deleted_at)
     where deleted_at is not null and purged_at is null`,
  "insert into trash_kind_joins (kind) values ('supplier')",
  `create or replace view trash_items_v with (security_invoker = true) as ${trashView([...KINDS, SUPPLIER])}`,
  `create or replace function automation_versions_frozen() returns trigger language plpgsql as $$
     begin
       if current_user = 'insyte_owner' and current_setting('app.scrubbing', true) = 'on'
          and app_principal_kind() = 'system'
          and to_jsonb(new) - array['note', 'nodes'] = to_jsonb(old) - array['note', 'nodes'] then
         return new;
       end if;
       raise exception 'automation_versions rows are immutable';
     end $$`,
  `alter table outbox add column dead_lettered_at timestamptz,
                     add column dead_letter_reason text
                       check (dead_letter_reason is null or char_length(dead_letter_reason) <= 200)`,
  `create or replace function outbox_due(lim int) returns table (id text, workspace_id text)
     language sql security definer set search_path = public as $$
       select id, workspace_id from outbox
       where relayed_at is null and cancelled_at is null and dead_lettered_at is null
         and coalesce(not_before, created_at) <= now()
       order by created_at limit least(lim, 500)
       for update skip locked
     $$`,
  `create function outbox_dead_letters() returns table (dead_lettered bigint, held bigint)
     language sql security definer set search_path = public as $$
       select count(*) filter (where dead_lettered_at is not null),
              count(*) filter (where dead_lettered_at is null and relayed_at is null and dead_letter_reason is not null)
       from outbox where dead_letter_reason is not null
     $$`,
  "create index outbox_dead_letters on outbox (created_at) where dead_letter_reason is not null",
  "revoke all on function outbox_dead_letters() from public",
  "grant execute on function outbox_dead_letters() to insyte_app",
  `create or replace function scrub_workspace(patterns text[]) returns integer
     language plpgsql security definer set search_path = public as $$
     declare
       ws text := app_workspace_id();
       t record; r record; p text; n integer := 0; c integer;
       col text; sets text; hits text; hit text[]; cands text[]; cand text;
       loc tid; part oid; moved tid; matched boolean; fitted boolean; touched boolean; kept text[] := '{}';
     begin
       if ws is null or app_principal_kind() <> 'system' then
         raise exception 'scrub_workspace: only the workspace in scope, as system';
       end if;
       if patterns is null or cardinality(patterns) = 0 then
         return 0;
       end if;
       -- One pass over each table, every pattern at once.
       p := '(' || array_to_string(patterns, '|') || ')';
       perform set_config('app.scrubbing', 'on', true);
       for t in select c2.table_name,
                       array_agg(c2.column_name::text order by c2.ordinal_position) as cols,
                       array_agg(c2.udt_name::text order by c2.ordinal_position) as types,
                       array_agg(c2.is_nullable = 'YES' order by c2.ordinal_position) as nullable
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
         sets := ''; hits := ''; hit := '{}';
         for i in 1 .. cardinality(t.cols) loop
           col := quote_ident(t.cols[i]);
           if t.types[i] = 'text' then
             sets := sets || format('%s = regexp_replace(%s, %L, ''[verwijderd]'', ''gi''), ', col, col, p);
             hit := hit || format('%s ~* %L', col, p);
           elsif t.types[i] = 'jsonb' then
             sets := sets || format('%s = regexp_replace(%s::text, %L, ''[verwijderd]'', ''gi'')::jsonb, ', col, col, p);
             hit := hit || format('%s::text ~* %L', col, p);
           else
             sets := sets || format('%s = regexp_replace(%s::text, %L, ''[verwijderd]'', ''gi'')::text[], ', col, col, p);
             hit := hit || format('%s::text ~* %L', col, p);
           end if;
         end loop;
         hits := array_to_string(hit, ' or ');
         begin
           execute format('update %I set %s where workspace_id = $1 and (%s)', t.table_name, left(sets, -2), hits)
             using ws;
           get diagnostics c = row_count;
           n := n + c;
         exception when ${BROKEN} then
           -- A value broke its column's checks: the table again, cell by cell, each with the first value that fits.
           -- Through the table, not the partition a row is in: the partitions are sealed (0097).
           for r in execute format('select tableoid, ctid from %I where workspace_id = $1 and (%s)', t.table_name, hits)
                      using ws
           loop
             loc := r.ctid; part := r.tableoid; touched := false;
             for i in 1 .. cardinality(t.cols) loop
               col := quote_ident(t.cols[i]);
               matched := null;
               execute format('select %s from %I where ctid = $1 and tableoid = $2', hit[i], t.table_name)
                 into matched using loc, part;
               continue when not coalesce(matched, false);
               if t.types[i] = 'text' then
                 cands := array[
                   format('regexp_replace(%s, %L, ''[verwijderd]'', ''gi'')', col, p),
                   format('regexp_replace(%s, %L, '''', ''gi'')', col, p),
                   format('regexp_replace(%s, %L, ''[verwijderd '' || left(md5(random()::text), 6) || '']'', ''gi'')',
                          col, p)];
               elsif t.types[i] = 'jsonb' then
                 cands := array[
                   format('regexp_replace(%s::text, %L, ''[verwijderd]'', ''gi'')::jsonb', col, p),
                   format('regexp_replace(%s::text, %L, '''', ''gi'')::jsonb', col, p)];
               else
                 cands := array[
                   format('regexp_replace(%s::text, %L, ''[verwijderd]'', ''gi'')::text[]', col, p),
                   format('array(select e from unnest(%s) e where e !~* %L)', col, p)];
               end if;
               if t.nullable[i] then
                 cands := cands || 'null'::text;
               end if;
               if t.types[i] = 'jsonb' then
                 cands := cands || format('case jsonb_typeof(%s) when ''array'' then ''[]''::jsonb when ''object'' then ''{}''::jsonb
                                           else ''""''::jsonb end', col);
               end if;
               fitted := false;
               foreach cand in array cands loop
                 begin
                   moved := null;
                   execute format('update %I set %s = %s where ctid = $1 and tableoid = $2 returning ctid',
                                  t.table_name, col, cand)
                     into moved using loc, part;
                   -- A write that found no row fitted nothing.
                   if moved is not null then
                     loc := moved; fitted := true; touched := true;
                     exit;
                   end if;
                 exception when ${BROKEN} then
                   null;
                 end;
               end loop;
               if not fitted and not (t.table_name || '.' || t.cols[i]) = any(kept) then
                 kept := kept || (t.table_name || '.' || t.cols[i]);
               end if;
             end loop;
             if touched then
               n := n + 1;
             end if;
           end loop;
         end;
       end loop;
       -- A shopper left anywhere fails the erasure: names only, never a value.
       if cardinality(kept) > 0 then
         raise exception 'scrub_workspace: no placeholder fits %, the erasure is not complete', array_to_string(kept, ', ')
           using hint = 'a column whose checks take no placeholder holds the shopper';
       end if;
       perform set_config('app.scrubbing', '', true);
       return n;
     end $$`
)
