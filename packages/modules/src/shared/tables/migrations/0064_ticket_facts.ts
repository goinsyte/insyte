import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Tickets by the day they came in (M14 step 1, only what Analyse reads; domain.md §10, ADR-0017, widgets/02 §B):
 * per workspace × day (the workspace's timezone) × store × topic, how many came in, how many of those are done, and the
 * minutes they took to be done. "Uren tot opgelost" and support by weekday sum these. A ticket in the bin or marked as
 * spam does not count. A ticket may have no store (one made by hand), so the days are not `fact_dirty_days`' store
 * days: a statement trigger on `tickets` recomputes the days a write touched, inline, from the rows, as the other facts
 * are recomputed, never added to. Tickets are few per day, so the recompute is a small read in the writer's
 * transaction. Disputes wait for the chargebacks table (M13); the supplier and affiliate facts for their milestones.
 */
export default statements(
  // The recompute's and the records' range over a workspace's tickets.
  "create index tickets_created on tickets (workspace_id, created_at)",
  `create table fact_tickets_day (
     workspace_id        text not null references workspaces(id) on delete cascade,
     day                 date not null,
     store_id            text references stores(id) on delete cascade,
     topic               text,
     created             integer not null default 0,
     resolved            integer not null default 0,
     resolve_minutes_sum bigint not null default 0
   )`,
  `create unique index fact_tickets_day_grain on fact_tickets_day (workspace_id, day, store_id, topic)
     nulls not distinct`,
  "create index fact_tickets_day_range on fact_tickets_day (workspace_id, day)",
  tenantTable("fact_tickets_day", { membersOnly: true }),
  // One workspace's days recomputed from its tickets. As `system`, so whoever wrote the ticket keeps its facts true.
  `create function facts_tickets_rebuild(ws text, days date[]) returns void
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true); tz text;
     begin
       if ws is null or days is null or cardinality(days) = 0 then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       select timezone into tz from workspaces where id = ws;
       delete from fact_tickets_day where workspace_id = ws and day = any(days);
       insert into fact_tickets_day (workspace_id, day, store_id, topic, created, resolved, resolve_minutes_sum)
       select t.workspace_id, (t.created_at at time zone tz)::date, t.store_id, nullif(t.topic, ''), count(*),
              count(*) filter (where t.status = 'done' and t.resolved_at is not null),
              coalesce(sum(greatest(0, round(extract(epoch from t.resolved_at - t.created_at) / 60)))
                filter (where t.status = 'done' and t.resolved_at is not null), 0)
       from tickets t
       where t.workspace_id = ws and t.deleted_at is null and t.spam_at is null
         and t.created_at >= ((select min(d) from unnest(days) d) - 1)::timestamp at time zone tz
         and t.created_at < ((select max(d) from unnest(days) d) + 2)::timestamp at time zone tz
         and (t.created_at at time zone tz)::date = any(days)
       group by 1, 2, 3, 4;
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function facts_tickets_rebuild(text, date[]) from public",
  "grant execute on function facts_tickets_rebuild(text, date[]) to insyte_app",
  // The days the changed tickets came in on, before and after; an update that touches nothing a figure reads (a move
  // on the board, a label) recomputes nothing.
  `create function facts_tickets_touched() returns trigger language plpgsql as $$
     declare r record;
     begin
       for r in
         with changed as (
           select n.workspace_id, n.created_at from new_rows n
           where TG_OP = 'INSERT' or not exists (
             select 1 from old_rows o where o.id = n.id
               and o.created_at = n.created_at and o.status = n.status
               and o.resolved_at is not distinct from n.resolved_at and o.store_id is not distinct from n.store_id
               and o.topic is not distinct from n.topic and o.deleted_at is not distinct from n.deleted_at
               and o.spam_at is not distinct from n.spam_at)
           union all
           select o.workspace_id, o.created_at from old_rows o
           where TG_OP = 'DELETE' or not exists (
             select 1 from new_rows n where n.id = o.id
               and o.created_at = n.created_at and o.status = n.status
               and o.resolved_at is not distinct from n.resolved_at and o.store_id is not distinct from n.store_id
               and o.topic is not distinct from n.topic and o.deleted_at is not distinct from n.deleted_at
               and o.spam_at is not distinct from n.spam_at)
         )
         select c.workspace_id, array_agg(distinct (c.created_at at time zone w.timezone)::date) as days
         from changed c join workspaces w on w.id = c.workspace_id
         group by c.workspace_id
       loop
         perform facts_tickets_rebuild(r.workspace_id, r.days);
       end loop;
       return null;
     end $$`,
  // Postgres names both transition tables only where the event has both; insert and delete get an empty stand-in.
  `create function facts_tickets_inserted() returns trigger language plpgsql as $$
     declare r record;
     begin
       for r in
         select n.workspace_id, array_agg(distinct (n.created_at at time zone w.timezone)::date) as days
         from new_rows n join workspaces w on w.id = n.workspace_id group by n.workspace_id
       loop
         perform facts_tickets_rebuild(r.workspace_id, r.days);
       end loop;
       return null;
     end $$`,
  `create function facts_tickets_deleted() returns trigger language plpgsql as $$
     declare r record;
     begin
       for r in
         select o.workspace_id, array_agg(distinct (o.created_at at time zone w.timezone)::date) as days
         from old_rows o join workspaces w on w.id = o.workspace_id group by o.workspace_id
       loop
         perform facts_tickets_rebuild(r.workspace_id, r.days);
       end loop;
       return null;
     end $$`,
  `create trigger tickets_facts_insert after insert on tickets referencing new table as new_rows
     for each statement execute function facts_tickets_inserted()`,
  `create trigger tickets_facts_update after update on tickets referencing old table as old_rows
     new table as new_rows for each statement execute function facts_tickets_touched()`,
  `create trigger tickets_facts_delete after delete on tickets referencing old table as old_rows
     for each statement execute function facts_tickets_deleted()`,
  // Every workspace's tickets so far.
  `do $$ declare r record; begin
     for r in
       select t.workspace_id, array_agg(distinct (t.created_at at time zone w.timezone)::date) as days
       from tickets t join workspaces w on w.id = t.workspace_id group by t.workspace_id
     loop
       perform facts_tickets_rebuild(r.workspace_id, r.days);
     end loop;
   end $$`
)
