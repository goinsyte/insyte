import { Db } from "@insyte/database/Db"
import { fieldsOf } from "@insyte/domain/automations/Fields"
import { type Flow, validate } from "@insyte/domain/automations/Graph"
import { NotFound } from "@insyte/domain/Errors"
import * as Policy from "@insyte/domain/Policy"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import {
  AutomationCounts,
  AutomationDetail,
  AutomationList,
  AutomationRow,
  AutomationSettings,
  type AutomationStatus,
  AutomationVersion,
  type ListInput,
  Recommendation,
  TriggerFieldRow
} from "../domain/Automations.ts"

/*
 * Reading automations (M12 step 1; api.md §2.14): the list with its counts, one flow with its versions and settings,
 * the fields a trigger offers, and the templates the workspace's records say would have work to do. Automatiseringen ·
 * Bekijken reads them all. The step lists are read as text and parsed here, so the client's name transform leaves the
 * config's own keys (`title_override`) as they are.
 */

interface RawRow {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly status: AutomationStatus
  readonly liveVersion: number
  readonly draftJson: string
  readonly liveJson: string | null
  readonly ownerId: string | null
  readonly ownerName: string | null
  readonly runsTotal: string
  readonly template: string | null
  readonly draftSavedAt: Date
  readonly createdAt: Date
}

const SELECT = (sql: SqlClient.SqlClient) =>
  sql`
    select a.id, a.name, a.description, a.status, a.live_version, a.draft_nodes::text as draft_json,
           v.nodes::text as live_json, a.owner_member_id as owner_id, u.name as owner_name, a.runs_total, a.template,
           a.draft_saved_at, a.created_at
    from automations a
    left join automation_versions v on v.automation_id = a.id and v.version = a.live_version
    left join members m on m.id = a.owner_member_id
    left join auth."user" u on u.id = m.user_id`

const parse = (json: string) => JSON.parse(json) as Flow

const rowOf = (r: RawRow) =>
  new AutomationRow({
    id: r.id,
    name: r.name,
    description: r.description,
    status: r.status,
    liveVersion: r.liveVersion,
    nodes: parse(r.draftJson),
    dirty: r.liveJson === null ? true : JSON.stringify(parse(r.liveJson)) !== JSON.stringify(parse(r.draftJson)),
    owner: r.ownerId === null ? null : { id: r.ownerId, name: r.ownerName ?? "" },
    runsTotal: Number(r.runsTotal),
    template: r.template,
    savedAt: r.draftSavedAt.getTime(),
    createdAt: r.createdAt.getTime()
  })

/** One flow's row, removed ones only when asked (Undo of a removal reads it back). */
export const rowOf1 = Effect.fn("Automations.row")(function*(sql: SqlClient.SqlClient, id: string) {
  const [r] = yield* sql<RawRow>`${SELECT(sql)} where a.id = ${id} and a.deleted_at is null`
  if (r === undefined) return yield* new NotFound({ entity: "automation", id })
  return { row: rowOf(r), liveNodes: r.liveJson === null ? null : parse(r.liveJson) }
})

/** The connected services, by the brand ids the step catalogue uses. */
export const connectedBrands = Effect.fn("Automations.connected")(function*(sql: SqlClient.SqlClient) {
  const rows = yield* sql<{ brand: string }>`
    select 'shopify' as brand where exists (select 1 from stores where status = 'connected')
    union select provider from connections where status = 'connected'
    union select provider from mailboxes where status = 'connected' and provider in ('gmail', 'outlook')`
  return rows.map((r) => r.brand).sort()
})

export const settingsOf = Effect.fn("Automations.settingsOf")(function*(sql: SqlClient.SqlClient, id: string) {
  const [s] = yield* sql<{
    scopesOff: Array<string>
    scopesExtra: Array<string>
    notifyMemberId: string | null
    notifyName: string | null
    rateLimitPerHour: number
  }>`
    select s.scopes_off, s.scopes_extra, s.notify_member_id, u.name as notify_name, s.rate_limit_per_hour
    from automation_settings s
    left join members m on m.id = s.notify_member_id
    left join auth."user" u on u.id = m.user_id
    where s.automation_id = ${id}`
  return new AutomationSettings({
    scopesOff: s?.scopesOff ?? [],
    scopesExtra: s?.scopesExtra ?? [],
    notify: s?.notifyMemberId == null ? null : { id: s.notifyMemberId, name: s.notifyName ?? "" },
    rateLimit: (s?.rateLimitPerHour ?? 0) as AutomationSettings["rateLimit"]
  })
})

export const versionsOf = Effect.fn("Automations.versionsOf")(function*(sql: SqlClient.SqlClient, id: string) {
  const rows = yield* sql<{
    version: number
    note: string
    publishedBy: string
    byName: string | null
    publishedAt: Date
    nodesJson: string
    scopesRequired: Array<string>
  }>`
    select v.version, v.note, v.published_by, u.name as by_name, v.published_at, v.nodes::text as nodes_json,
           v.scopes_required
    from automation_versions v
    left join members m on m.id = v.published_by
    left join auth."user" u on u.id = m.user_id
    where v.automation_id = ${id}
    order by v.version desc`
  return rows.map((v) =>
    new AutomationVersion({
      version: v.version,
      note: v.note,
      by: v.byName === null ? null : { id: v.publishedBy, name: v.byName },
      at: v.publishedAt.getTime(),
      nodes: parse(v.nodesJson),
      scopesRequired: v.scopesRequired
    })
  )
})

/** One flow as the builder opens it. */
export const detailOf = Effect.fn("Automations.detailOf")(function*(sql: SqlClient.SqlClient, id: string) {
  const { liveNodes, row } = yield* rowOf1(sql, id)
  const settings = yield* settingsOf(sql, id)
  const connected = yield* connectedBrands(sql)
  return new AutomationDetail({
    automation: row,
    liveNodes,
    settings,
    versions: yield* versionsOf(sql, id),
    issues: validate(row.nodes, { scopesOff: settings.scopesOff, connected: new Set(connected), selfId: id }),
    connected
  })
})

export const list = Effect.fn("Automations.list")(function*(input: typeof ListInput.Type) {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const rows = yield* sql<RawRow>`
        ${SELECT(sql)}
        where a.deleted_at is null and ${input.status === undefined ? sql`true` : sql`a.status = ${input.status}`}
        order by a.created_at desc, a.id`
      const [c] = yield* sql<{ all: string; active: string; paused: string; draft: string }>`
        select count(*) as all, count(*) filter (where status = 'active') as active,
               count(*) filter (where status = 'paused') as paused, count(*) filter (where status = 'draft') as draft
        from automations where deleted_at is null`
      return new AutomationList({
        rows: rows.map(rowOf),
        counts: new AutomationCounts({
          all: Number(c?.all ?? 0),
          active: Number(c?.active ?? 0),
          paused: Number(c?.paused ?? 0),
          draft: Number(c?.draft ?? 0)
        })
      })
    })
  )
})

export const get = Effect.fn("Automations.get")(function*(id: string) {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) => detailOf(sql, id))
})

export const versions = Effect.fn("Automations.versions")(function*(id: string) {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      yield* rowOf1(sql, id)
      return yield* versionsOf(sql, id)
    })
  )
})

/** "Velden invoegen": what a flow started by this trigger can reference. */
export const fields = Effect.fn("Automations.fields")(function*(triggerVariant: string) {
  yield* Policy.require("automations", 1)
  return fieldsOf(triggerVariant).map((f) => new TriggerFieldRow(f))
})

const num = (v: string | undefined) => Number(v ?? 0)

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`

/**
 * "Aanbevolen" (widgets/05 §1.2): the templates whose trigger has work in the workspace's own records now, inside the
 * role's stores, with the count and the line the library shows. Rules, not a model: shipped orders, delayed ones,
 * customers who spent over €1.000, active products out of stock. Chargebacks have no table yet (M13). A template the
 * workspace already has a flow from is left out.
 */
export const recommended = Effect.fn("Automations.recommended")(function*() {
  yield* Policy.require("automations", 1)
  const db = yield* Db
  return yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const orders = yield* inScope(sql, "o.store_id")
      const customers = yield* inScope(sql, "c.store_id")
      const stock = yield* inScope(sql, "s.store_id")
      const [c] = yield* sql<{ shipped: string; late: string; vip: string; low: string }>`
        select
          (select count(*) from orders o where o.status = 'shipped' and ${orders}) as shipped,
          (select count(*) from orders o where o.delayed_at is not null
             and o.status not in ('delivered', 'cancelled', 'refunded') and ${orders}) as late,
          (select count(*) from customers c where c.lifetime_value_minor > 100000 and ${customers}) as vip,
          (select count(distinct s.product_id) from stockouts s join products p on p.id = s.product_id
             where s.to_at is null and p.status = 'active' and ${stock}) as low`
      const used = new Set(
        (yield* sql<{ template: string }>`
          select distinct template from automations where template is not null and deleted_at is null`).map((r) =>
          r.template
        )
      )
      const all = [
        {
          templateId: "tpl_shipped",
          count: num(c?.shipped),
          line: (k: number) => `${plural(k, "bestelling is", "bestellingen zijn")} nu onderweg.`
        },
        {
          templateId: "tpl_late",
          count: num(c?.late),
          line: (k: number) =>
            `${plural(k, "bestelling staat", "bestellingen staan")} op Vertraagd en ${
              k === 1 ? "wacht" : "wachten"
            } op iemand.`
        },
        {
          templateId: "tpl_vip",
          count: num(c?.vip),
          line: (k: number) => `${plural(k, "klant heeft", "klanten hebben")} meer dan €1.000 uitgegeven.`
        },
        {
          templateId: "tpl_stock",
          count: num(c?.low),
          line: (k: number) => `${plural(k, "actief product is", "actieve producten zijn")} uitverkocht.`
        }
      ]
      return all
        .filter((r) => r.count > 0 && !used.has(r.templateId))
        .sort((a, b) => b.count - a.count)
        .map((r) => new Recommendation({ templateId: r.templateId, count: r.count, line: r.line(r.count) }))
    })
  )
})
