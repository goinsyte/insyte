import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  SupplierDashboard as ServerDashboard,
  SupplierMe,
  SupplierOrderDetail,
  SupplierOrderRow as ServerRow,
  SupplierProductDetail,
  SupplierProductRow as ServerProduct
} from "@insyte/modules/supplier-portal/domain/Portal"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import type { Currency } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { StockIndicator } from "@insyte/ui/app/stores/supplier-store"
import { downloadPackingSlips } from "@insyte/ui/app/supplier/packing-slip"
import {
  type PackingSlip,
  type Said,
  type ShipTo,
  type SupplierDashboardView,
  type SupplierOrderRow,
  type SupplierOrderView,
  type SupplierPerformance,
  SupplierPortalProvider,
  type SupplierPortalSource,
  type SupplierProductRow,
  type SupplierProductView
} from "@insyte/ui/app/supplier/source"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { type ReactNode, useMemo } from "react"
import { toast } from "sonner"
import {
  PORTAL,
  portalDashboardAtom,
  portalOrderAtom,
  portalOrdersAtom,
  portalProductAtom,
  portalProductsAtom,
  portalWrites
} from "../data/supplier-portal.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The supplier portal's screens in the console (M16 step 2): `SupplierPortal.*` as the design's source. Amounts come
 * in minor units and go out in whole ones; the hand-off is "Op tijd overgedragen", not delivered, since Insyte sees
 * the parcel leave and not arrive. What the server does not hold for a supplier yet (quality checks from the portal,
 * their photos and videos, the shared chat, the settings pages) is left out, not made up.
 */

const SCOPE: Record<string, string> = {
  orders: "bestellingen",
  stock: "voorraad bijwerken",
  statements: "afrekeningen",
  chat: "chat",
  media: "foto's en video's"
}

/** The portal's refusals in its own words; a part the brand did not open names the brand. */
const copyOf = (brand: string): RefusalCopy => ({
  gone: "Die bestelling is er niet meer",
  conflicts: {
    problem_open: ["Er staat al een probleem open", `${brand} kijkt ernaar; je hoort het zodra het is opgelost.`],
    live_needs_integration: ["Live voorraad kan nog niet", "Daarvoor moet eerst je API gekoppeld zijn."]
  },
  invalid: {
    newDate: "Kies een nieuwe datum.",
    note: "Schrijf erbij wat er is.",
    tracking: "Vul een trackingnummer in."
  },
  other: (tagged) => {
    if (tagged._tag !== "ScopeMissing") return false
    const scope = String(tagged["scope"])
    toast.error("Dat staat niet open voor je", {
      description: `${brand} heeft ${SCOPE[scope] ?? scope} niet voor je aangezet.`
    })
    return true
  }
})

const REPORTING: Record<ServerProduct["reporting"], StockIndicator> = {
  live: "live",
  in_or_out: "in_stock_out_of_stock",
  manual: "none"
}
const MODE: Record<StockIndicator, ServerProduct["reporting"]> = {
  live: "live",
  in_stock_out_of_stock: "in_or_out",
  none: "manual"
}

const iso = (ms: number) => new Date(ms).toISOString()
const week = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" })

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

export const rowOf = (r: ServerRow): SupplierOrderRow => ({
  id: r.id,
  number: r.number,
  lines: r.lines.map((l) => ({
    id: l.id,
    productId: l.productId,
    title: l.title,
    variantTitle: l.variantTitle,
    sku: l.sku ?? "",
    quantity: l.quantity
  })),
  units: r.units,
  status: r.status,
  due: r.due,
  handoff: new Date(r.handoffBy ?? r.placedAt),
  amount: r.amountMinor / 100,
  costMissing: r.costMissing,
  city: r.city,
  country: r.country
})

const shipToOf = (d: SupplierOrderDetail): ShipTo => ({
  name: d.shipTo.name,
  line1: d.shipTo.line1 ?? "",
  line2: d.shipTo.line2,
  postcode: d.shipTo.postcode ?? "",
  city: d.shipTo.city ?? "",
  country: d.shipTo.country ?? ""
})

const viewOf = (d: SupplierOrderDetail): SupplierOrderView => ({
  row: rowOf(d.row),
  placedAt: iso(d.row.placedAt),
  acceptedAt: d.acceptedAt === null ? undefined : iso(d.acceptedAt),
  problem: d.problem === null ? undefined : { kind: d.problem.kind, note: d.problem.note, at: iso(d.problem.at) },
  parcels: d.parcel === null
    ? []
    : [{
      id: `${d.row.id}:parcel`,
      carrier: d.parcel.carrier ?? "",
      tracking: d.parcel.tracking,
      at: iso(d.parcel.at)
    }],
  shippedAs: d.row.status === "shipped" && d.parcel === null ? { carrier: undefined, tracking: undefined } : undefined,
  shipTo: shipToOf(d),
  note: d.note ?? undefined
})

const slipOf = (d: SupplierOrderDetail): PackingSlip => ({
  number: d.row.number,
  shipTo: shipToOf(d),
  lines: rowOf(d.row).lines
})

const productRowOf = (p: ServerProduct): SupplierProductRow => ({
  id: p.id,
  title: p.title,
  image: p.image ?? undefined,
  variants: p.variants,
  units: p.units,
  stock: p.stock === "in_stock" ? "available" : p.stock,
  lead: p.leadDays,
  mode: REPORTING[p.reporting],
  open: p.openOrders,
  media: 0
})

const productOf = (d: SupplierProductDetail): SupplierProductView => ({
  row: productRowOf(d.row),
  images: d.images,
  variants: d.variants.map((v) => ({ id: v.id, title: v.title, sku: v.sku ?? "", stock: v.available })),
  waiting: d.waiting.map((w) => ({
    id: w.id,
    number: w.number,
    quantity: w.quantity,
    handoff: new Date(w.handoffBy ?? Date.now())
  }))
})

const performanceOf = (p: ServerDashboard["performance"]): SupplierPerformance => {
  const weeks = p.weeks.map((w) => ({
    label: week.format(new Date(`${w.end}T12:00:00Z`)),
    onTime: w.parcels === 0 ? 0 : Math.round(((w.parcels - w.late) / w.parcels) * 1000) / 10,
    n: w.parcels,
    late: w.late
  }))
  return {
    weeks,
    onTime30: p.onTime30dPct ?? 0,
    parcels30: p.parcels30d,
    lateBy: p.avgDaysLate ?? 0,
    measure: "Op tijd overgedragen",
    until: weeks.at(-1)?.label ?? ""
  }
}

const dashboardOf = (d: ServerDashboard): SupplierDashboardView => ({
  counts: { accept: d.figures.toAccept, today: d.figures.today, late: d.figures.late, problem: d.figures.problemsOpen },
  fresh: d.figures.totalOrders === 0,
  work: d.work.map(rowOf),
  low: d.lowStock.map((p) => ({ id: p.id, title: p.title, units: p.units })),
  performance: performanceOf(d.performance)
})

const EMPTY_DASHBOARD: SupplierDashboardView = {
  counts: { accept: 0, today: 0, late: 0, problem: 0 },
  fresh: false,
  work: [],
  low: [],
  performance: { weeks: [], onTime30: 0, parcels30: 0, lateBy: 0, measure: "Op tijd overgedragen", until: "" }
}

function useOrders(): ReadonlyArray<SupplierOrderRow> {
  const list = value(useAtomValue(portalOrdersAtom))
  return useMemo(() => list?.rows.map(rowOf) ?? [], [list])
}

function useOrder(id: string): SupplierOrderView | undefined {
  const detail = value(useAtomValue(portalOrderAtom(id)))
  return useMemo(() => (detail === undefined ? undefined : viewOf(detail)), [detail])
}

function useProducts(): ReadonlyArray<SupplierProductRow> {
  const list = value(useAtomValue(portalProductsAtom))
  return useMemo(() => list?.rows.map(productRowOf) ?? [], [list])
}

function useProduct(id: string): SupplierProductView | undefined {
  const detail = value(useAtomValue(portalProductAtom(id)))
  return useMemo(() => (detail === undefined ? undefined : productOf(detail)), [detail])
}

function useDashboard(): SupplierDashboardView {
  const dashboard = value(useAtomValue(portalDashboardAtom))
  return useMemo(() => (dashboard === undefined ? EMPTY_DASHBOARD : dashboardOf(dashboard)), [dashboard])
}

/** The portal's writes, each with "Ongedaan maken" spending its undo token. */
function useWrites(brand: string) {
  const refused = (error: unknown) => sayRefusal(error, copyOf(brand))
  const keys = { reactivityKeys: PORTAL }
  const write = {
    accept: useAtomSet(portalWrites.accept, { mode: "promiseExit" }),
    ship: useAtomSet(portalWrites.ship, { mode: "promiseExit" }),
    reportProblem: useAtomSet(portalWrites.reportProblem, { mode: "promiseExit" }),
    order: useAtomSet(portalWrites.order, { mode: "promiseExit" }),
    saveStock: useAtomSet(portalWrites.saveStock, { mode: "promiseExit" }),
    setReporting: useAtomSet(portalWrites.setReporting, { mode: "promiseExit" }),
    undo: useAtomSet(portalWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  const said = (exit: Exit.Exit<{ readonly undo: { readonly token: string } | null }, unknown>, words: Said) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const ticket = exit.value.undo
    if (ticket === null) return
    undoable(words.message, () => undo(ticket.token), words.description)
  }
  return { write, keys, said, refused }
}

/** The portal over `SupplierPortal.*`, for the contact `me` names. */
export function ConsoleSupplierPortal({ me, children }: { me: SupplierMe; children: ReactNode }) {
  const { write, keys, said, refused } = useWrites(me.workspace.name)
  const list = value(useAtomValue(portalOrdersAtom))
  const currency = (list?.rows[0]?.currency ?? "EUR") as Currency

  const source: SupplierPortalSource = {
    brand: me.workspace.name,
    brandLegal: me.workspace.name,
    firstName: me.contact.name.split(/\s+/)[0] ?? me.contact.name,
    money: (amount) => formatCurrency(amount, currency),
    useOrders,
    useOrder,
    useProducts,
    useProduct,
    useDashboard,
    accept: (rows, words) =>
      void write.accept({ payload: { orderIds: rows.map((r) => r.id) }, ...keys }).then((exit) => said(exit, words)),
    ship: (items, carrier, words) =>
      void write.ship({
        payload: {
          items: items.map(({ row, tracking }) => ({
            orderId: row.id,
            carrier: carrier as "PostNL",
            tracking
          }))
        },
        ...keys
      }).then((exit) => said(exit, words)),
    report: (row, problem, words) =>
      void write.reportProblem({
        payload: {
          orderId: row.id,
          kind: problem.kind,
          note: problem.note,
          ...(problem.newDate === undefined || problem.newDate === "" ? {} : { newDate: problem.newDate })
        },
        ...keys
      }).then((exit) => said(exit, words)),
    packingSlips: (rows) =>
      void Promise.all(rows.map((r) => write.order({ payload: { orderId: r.id } }))).then((exits) => {
        const slips = exits.flatMap((exit) => (Exit.isSuccess(exit) ? [slipOf(exit.value)] : []))
        if (slips.length > 0) downloadPackingSlips(slips, me.workspace.name)
        else refused(undefined)
      }),
    saveStock: (product, stock, lead, words) =>
      void write.saveStock({ payload: { productId: product.row.id, variantStock: stock, leadDays: lead }, ...keys })
        .then((exit) => said(exit, words)),
    setMode: (product, mode) =>
      void write.setReporting({ payload: { productId: product.id, mode: MODE[mode] }, ...keys }).then((exit) => {
        if (Exit.isFailure(exit)) refused(failureOf(exit))
      }),
    modeOff: (mode) => (mode === "live" ? "Live voorraad komt zodra je API gekoppeld is." : null),
    parts: { CheckWork: null, Checks: null, Media: null, Closing: null, chat: false, settings: false }
  }
  return <SupplierPortalProvider value={source}>{children}</SupplierPortalProvider>
}
