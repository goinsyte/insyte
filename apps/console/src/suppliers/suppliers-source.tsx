import { useAtomValue } from "@effect/atom-react"
import type { SupplierDetail, SupplierList, SupplierRow as ServerRow } from "@insyte/modules/suppliers/domain/Suppliers"
import { AreaEmpty } from "@insyte/ui/app/common/area-empty"
import type { SupplierRow, SuppliersSource } from "@insyte/ui/app/suppliers/source"
import { Mail, Pause } from "@insyte/ui/icons"
import { Option } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { useMemo } from "react"
import { endpointsAtom } from "../data/developer.ts"
import { supplierAtom } from "../data/suppliers.ts"
import { useGate } from "../frame/refusals.ts"
import { ConsolePortalInviteDialog, ConsolePortalSection } from "./portal-access.tsx"
import { supplierOf } from "./supplier-of.ts"
import { useSupplierCommands } from "./supplier-writes.ts"

/*
 * The suppliers page's source in the console (M8.1): `Suppliers.list`'s rows as the design's, the dialog's products and
 * late orders from `Suppliers.get`, the portal's section and invite over the supplier's access (M16). What the server
 * does not hold yet is left out, not made up: the quality columns (M9), the products' stock (until inventory per location is mirrored), restocking (tickets, M11) and
 * a shared chat (M11), so "Bericht aan" is a mail.
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

function useConsoleDetail(row: SupplierRow | null) {
  const result = useAtomValue(row === null ? NO_DETAIL : supplierAtom(row.id))
  const detail = Option.getOrUndefined(AsyncResult.value(result))
  return useMemo(
    () =>
      detail === undefined ? NO_LINES : {
        products: detail.products.map((p) => ({ id: p.id, title: p.title })),
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
  return {
    rows,
    standing,
    hidden: HIDDEN,
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
    qualityOf: () => undefined,
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
    chatOf: () => undefined,
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
