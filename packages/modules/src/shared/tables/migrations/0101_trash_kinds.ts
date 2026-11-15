import { statements } from "../statements.ts"

/*
 * More kinds in the Prullenbak (W11.4; widgets/05 §7.8): automations, sheets (Rekenbladen), courses, webhook endpoints
 * and cost lines join tickets in `trash_items_v`. Each already soft-deletes (`deleted_at`) and kept its removed rows
 * for ever; from now on they are listed for 30 days, put back through their own slice, and purged by the daily sweep.
 *
 * - The view gains `owner_id`: the one member who alone sees the item (a sheet is its owner's; shares are not enough to
 *   see a removed one), null for an item the kind's area decides. A `create or replace view` may only add columns at
 *   the end, so it is the last.
 * - `title`: what the page shows. A course may have none yet (the console says "Naamloze cursus"); a webhook endpoint
 *   is its description, else its URL's host only, since a path or query can hold a token.
 * - Each new table gets the partial index the view and the sweep read, and the routing read `trash_due_workspaces()`
 *   needs (as `tickets_routing` in 0060).
 *
 * A kind that lands later (the Kennisbank's items, reply templates) is one more `select` with these nine columns in a
 * migration of its own: `create or replace view trash_items_v ... ${trashView([...KINDS, its select])}`, its index and
 * routing read, and its entry in `TRASH_KINDS` (`trash/domain/Trash.ts`) and `TrashKindsLive`. `KINDS` and `trashView`
 * are exported for that and never change here.
 */

/** Each kind's rows in the trash: workspace, kind, id, title, store, owner, when, audit subject and action. */
export const KINDS: ReadonlyArray<string> = [
  `select workspace_id, 'ticket'::text as kind, id, title, store_id, null::text as owner_id, deleted_at,
          'ticket'::text as subject_type, 'ticket.trash'::text as trashed_by
   from tickets where deleted_at is not null`,
  `select workspace_id, 'automation'::text, id, name, null::text, null::text, deleted_at,
          'automation'::text, 'automation.removed'::text
   from automations where deleted_at is not null`,
  `select workspace_id, 'sheet'::text, id, title, null::text, owner_member_id, deleted_at,
          'sheet'::text, 'sheets.remove'::text
   from sheets where deleted_at is not null`,
  `select workspace_id, 'course'::text, id, title, null::text, null::text, deleted_at,
          'course'::text, 'course.removed'::text
   from courses where deleted_at is not null`,
  `select workspace_id, 'webhook'::text, id,
          coalesce(nullif(btrim(description), ''), substring(url from '^https://([^/?#]+)'), 'https'),
          null::text, null::text, deleted_at, 'webhook_endpoint'::text, 'webhook.removed'::text
   from webhook_endpoints where deleted_at is not null`,
  `select workspace_id, 'cost_line'::text, id, name, null::text, null::text, deleted_at,
          'cost_line'::text, 'cost_line.removed'::text
   from cost_lines where deleted_at is not null`
]

/** The view's body over `kinds`: who put each item in the trash is the newest audit line of its `trashed_by`. */
export const trashView = (kinds: ReadonlyArray<string>) =>
  `select i.workspace_id, i.kind, i.id, i.title, i.store_id, i.deleted_at,
          i.deleted_at + interval '30 days' as purge_at,
          d.actor_kind as deleted_by_kind, d.actor_id as deleted_by_id, i.owner_id
   from (${kinds.join(" union all ")}) i
   left join lateral (
     select a.actor_kind, a.actor_id from audit_events a
     where a.workspace_id = i.workspace_id and a.subject_type = i.subject_type and a.subject_id = i.id
       and a.action = i.trashed_by
     order by a.at desc limit 1
   ) d on true`

const TABLES = ["automations", "sheets", "courses", "webhook_endpoints", "cost_lines"] as const

export default statements(
  ...TABLES.map((t) => `create index ${t}_trash on ${t} (workspace_id, deleted_at) where deleted_at is not null`),
  ...TABLES.map((t) => `create policy ${t}_routing on ${t} as permissive for select to insyte_owner using (true)`),
  `create or replace view trash_items_v with (security_invoker = true) as ${trashView(KINDS)}`
)
