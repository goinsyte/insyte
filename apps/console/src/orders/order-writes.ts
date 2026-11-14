import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { mintId } from "@insyte/domain/Ids"
import { canRole } from "@insyte/domain/Permissions"
import type { OrderChange } from "@insyte/modules/orders/domain/Commands"
import { useGateRole } from "@insyte/ui/app/access/gate-role"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import { permissionName } from "@insyte/ui/app/lib/permissions"
import type { Address, Order } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { TeamGate } from "@insyte/ui/app/orders/source"
import { useNavigate } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { toast } from "sonner"
import { ORDERS, orderTagsAtom, orderWrites } from "../data/orders.ts"
import { TICKETS, ticketWrites } from "../data/tickets.ts"
import { failureOf, type RefusalCopy, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * The order commands in the console (M7.1): each one the server's, refreshing what names `ORDERS`. What can be taken
 * back says what it did with "Ongedaan maken", which spends the command's undo token (`Shared.undo`) inside the
 * window, before Shopify hears of it. A cancellation was confirmed in its dialog and has no undo. A refusal is said
 * once, in Dutch; a missing permission says which.
 */

const euros = (minor: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(minor / 100)

const COPY: RefusalCopy = {
  gone: "Die bestelling bestaat niet meer",
  conflicts: {
    closed: ["Deze bestelling is al gesloten", "Een geannuleerde of terugbetaalde bestelling verandert niet meer."],
    fulfilled: [
      "Deze bestelling is al onderweg",
      "Een bestelling met verzonden pakketten kun je niet meer zo wijzigen."
    ],
    delivered: ["Deze bestelling is al bezorgd", "Een bezorgde bestelling markeer je niet meer als vertraagd."]
  },
  invalid: {
    system: "Dit label zet Insyte zelf; je kunt het hier niet toevoegen of weghalen.",
    "address.country": "Gebruik een landcode van twee letters, zoals NL.",
    "address.line1": "Vul de straat en het huisnummer in.",
    "address.city": "Vul de plaats in."
  },
  other: (tagged) => {
    switch (tagged._tag) {
      case "RefundOverLimit":
        toast.error("Boven je limiet", {
          description: `Je rol mag tot ${euros(Number(tagged["limitMinor"]))} per bestelling terugbetalen.`
        })
        return true
      case "RefundOverBalance":
        toast.error("Meer dan er openstaat", {
          description: `Er staat nog ${euros(Number(tagged["balanceMinor"]))} open op deze bestelling.`
        })
        return true
      case "AlreadyRefunded":
        toast.error("Al terugbetaald", { description: "Er staat niets meer open op deze bestelling." })
        return true
      default:
        return false
    }
  }
}

const orderRefused = (error: unknown) => sayRefusal(error, COPY)

/** Insyte's delay marker as the design's orders carry it. */
const AT_RISK = "at_risk"

/** Whether the viewer's role may, as the design's gates say it. */
export const useOrderGate = useGate

const NO_TAGS: ReadonlyArray<string> = []

/** The tags other orders use, offered while typing one (`Orders.tags`). */
export function useKnownOrderTags(): ReadonlyArray<string> {
  const result = useAtomValue(orderTagsAtom)
  const counts = Option.getOrUndefined(AsyncResult.value(result))
  return useMemo(() => counts?.map((c) => c.tag) ?? NO_TAGS, [counts])
}

/**
 * Whether the role may refund this much, as the design's gate says it: over the limit is not the same as not at all.
 * Nothing left to refund is said too, since the screen offers Terugbetalen on every paid order.
 */
export function useRefundGate(refundableMinor: number): TeamGate {
  const role = useGateRole()
  if (refundableMinor <= 0) return { ok: false, reason: "Er staat niets meer open op deze bestelling" }
  const euro = refundableMinor / 100
  if (role === null || canRole(role, "refunds.write", euro)) return { ok: true, reason: "" }
  if (canRole(role, "refunds.write") && role.refundLimit !== null) {
    return {
      ok: false,
      reason: `Je rol ${role.label} mag tot ${euros(role.refundLimit * 100)} per bestelling terugbetalen`
    }
  }
  return { ok: false, reason: `Je rol ${role.label} mist ${permissionName("refunds.write")}` }
}

/** Every order command, as the screens call them. */
export function useOrderCommands() {
  const navigate = useNavigate()
  const keys = { reactivityKeys: ORDERS }
  const write = {
    tag: useAtomSet(orderWrites.tag, { mode: "promiseExit" }),
    markFulfilled: useAtomSet(orderWrites.markFulfilled, { mode: "promiseExit" }),
    updateShipping: useAtomSet(orderWrites.updateShipping, { mode: "promiseExit" }),
    cancel: useAtomSet(orderWrites.cancel, { mode: "promiseExit" }),
    flagDelayed: useAtomSet(orderWrites.flagDelayed, { mode: "promiseExit" }),
    clearDelay: useAtomSet(orderWrites.clearDelay, { mode: "promiseExit" }),
    createTicket: useAtomSet(ticketWrites.create, { mode: "promiseExit" }),
    setNote: useAtomSet(orderWrites.setNote, { mode: "promiseExit" }),
    refund: useAtomSet(orderWrites.refund, { mode: "promiseExit" }),
    undo: useAtomSet(orderWrites.undo, { mode: "promiseExit" })
  }

  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) orderRefused(failureOf(exit))
    })

  /** Says what the change did, with its undo; a change that changed nothing says nothing. */
  const said = (exit: Exit.Exit<OrderChange, unknown>, message: string) => {
    if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
    const { undo: ticket, orders } = exit.value
    if (orders.length === 0) return
    if (ticket === null) return void toast.success(message)
    undoable(message, () => undo(ticket.token))
  }

  return {
    /** The order's tags as the screen wants them: what is new is added, what is gone is taken off. */
    setTags: async (order: Order, tags: ReadonlyArray<string>, message: string) => {
      // "Vertraagd" (`at_risk`) is the order's delay, not a label: it changes through flagDelayed and clearDelay.
      const add = tags.filter((t) => !order.tags.includes(t) && t !== AT_RISK)
      const remove = order.tags.filter((t) => !tags.includes(t) && t !== AT_RISK)
      if (add.length === 0 && remove.length === 0) return
      said(await write.tag({ payload: { ids: [order.id], add, remove }, ...keys }), message)
    },
    applyTags: async (rows: ReadonlyArray<Order>, tags: ReadonlyArray<string>, mode: "add" | "remove") => {
      const what = tags.length === 1 ? `“${tags[0]}”` : `${tags.length} labels`
      const message = `${what} ${mode === "add" ? "toegevoegd aan" : "verwijderd van"} ${
        counted(rows.length, "bestelling", "bestellingen")
      }`
      const payload = {
        ids: rows.map((o) => o.id),
        add: mode === "add" ? [...tags] : [],
        remove: mode === "remove" ? [...tags] : []
      }
      said(await write.tag({ payload, ...keys }), message)
    },
    markFulfilled: async (rows: ReadonlyArray<Order>, message: string) =>
      said(await write.markFulfilled({ payload: { ids: rows.map((o) => o.id) }, ...keys }), message),
    saveShipping: async (order: Order, address: Address) =>
      said(
        await write.updateShipping({
          payload: {
            id: order.id,
            address: {
              line1: address.line1,
              line2: address.line2 ?? null,
              city: address.city,
              postcode: address.postal_code,
              region: address.region,
              country: address.country
            }
          },
          ...keys
        }),
        "Verzendadres bijgewerkt"
      ),
    /** "Als vertraagd markeren": the order shows as Vertraagd; automations hear of it, the shopper is not mailed. */
    flagDelayed: async (rows: ReadonlyArray<Order>, message: string) =>
      said(await write.flagDelayed({ payload: { ids: rows.map((o) => o.id) }, ...keys }), message),
    clearDelay: async (rows: ReadonlyArray<Order>, message: string) =>
      said(await write.clearDelay({ payload: { ids: rows.map((o) => o.id) }, ...keys }), message),
    /**
     * Insyte's advice on a slow supplier, as the design drafts it: a ticket on the order for the team to check before
     * it goes to the supplier.
     */
    draftSupplierMessage: async (order: Order, supplier: string) => {
      const exit = await write.createTicket({
        payload: {
          title: `Overdrachtsdatum bevestigen met ${supplier} voor ${order.number}`,
          description:
            `${supplier} verwerkt ${order.number} trager dan normaal. Vraag om de overdrachtsdatum en het track & trace-nummer en laat het ${order.customer_name} weten zodra je het hebt.`,
          priority: "high",
          related: { type: "order", id: order.id }
        },
        reactivityKeys: [...TICKETS]
      })
      if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
      const row = exit.value.tickets[0]
      if (row === undefined) return
      toast.success(`Opgesteld als #${row.number}`, {
        description: "Controleer het voordat het naar de leverancier gaat.",
        action: {
          label: "Openen",
          onClick: () => void navigate({ to: "/tickets", search: { ticket: row.id } as never })
        }
      })
    },
    cancel: async (order: Order) =>
      said(
        await write.cancel({ payload: { ids: [order.id], restock: true, notify: true }, ...keys }),
        `${order.number} geannuleerd`
      ),
    /** Irreversible: the dialog asked first, so it says what was asked and offers no undo. */
    refund: async (order: Order, amountMinor: number) => {
      const exit = await write.refund({ payload: { id: order.id, refundId: mintId("rfd"), amountMinor }, ...keys })
      if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
      toast.success(`${order.number} wordt terugbetaald`, {
        description: `${euros(amountMinor)} aan ${order.customer_name}, via de oorspronkelijke betaalmethode.`
      })
    },
    saveNote: async (order: Order, body: string) => {
      const exit = await write.setNote({ payload: { id: order.id, body }, ...keys })
      if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
      toast.success(body.trim() === "" ? "Notitie verwijderd" : "Notitie opgeslagen")
    }
  }
}
