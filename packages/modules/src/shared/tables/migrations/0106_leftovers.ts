import { statements } from "../statements.ts"

/*
 * Leftovers of earlier waves (W13.4).
 *
 * - `scrub_workspace(patterns)` (0076) keeps every column's checks. It replaced each pattern by `[verwijderd]` in one
 *   `update` per table, so a row whose text grew past its column's length check (a 7-letter name in a 200-character
 *   title at its limit), whose unique key collided once two values became the same placeholder, or whose JSON no
 *   longer parsed, failed that update, and the whole erasure rolled back with it. Each table's `update` now runs on
 *   its own; when it breaks a check, the table is done again row by row and column by column, each cell with the
 *   first value its checks take: the placeholder, the text without the match, a placeholder of its own (for a unique
 *   key), null where the column allows it, and an empty value of the same JSON type. A cell none of them fits (a
 *   column whose check admits a fixed list or format only, which no person's name or address can be in) stays as it
 *   was, with a warning that names the table and column, never the value.
 * - `automation_versions_frozen()` (0056) lets that scrub through: a published version is immutable, except for a
 *   shopper's erasure, as `system`, which may blank their words in its note or steps.
 */

/** The errors a cell's value can cause against its column: a check, not-null, unique or key (23), or its type (22). */
const BROKEN = "integrity_constraint_violation or data_exception"

export default statements(
  `create or replace function automation_versions_frozen() returns trigger language plpgsql as $$
     begin
       if current_setting('app.scrubbing', true) = 'on' and app_principal_kind() = 'system' then
         return new;
       end if;
       raise exception 'automation_versions rows are immutable';
     end $$`,
  `create or replace function scrub_workspace(patterns text[]) returns integer
     language plpgsql security definer set search_path = public as $$
     declare
       ws text := app_workspace_id();
       t record; r record; p text; n integer := 0; c integer;
       col text; sets text; hits text; hit text[]; cands text[]; cand text;
       loc tid; moved tid; matched boolean; fitted boolean; touched boolean;
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
           for r in execute format('select tableoid::regclass::text as part, ctid from %I where workspace_id = $1 and (%s)',
                                   t.table_name, hits) using ws
           loop
             loc := r.ctid; touched := false;
             for i in 1 .. cardinality(t.cols) loop
               col := quote_ident(t.cols[i]);
               execute format('select coalesce(%s, false) from %s where ctid = $1', hit[i], r.part) into matched using loc;
               continue when not matched;
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
                   execute format('update %s set %s = %s where ctid = $1 returning ctid', r.part, col, cand)
                     into moved using loc;
                   loc := moved; fitted := true; touched := true;
                   exit;
                 exception when ${BROKEN} then
                   null;
                 end;
               end loop;
               if not fitted then
                 raise warning 'scrub_workspace: %.% kept as it was, no placeholder fits its checks', t.table_name, t.cols[i];
               end if;
             end loop;
             if touched then
               n := n + 1;
             end if;
           end loop;
         end;
       end loop;
       perform set_config('app.scrubbing', '', true);
       return n;
     end $$`
)
