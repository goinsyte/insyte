import { tenantTable } from "@insyte/database/Tenancy"
import { statements } from "../statements.ts"

/*
 * Disputes by the day they were opened (M14 step 1, what Analyse and INSYTE() read; domain.md §10, ADR-0017,
 * widgets/02 §B "Geschillen" and Part C `chargebacks`): per workspace × day × store × reason × currency, how many cases
 * were opened, how many of those have since been won and lost, and the amount they opened with. The day is the
 * store's (the workspace's for a case opened by hand without a store, which is the whole team's, as on Chargebacks).
 * Won and lost count by the day the case was opened, as the order facts count a refund on the order's day.
 *
 * A case may have no store, so its day is not one `fact_dirty_days` can hold: a statement trigger on `chargebacks`
 * recomputes the days a write touched inline, from the rows, as the ticket facts are kept. Cases are few per day, so
 * the recompute is a small read in the writer's transaction. A store's days are rebuilt with its orders' too: the
 * facts' drain recomputes disputes for every store-day it takes, so the nightly pass, a full rebuild and a store whose
 * timezone changed (its dispute days marked here) bring them in line like every other fact. A workspace whose
 * timezone changed moves what counts on its days (the cases without a store, the tickets, the stores without a zone of
 * their own) onto the new ones. One workspace's recomputes, disputes and tickets alike, take turns.
 */
export default statements(
  // The recompute's and the rebuild's range over a workspace's cases.
  "create index chargebacks_opened on chargebacks (workspace_id, opened_at)",
  `create table fact_disputes_day (
     workspace_id text not null references workspaces(id) on delete cascade,
     day          date not null,
     store_id     text references stores(id) on delete cascade,
     reason       text not null,
     currency     text not null,
     opened       integer not null default 0,
     won          integer not null default 0,
     lost         integer not null default 0,
     amount_minor bigint not null default 0
   )`,
  `create unique index fact_disputes_day_grain on fact_disputes_day (workspace_id, day, store_id, reason, currency)
     nulls not distinct`,
  "create index fact_disputes_day_range on fact_disputes_day (workspace_id, day)",
  tenantTable("fact_disputes_day", { membersOnly: true }),
  // One workspace's store-days recomputed from its cases (`stores` aligned with `days`, null for the cases without a
  // store; a pair may come more than once). As `system`, so whoever wrote the case keeps its facts true. Two writers
  // recomputing the same day would each delete, then each insert, and the second insert would fail on the grain: one
  // workspace's recomputes take turns, the later one reading the earlier one's committed cases.
  `create function facts_disputes_rebuild(ws text, stores text[], days date[]) returns void
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       if ws is null or days is null or cardinality(days) = 0 then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       perform pg_advisory_xact_lock(hashtext('facts_disputes'), hashtext(ws));
       delete from fact_disputes_day f
       using (select distinct coalesce(x.store_id, '') as store_key, x.day
              from unnest(stores, days) as x(store_id, day)) p
       where f.workspace_id = ws and coalesce(f.store_id, '') = p.store_key and f.day = p.day;
       insert into fact_disputes_day (workspace_id, day, store_id, reason, currency, opened, won, lost, amount_minor)
       select c.workspace_id, z.day, c.store_id, c.reason, btrim(c.currency), count(*),
              count(*) filter (where c.status = 'won'), count(*) filter (where c.status = 'lost'),
              sum(c.amount_minor)
       from chargebacks c
       join workspaces w on w.id = c.workspace_id
       left join stores s on s.id = c.store_id
       cross join lateral (select (c.opened_at at time zone coalesce(s.timezone, w.timezone))::date as day) z
       join (select distinct coalesce(x.store_id, '') as store_key, x.day
             from unnest(stores, days) as x(store_id, day)) p
         on p.store_key = coalesce(c.store_id, '') and p.day = z.day
       where c.workspace_id = ws
         and c.opened_at >= ((select min(d) from unnest(days) d) - 2)::timestamptz
         and c.opened_at < ((select max(d) from unnest(days) d) + 3)::timestamptz
       group by c.workspace_id, z.day, c.store_id, c.reason, btrim(c.currency);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function facts_disputes_rebuild(text, text[], date[]) from public",
  "grant execute on function facts_disputes_rebuild(text, text[], date[]) to insyte_app",
  // The store-days the changed cases were opened on, before and after; an update that touches nothing a figure reads
  // (a note, the evidence, a reminder) recomputes nothing.
  `create function facts_disputes_touched() returns trigger language plpgsql as $$
     declare r record;
     begin
       for r in
         with changed as (
           select n.workspace_id, n.store_id, n.opened_at from new_rows n
           where not exists (
             select 1 from old_rows o where o.id = n.id
               and o.opened_at = n.opened_at and o.status = n.status and o.reason = n.reason
               and o.amount_minor = n.amount_minor and o.currency = n.currency
               and o.store_id is not distinct from n.store_id)
           union all
           select o.workspace_id, o.store_id, o.opened_at from old_rows o
           where not exists (
             select 1 from new_rows n where n.id = o.id
               and o.opened_at = n.opened_at and o.status = n.status and o.reason = n.reason
               and o.amount_minor = n.amount_minor and o.currency = n.currency
               and o.store_id is not distinct from n.store_id)
         )
         select c.workspace_id, array_agg(c.store_id) as stores,
                array_agg((c.opened_at at time zone coalesce(s.timezone, w.timezone))::date) as days
         from changed c join workspaces w on w.id = c.workspace_id left join stores s on s.id = c.store_id
         group by c.workspace_id
       loop
         perform facts_disputes_rebuild(r.workspace_id, r.stores, r.days);
       end loop;
       return null;
     end $$`,
  // Postgres names both transition tables only where the event has both; insert and delete get their own.
  `create function facts_disputes_inserted() returns trigger language plpgsql as $$
     declare r record;
     begin
       for r in
         select n.workspace_id, array_agg(n.store_id) as stores,
                array_agg((n.opened_at at time zone coalesce(s.timezone, w.timezone))::date) as days
         from new_rows n join workspaces w on w.id = n.workspace_id left join stores s on s.id = n.store_id
         group by n.workspace_id
       loop
         perform facts_disputes_rebuild(r.workspace_id, r.stores, r.days);
       end loop;
       return null;
     end $$`,
  `create function facts_disputes_deleted() returns trigger language plpgsql as $$
     declare r record;
     begin
       for r in
         select o.workspace_id, array_agg(o.store_id) as stores,
                array_agg((o.opened_at at time zone coalesce(s.timezone, w.timezone))::date) as days
         from old_rows o join workspaces w on w.id = o.workspace_id left join stores s on s.id = o.store_id
         group by o.workspace_id
       loop
         perform facts_disputes_rebuild(r.workspace_id, r.stores, r.days);
       end loop;
       return null;
     end $$`,
  `create trigger chargebacks_facts_insert after insert on chargebacks referencing new table as new_rows
     for each statement execute function facts_disputes_inserted()`,
  `create trigger chargebacks_facts_update after update on chargebacks referencing old table as old_rows
     new table as new_rows for each statement execute function facts_disputes_touched()`,
  `create trigger chargebacks_facts_delete after delete on chargebacks referencing old table as old_rows
     for each statement execute function facts_disputes_deleted()`,
  // The ticket facts' recompute (0064) had the same race: the same turns, per workspace.
  `create or replace function facts_tickets_rebuild(ws text, days date[]) returns void
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true); tz text;
     begin
       if ws is null or days is null or cardinality(days) = 0 then return; end if;
       perform set_config('app.principal_kind', 'system', true);
       perform pg_advisory_xact_lock(hashtext('facts_tickets'), hashtext(ws));
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
  // A store that counts on other days: the days its facts are on now are marked, and the days its orders and cases
  // fall on in its zone now; the drain recomputes both.
  `create function facts_store_rezone(ws text, store text) returns void language plpgsql as $$
     declare stores text[]; ats timestamptz[];
     begin
       insert into fact_dirty_days (workspace_id, store_id, day)
       select ws, store, f.day from (
         select day from fact_orders_day where store_id = store
         union select day from fact_refunds_day where store_id = store
         union select day from fact_deliveries_day where store_id = store
         union select day from fact_disputes_day where store_id = store
       ) f
       on conflict (store_id, day) do nothing;
       perform facts_mark(array(select id from orders where store_id = store),
                          array(select null::timestamptz from orders where store_id = store));
       select array_agg(c.store_id), array_agg(c.opened_at) into stores, ats from chargebacks c
       where c.store_id = store;
       perform facts_mark_days(stores, ats);
     end $$`,
  `create or replace function facts_store_timezone() returns trigger language plpgsql as $$
     begin
       perform facts_store_rezone(new.workspace_id, new.id);
       return null;
     end $$`,
  // A workspace whose timezone changed: what counts on its days moves to the new ones. Its stores without a zone of
  // their own are rezoned as above; the cases without a store and the tickets (always the workspace's days) are
  // recomputed here, on the days their facts are on now and the days they fall on now. As `system`, as the recomputes.
  `create function facts_workspace_timezone() returns trigger
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true); s record; days date[];
     begin
       perform set_config('app.principal_kind', 'system', true);
       for s in select id from stores where workspace_id = new.id and timezone is null loop
         perform facts_store_rezone(new.id, s.id);
       end loop;
       select array_agg(x.day) into days from (
         select day from fact_disputes_day where workspace_id = new.id and store_id is null
         union select (c.opened_at at time zone new.timezone)::date from chargebacks c
               where c.workspace_id = new.id and c.store_id is null
       ) x(day);
       perform facts_disputes_rebuild(new.id, array(select null::text from unnest(days)), days);
       select array_agg(x.day) into days from (
         select day from fact_tickets_day where workspace_id = new.id
         union select (t.created_at at time zone new.timezone)::date from tickets t where t.workspace_id = new.id
       ) x(day);
       perform facts_tickets_rebuild(new.id, days);
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
       return null;
     end $$`,
  "revoke all on function facts_workspace_timezone() from public",
  `create trigger workspaces_facts_timezone after update of timezone on workspaces
     for each row when (old.timezone is distinct from new.timezone) execute function facts_workspace_timezone()`,
  // Every workspace's cases so far.
  `do $$ declare r record; begin
     for r in
       select c.workspace_id, array_agg(c.store_id) as stores,
              array_agg((c.opened_at at time zone coalesce(s.timezone, w.timezone))::date) as days
       from chargebacks c join workspaces w on w.id = c.workspace_id left join stores s on s.id = c.store_id
       group by c.workspace_id
     loop
       perform facts_disputes_rebuild(r.workspace_id, r.stores, r.days);
     end loop;
   end $$`
)
