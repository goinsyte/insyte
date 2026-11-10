import { useAtomValue } from "@effect/atom-react"
import type { ReturnDetail, ReturnList, ReturnRow, ReturnSettingsDoc } from "@insyte/modules/returns/domain/Returns"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { useGateRole } from "@insyte/ui/app/access/gate-role"
import { OPEN_AS_MODAL } from "@insyte/ui/app/common/detail-shell"
import type { ReasonDef, ReturnSettings } from "@insyte/ui/app/lib/returns"
import type { Order } from "@insyte/ui/app/lib/types/domain"
import {
  CustomerReturnsPanel,
  OrderPickForm,
  OrderReturnsPanel,
  StartReturnForm
} from "@insyte/ui/app/returns/order-returns"
import type {
  ReturnDetailSource,
  ReturnGates,
  ReturnSettingsSource,
  ReturnsListSource,
  ReturnView,
  StartOrder
} from "@insyte/ui/app/returns/source"
import { useNavigate } from "@tanstack/react-router"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { frameAtom } from "../data/frame.ts"
import { ordersAtom } from "../data/orders.ts"
import { productsAtom } from "../data/products.ts"
import { customerReturnsAtom, orderReturnsAtom, returnableAtom, returnSettingsAtom } from "../data/returns.ts"
import { useGate } from "../frame/refusals.ts"
import { useRefundGate } from "../orders/order-writes.ts"
import { orderOf } from "../orders/orders-source.ts"
import { recordOf, settingsOf, viewOf } from "./return-of.ts"
import { useReturnCommands } from "./return-writes.ts"

/*
 * The returns screens' sources in the console (M9.1): `Returns.list`, `Returns.get` and `Returns.settings` as the
 * design's, with the server's commands. What the server does not do yet is left out, not made up: return labels and
 * the carrier's scans (M9.4), the public portal (M9.5) and the agents' proposal (M15). A return's window, its product
 * rule and what it may be settled with are the server's.
 */

function value<A>(result: AsyncResult.AsyncResult<A, unknown>): A | undefined {
  return Option.getOrUndefined(AsyncResult.value(result))
}

function useReturnGates(): ReturnGates {
  return { work: useGate("returns", 2), approve: useGate("returns.approve"), manage: useGate("returns", 3) }
}

function useTeam() {
  const frame = value(useAtomValue(frameAtom))
  return useMemo(() => ({
    meId: frame?.me.memberId ?? "",
    members: frame?.teammates.map((t) => ({ id: t.id, name: t.name })) ?? []
  }), [frame])
}

/** The settings' reasons, and any a return still names that the settings no longer have. */
const reasonsOf = (rows: ReadonlyArray<ReturnRow>, settings: ReturnSettingsDoc | undefined): Array<ReasonDef> => {
  const known = settings === undefined ? [] : settingsOf(settings).reasons
  const gone = new Map<string, ReasonDef>()
  for (const r of rows) {
    if (!known.some((k) => k.id === r.reasonId) && !gone.has(r.reasonId)) {
      gone.set(r.reasonId, {
        id: r.reasonId,
        label: r.reasonLabel,
        claim: r.kind === "claim",
        photoRequired: false,
        quality: r.quality
      })
    }
  }
  return [...known, ...gone.values()]
}

/** "Retour starten" from the list: the delivered and shipped orders the list of orders holds. */
function ConsolePick(
  { open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (o: StartOrder) => void }
) {
  return open ? <PickOpen onClose={onClose} onPick={onPick} /> : null
}

function PickOpen({ onClose, onPick }: { onClose: () => void; onPick: (o: StartOrder) => void }) {
  const page = value(useAtomValue(ordersAtom))
  const orders = useMemo(() => page?.rows.map(orderOf) ?? [], [page])
  return <OrderPickForm open onClose={onClose} onPick={onPick} orders={orders} />
}

/** "Retour starten" for one order: its lines that are still free to send back, over the store's reasons. */
export function ConsoleStartReturn(
  { order, open, onClose }: { order: StartOrder; open: boolean; onClose: () => void }
) {
  return open ? <StartOpen order={order} onClose={onClose} /> : null
}

function StartOpen({ order, onClose }: { order: StartOrder; onClose: () => void }) {
  const navigate = useNavigate()
  const commands = useReturnCommands()
  const returnable = value(useAtomValue(returnableAtom(order.id)))
  const settings = value(useAtomValue(returnSettingsAtom))
  const lines = useMemo(
    () =>
      returnable?.lines.filter((l) => l.free > 0).map((l) => ({
        id: l.id,
        title: l.title,
        label: l.variantTitle === "" ? l.title : `${l.title} · ${l.variantTitle}`,
        image: l.image ?? undefined
      })) ?? [],
    [returnable]
  )
  const reasons = useMemo(() => (settings === undefined ? [] : settingsOf(settings).reasons), [settings])
  // The reasons are the dialog's first choice: it opens once they are in.
  if (settings === undefined) return null
  return (
    <StartReturnForm
      order={order}
      open
      onClose={onClose}
      reasons={reasons}
      offered={settings.offered}
      lines={lines}
      onStart={(draft) =>
        void commands.start(draft).then((id) => {
          if (id !== undefined) {
            void navigate({ to: "/returns/$returnId", params: { returnId: id }, state: OPEN_AS_MODAL })
          }
        })}
    />
  )
}

/** The order's returns in its sidebar, once they are in; a role that may not see returns sees none. */
export function ConsoleOrderReturns({ order, onStart }: { order: Order; onStart: () => void }) {
  const list = value(useAtomValue(orderReturnsAtom(order.id)))
  const records = useMemo(() => list?.rows.map((r) => recordOf(r)) ?? [], [list])
  if (list === undefined) return null
  return <OrderReturnsPanel records={records} onStart={onStart} />
}

/** The customer's returns in their sidebar; nothing when there are none. */
export function useConsoleCustomerReturns(customerId: string) {
  return useMemo(
    () =>
      function ConsoleCustomerReturns() {
        const list = value(useAtomValue(customerReturnsAtom(customerId)))
        const records = useMemo(() => list?.rows.map((r) => recordOf(r)) ?? [], [list])
        return <CustomerReturnsPanel records={records} />
      },
    [customerId]
  )
}

/** The queue over `Returns.list`, with the commands the role may use. */
export function useConsoleReturnsListSource(
  list: ReturnList,
  settings: ReturnSettingsDoc | undefined,
  stores: ReadonlyArray<StoreView>
): ReturnsListSource {
  const commands = useReturnCommands()
  const gates = useReturnGates()
  const team = useTeam()
  const records = useMemo(() => list.rows.map((r) => recordOf(r)), [list])
  const reasons = useMemo(() => reasonsOf(list.rows, settings), [list, settings])
  const storeOptions = useMemo(() => stores.map((s) => ({ value: s.id, label: s.name })), [stores])
  return {
    records,
    none: list.counts.total === 0,
    reasons,
    portal: settings?.portal ?? { on: false, handle: "" },
    members: team.members,
    meId: team.meId,
    stores: storeOptions,
    commands,
    gates,
    Pick: ConsolePick,
    Start: ConsoleStartReturn
  }
}

const NO_SETTINGS = { giftCardBonus: 0, exchangeFee: 0 }

function useDetailSource(view: ReturnView, settings: ReturnSettingsDoc | undefined): ReturnDetailSource {
  const commands = useReturnCommands()
  const gates = useReturnGates()
  const team = useTeam()
  const role = useGateRole()
  const useRefund = (amount: number) => useRefundGate(Math.round(amount * 100))
  return {
    useView: () => view,
    commands,
    gates,
    meId: team.meId,
    role: { label: role?.label ?? "", refundLimit: role?.refundLimit ?? null },
    useRefundGate: useRefund,
    money: settings === undefined ?
      NO_SETTINGS :
      { giftCardBonus: settings.giftCardBonusPct, exchangeFee: settings.exchangeFeeMinor / 100 }
  }
}

/** One return over `Returns.get`. */
export function useConsoleReturnDetailSource(
  detail: ReturnDetail,
  settings: ReturnSettingsDoc | undefined
): ReturnDetailSource {
  const view = useMemo(() => ({ ...viewOf(detail), arriving: false }), [detail])
  return useDetailSource(view, settings)
}

/** The return while `Returns.get` is still out: the list's row draws the header, the record's skeleton the body. */
export function useArrivingReturnSource(row: ReturnRow, settings: ReturnSettingsDoc | undefined): ReturnDetailSource {
  const view = useMemo<ReturnView>(() => ({
    record: recordOf(row),
    reasonLabel: row.reasonLabel,
    photoRequired: false,
    window: { inside: true, daysSince: 0, days: 0, closesOn: new Date(row.createdAt) },
    rule: undefined,
    offered: [],
    earlier: 0,
    address: undefined,
    assignee: undefined,
    imageOf: () => undefined,
    arriving: true
  }), [row])
  return useDetailSource(view, settings)
}

/** The returns policy over `Returns.settings`; saving takes Retouren · Beheren. */
export function useConsoleReturnSettingsSource(saved: ReturnSettingsDoc): ReturnSettingsSource {
  const commands = useReturnCommands()
  const gate = useGate("returns", 3)
  const products = value(useAtomValue(productsAtom))
  const draft: ReturnSettings = useMemo(() => settingsOf(saved), [saved])
  const options = useMemo(() => products?.rows.map((p) => ({ id: p.id, title: p.title })) ?? [], [products])
  return {
    saved: draft,
    save: (next, s) => void commands.save(next, saved, s),
    gate,
    products: options
  }
}
