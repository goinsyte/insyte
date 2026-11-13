import { Db } from "@insyte/database/Db"
import * as Policy from "@insyte/domain/Policy"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { COUNTED_PAYMENT, UNCOUNTED_STATUS } from "@insyte/domain/Revenue"
import { Effect } from "effect"
import { inScope } from "../../shared/use-cases/StoreScope.ts"
import { LiveSnapshot, type LiveTab, type PixelState } from "../domain/Live.ts"
import { LiveRooms } from "../domain/Ports.ts"

/*
 * `/live` (M14 step 3), at Analyse Bekijken: the room's visitors and events, narrowed to the principal's stores
 * (`storeScope`: the role's narrowed by the member's own), beside what the orders say (the sales of the last hour, the
 * count of the last ten minutes, revenue today). Revenue is Start's: counted orders, each converted at its day's
 * `fx_rates` row into the workspace currency, "today" in each store's own timezone. A tab takes the room's frames with
 * a lease it renews while the page is open and not paused.
 */

/** How long a subscription holds without a renewal; the console renews at half of it. */
export const LEASE_SECONDS = 60

const COUNTED = `(not o.is_draft and o.status not in ('${UNCOUNTED_STATUS.join("', '")}')
                  and o.payment_status in ('${COUNTED_PAYMENT.join("', '")}'))`

/** Placed orders since `since`, each with its store's today and the rate into the workspace currency. */
const ORDERS = `
  select o.id, o.number, o.total_minor, o.currency, o.placed_at, o.store_id,
         o.shipping_address ->> 'city' as city, o.shipping_address ->> 'country' as country,
         ${COUNTED} as counted,
         (o.placed_at at time zone z.tz)::date = (now() at time zone z.tz)::date as today,
         case when o.currency = w.currency then 1::numeric else fx.rate end as rate
  from orders o
  join stores s on s.id = o.store_id
  join workspaces w on w.id = o.workspace_id
  cross join lateral (select coalesce(s.timezone, w.timezone) as tz) z
  left join lateral (
    select f.rate from fx_rates f
    where o.currency <> w.currency and f.base = o.currency and f.quote = w.currency
      and f.day <= (o.placed_at at time zone z.tz)::date
    order by f.day desc limit 1) fx on true
  where not o.is_draft and o.placed_at > now() - interval '26 hours'`

export const snapshot = Effect.fn("Live.snapshot")(function*() {
  yield* Policy.require("analytics", 1)
  const principal = yield* CurrentPrincipal
  const db = yield* Db
  const read = yield* db.scoped((sql) =>
    Effect.gen(function*() {
      const scope = yield* inScope(sql, "s.id")
      const orderScope = yield* inScope(sql, "o.store_id")
      const stores = yield* sql<{ id: string; name: string; pixel: boolean }>`
        select s.id, s.name, (p.installed_at is not null) as pixel
        from stores s left join store_pixels p on p.store_id = s.id
        where s.status = 'connected' and ${scope}
        order by s.created_at`
      const [ws] = yield* sql<{ currency: string }>`select currency from workspaces where id = app_workspace_id()`
      const orders = yield* sql<{
        id: string
        number: string
        totalMinor: string
        placedAt: Date
        city: string | null
        country: string | null
        counted: boolean
        today: boolean
        rate: string | null
      }>`select * from (${sql.literal(ORDERS)}) o where ${orderScope} order by o.placed_at desc`
      return { stores, currency: ws?.currency ?? "EUR", orders }
    })
  )
  const now = Date.now()
  const converted = (o: (typeof read.orders)[number]) =>
    o.rate === null ? null : Math.round(Number(o.totalMinor) * Number(o.rate))
  const counted = read.orders.filter((o) => o.counted)
  const today = counted.filter((o) => o.today)
  const live = read.stores.filter((s) => s.pixel)
  const pixel: PixelState = read.stores.length === 0 ? "no_store" : live.length === 0 ? "not_installed" : "installed"

  const room = live.length === 0 ? { visitors: [], events: [] } : yield* (yield* LiveRooms).snapshot(
    principal.workspaceId
  )
  const seen = new Set(live.map((s) => s.id))
  return new LiveSnapshot({
    pixel,
    stores: live.map((s) => ({ id: s.id, name: s.name })),
    visitors: room.visitors.filter((v) => seen.has(v.storeId)),
    events: room.events.filter((e) => seen.has(e.visitor.storeId)),
    sales: counted.filter((o) => now - o.placedAt.getTime() < 3_600_000).slice(0, 20).map((o) => ({
      orderId: o.id,
      number: o.number,
      totalMinor: converted(o),
      city: o.city,
      country: o.country,
      at: o.placedAt.getTime()
    })),
    boughtLast10m: counted.filter((o) => now - o.placedAt.getTime() < 600_000).length,
    revenueToday: {
      minor: today.reduce((n, o) => n + (converted(o) ?? 0), 0),
      currency: read.currency,
      unconverted: today.filter((o) => o.rate === null).length
    },
    at: now
  })
})

export const subscribe = Effect.fn("Live.subscribe")(function*(input: LiveTab) {
  yield* Policy.require("analytics", 1)
  const principal = yield* CurrentPrincipal
  yield* (yield* LiveRooms).subscribe({
    workspaceId: principal.workspaceId,
    tab: input.tab,
    memberId: principal.id,
    // The room filters each tab's frames by these: the member's fence, not the role's alone.
    stores: principal.storeScope === null ? "all" : [...principal.storeScope],
    seconds: LEASE_SECONDS
  })
  return { leaseSeconds: LEASE_SECONDS }
})

export const unsubscribe = Effect.fn("Live.unsubscribe")(function*(input: LiveTab) {
  yield* Policy.require("analytics", 1)
  const principal = yield* CurrentPrincipal
  yield* (yield* LiveRooms).unsubscribe(principal.workspaceId, input.tab)
})
