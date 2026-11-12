import { statements } from "../statements.ts"

/*
 * The Prullenbak (M17 step 20.1a; domain.md §16.1): `trash_items_v`, one row per soft-deleted record a slice keeps,
 * whatever its table. Each kind is one `select` below, naming its row's workspace, id, title, store (null where the kind
 * has none) and the audit action that put it in the trash; who did that is the newest such audit line's actor, so no
 * table needs a `deleted_by` of its own. An item stays 30 days after it was deleted (`TRASH_DAYS`), then the daily
 * sweep purges it. A kind that lands later (automations, sheets, reply templates, courses) is one more `select` in a
 * `create or replace view` of its own migration, and one entry in `TrashKinds`.
 *
 * - `security_invoker`, so a read through the view is a read of each table under its own policies: the workspace's
 *   rows only, members only.
 * - `trash_due_workspaces()`: the workspaces holding an item past its 30 days, for the sweep, ids only. A
 *   security-definer function runs as `insyte_owner`, which sees no workspace's rows through the `_ws` policies, hence
 *   the routing read on `tickets` beside it.
 */

const KINDS = [
  `select workspace_id, 'ticket'::text as kind, id, title, store_id, deleted_at, 'ticket'::text as subject_type,
          'ticket.trash'::text as trashed_by
   from tickets where deleted_at is not null`
]

export default statements(
  "create index tickets_trash on tickets (workspace_id, deleted_at) where deleted_at is not null",
  `create view trash_items_v with (security_invoker = true) as
     select i.workspace_id, i.kind, i.id, i.title, i.store_id, i.deleted_at,
            i.deleted_at + interval '30 days' as purge_at,
            d.actor_kind as deleted_by_kind, d.actor_id as deleted_by_id
     from (${KINDS.join(" union all ")}) i
     left join lateral (
       select a.actor_kind, a.actor_id from audit_events a
       where a.workspace_id = i.workspace_id and a.subject_type = i.subject_type and a.subject_id = i.id
         and a.action = i.trashed_by
       order by a.at desc limit 1
     ) d on true`,
  "create policy tickets_routing on tickets as permissive for select to insyte_owner using (true)",
  `create function trash_due_workspaces() returns table (workspace_id text)
     language plpgsql security definer set search_path = public as $$
     declare prior text := current_setting('app.principal_kind', true);
     begin
       perform set_config('app.principal_kind', 'system', true);
       return query select distinct t.workspace_id from trash_items_v t where t.purge_at <= now();
       perform set_config('app.principal_kind', coalesce(prior, ''), true);
     end $$`,
  "revoke all on function trash_due_workspaces() from public",
  "grant execute on function trash_due_workspaces() to insyte_app"
)
