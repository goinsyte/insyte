import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { QualityStats } from "@insyte/modules/quality/domain/Quality"
import type { SupplierDetail, SupplierList, SupplierRow as ServerRow } from "@insyte/modules/suppliers/domain/Suppliers"
import { AreaEmpty } from "@insyte/ui/app/common/area-empty"
import type { SupplierQuality, SupplierRow, SuppliersSource } from "@insyte/ui/app/suppliers/source"
import { Mail, Pause } from "@insyte/ui/icons"
import { useNavigate } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useMemo } from "react"
import { CHATS, chatWrites } from "../data/chats.ts"
import { endpointsAtom } from "../data/developer.ts"
import { supplierStatsAtom } from "../data/quality.ts"
import { supplierAtom } from "../data/suppliers.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"
import { useRestock } from "../products/restock.ts"
import { ConsolePortalInviteDialog, ConsolePortalSection } from "./portal-access.tsx"
import { supplierOf } from "./supplier-of.ts"
import { useSupplierCommands } from "./supplier-writes.ts"

/*
 * The suppliers page's source in the console (M8.1): `Suppliers.list`'s rows as the design's, the dialog's products
 * with their units and stock level and its late orders from `Suppliers.get`, the portal's section and invite over the
 * supplier's access (M16). The quality columns are `Quality.stats{ bySupplier }` over the last 90 days, where the role
 * reads products. "{n} bijbestellen" files a restock ticket per low product (`products/restock.ts`) where the role may
 * open tickets; "Bericht aan" opens the shared channel with them (`Chats.openSupplierChannel`) where the role reads
 * chats, else it is a mail.
 */

const rowOf = (s: ServerRow): SupplierRow => ({
  supplier: supplierOf(s),
  ...s.stats,
  id: s.id,
  name: s.name,
  paused: s.pausedAt !== null,
  portal: s.portal
})

const HIDDEN = ["complaints", "checks"] as const
const NONE: ReadonlyArray<string> = []

const PORTAL = { Section: ConsolePortalSection, InviteDialog: ConsolePortalInviteDialog }

const standing = (rows: ReadonlyArray<SupplierRow>) => {
  const late = rows.reduce((n, r) => n + r.delayed, 0)
  const live = rows.filter((r) => r.supplier.stock_indicator === "live").length
  return `${rows.length} ${rows.length === 1 ? "leverancier" : "leveranciers"} · ${
    late === 0 ? "geen vertraging" : `${late} ${late === 1 ? "vertraagde bestelling" : "vertraagde bestellingen"}`
  } · ${live} met live voorraad`
}

const NO_DETAIL = Atom.make(AsyncResult.initial<SupplierDetail, never>())
const NO_LINES = { products: [], late: [] }
const NO_STATS = Atom.make(AsyncResult.initial<QualityStats, never>())

function useConsoleDetail(row: SupplierRow | null) {
  const result = useAtomValue(row === null ? NO_DETAIL : supplierAtom(row.id))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  return useMemo(
    () =>
      detail === undefined ? NO_LINES : {
        products: detail.products.map((p) => ({
          id: p.id,
          title: p.title,
          ...(p.available === null ? {} : { units: Math.max(0, p.available) }),
          ...(p.stock === null ? {} : { stock: p.stock })
        })),
        late: detail.delayedOrders
      },
    [detail]
  )
}

const Empty = ({ onCreate }: { onCreate?: (() => void) | undefined }) => (
  <AreaEmpty
    area="suppliers"
    body="Leveranciers komen uit Shopify, één per vendor van je producten. Een leverancier die Shopify niet kent, voeg je zelf toe."
    action={onCreate === undefined ? undefined : { label: "Nieuwe leverancier", onClick: onCreate }}
    source={null}
  />
)

/** Complaints and checks per supplier over the last 90 days; `undefined` where the role does not read products. */
function useSupplierQuality(): ReadonlyMap<string, SupplierQuality> | undefined {
  const reads = useGate("products", 1).ok
  const stats = Option.getOrUndefined(AsyncResult.value(useAtomValue(reads ? supplierStatsAtom : NO_STATS)))
  return useMemo(() => {
    if (stats === undefined) return undefined
    return new Map(stats.rows.map((r) => {
      const rate = r.sold > 0 ? r.complaints / r.sold : 0
      return [r.id, {
        rate,
        complaints: r.complaints,
        sold: r.sold,
        passed: r.passed,
        judged: r.judged,
        over: rate > stats.threshold
      }]
    }))
  }, [stats])
}

/** The page over `Suppliers.list`, with the commands the role may use. */
export function useConsoleSuppliersSource(list: SupplierList): SuppliersSource {
  const commands = useSupplierCommands()
  const edit = useGate("suppliers", 2)
  // Inviting to the portal and taking access away is Beheren, as the server holds it.
  const manage = useGate("suppliers", 3)
  const rows = useMemo(() => list.rows.map(rowOf), [list])
  const byId = useMemo(() => new Map(list.rows.map((r) => [r.id, r])), [list])
  // Where a supplier's API reports back: the API's own public host (the API keys page names it too).
  const endpoints = Option.getOrUndefined(AsyncResult.value(useAtomValue(endpointsAtom)))
  const hookBase = endpoints?.api?.replace(/\/v1$/, "") ?? ""
  const quality = useSupplierQuality()
  const restock = useRestock()
  const chats = useGate("support", 1)
  const openChannel = useAtomSet(chatWrites.openSupplierChannel, { mode: "promiseExit" })
  const navigate = useNavigate()
  return {
    rows,
    standing,
    hidden: quality === undefined ? HIDDEN : NONE,
    actions: [
      {
        id: "pause",
        needs: { perm: "suppliers", arg: 2 },
        label: "Nieuwe bestellingen pauzeren of hervatten",
        icon: Pause,
        group: "Bestellingen",
        shortcut: "p",
        bar: true,
        run: (picked) => void commands.pauseOrResume(picked)
      },
      {
        id: "email",
        label: "E-mailen",
        icon: Mail,
        group: "Contact",
        shortcut: "m",
        bar: true,
        applies: (r) => r.supplier.contact_email !== "",
        run: (picked) => {
          window.location.href = `mailto:?bcc=${
            encodeURIComponent(picked.map((r) => r.supplier.contact_email).filter(Boolean).join(","))
          }`
        }
      }
    ],
    qualityOf: (id) => quality?.get(id),
    pauseOrResume: (picked) => void commands.pauseOrResume(picked),
    useDetail: useConsoleDetail,
    prefOf: (id) => {
      const s = byId.get(id)
      return { via: s?.forwardChannel ?? "email", auto: s?.autoForward ?? false }
    },
    setPref: (row, patch, said) => void commands.setPref(row, patch, said),
    forwardGate: edit,
    api: {
      stateOf: (id) => byId.get(id)?.api ?? null,
      hookOf: (id) => `${hookBase}/hooks/supplier/${id}`,
      connect: (row, url) => commands.connectApi(row, url),
      test: (row) => commands.testConnection(row),
      disconnect: (row) => void commands.disconnectApi(row)
    },
    ...(restock === undefined ? {} : {
      restock: (row, low) => void restock(low.map((p) => p.id), { to: row.name })
    }),
    // The channel is made the first time it is opened, so the row names the supplier and opening makes it.
    chatOf: (row) => (chats.ok ? row.id : undefined),
    openChat: (supplierId) =>
      void openChannel({ payload: { supplierId }, reactivityKeys: [...CHATS] }).then((exit) => {
        if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), { gone: "Die leverancier bestaat niet meer" })
        void navigate({ to: "/chats", search: { id: exit.value.id } as never })
      }),
    statementsOf: (row) => `/suppliers/${row.id}/statements`,
    ...(manage.ok ? { portal: PORTAL } : {}),
    canCreate: edit,
    save: (input, row) => void commands.save(input, row),
    inputOf: (row) => {
      const s = byId.get(row.id)
      return {
        name: row.name,
        contactEmail: s?.contactEmail ?? "",
        contactPhone: s?.contactPhone ?? "",
        description: s?.description ?? "",
        leadDays: s?.defaultLeadDays ?? 2
      }
    },
    Empty
  }
}
