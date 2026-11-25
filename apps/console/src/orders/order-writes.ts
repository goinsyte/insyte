import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { mintId } from "@insyte/domain/Ids"
import { canRole } from "@insyte/domain/Permissions"
import type { OrderChange } from "@insyte/modules/orders/domain/Commands"
import type { TrackingSent, TrackingSkip } from "@insyte/modules/orders/domain/CustomerMail"
import type { RefundLimit } from "@insyte/modules/orders/domain/Orders"
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

/** `10869` in USD → "US$ 108,69": an amount in its own currency's minor units. */
const moneyIn = (minor: number, currency: string) => {
  const format = new Intl.NumberFormat("nl-NL", { style: "currency", currency })
  return format.format(minor / 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2))
}

type LimitBasis = Omit<typeof RefundLimit.Type, "limitMinor">

/**
 * A refund limit as the team reads it: in the order's currency and, when that is another than the workspace's, the
 * role's own amount it was converted from.
 */
const limitText = (limitMinor: number, l: LimitBasis) =>
  l.currency === l.roleCurrency
    ? moneyIn(limitMinor, l.currency)
    : `${moneyIn(limitMinor, l.currency)} (${moneyIn(l.roleMinor, l.roleCurrency)} tegen de ECB-koers)`

const noRateText = (l: LimitBasis) =>
  `Er is nog geen wisselkoers van ${l.currency} naar ${l.roleCurrency}, dus je limiet van ${
    moneyIn(l.roleMinor, l.roleCurrency)
  } is op deze bestelling nog niet te toetsen`

/** "Boven je limiet": the server's `RefundOverLimit`, in the order's currency and the role's. */
export const sayOverLimit = (tagged: Readonly<Record<string, unknown>>) => {
  const limitMinor = Number(tagged["limitMinor"])
  const currency = String(tagged["currency"] ?? "EUR")
  const text = limitText(limitMinor, {
    currency,
    roleMinor: Number(tagged["roleMinor"] ?? limitMinor),
    roleCurrency: String(tagged["roleCurrency"] ?? currency)
  })
  toast.error("Boven je limiet", { description: `Je rol mag tot ${text} per bestelling terugbetalen.` })
}

/** A refund the server could not hold to the limit: no exchange rate yet from the order's currency. */
export const NO_FX_RATE: [string, string] = [
  "Nog geen wisselkoers",
  "Je limiet staat in een andere munt dan deze bestelling en er is nog geen koers om mee te rekenen. Probeer het later opnieuw, of vraag iemand zonder limiet."
]

const COPY: RefusalCopy = {
  gone: "Die bestelling bestaat niet meer",
  conflicts: {
    closed: ["Deze bestelling is al gesloten", "Een geannuleerde of terugbetaalde bestelling verandert niet meer."],
    fulfilled: [
      "Deze bestelling is al onderweg",
      "Een bestelling met verzonden pakketten kun je niet meer zo wijzigen."
    ],
    delivered: ["Deze bestelling is al bezorgd", "Een bezorgde bestelling markeer je niet meer als vertraagd."],
    already_sent: ["Te laat om ongedaan te maken", "De mail is al verstuurd."],
    draft: ["Dit is een concept", "Een concept wordt pas een bestelling als het in Shopify is afgerond."],
    not_draft: ["Dit is geen concept", "Alleen een concept kun je zo verwijderen."],
    disconnected: ["De winkel is niet verbonden", "Verbind de winkel opnieuw om er een bestelling in te maken."],
    no_fx_rate: NO_FX_RATE
  },
  invalid: {
    system: "Dit label zet Insyte zelf; je kunt het hier niet toevoegen of weghalen.",
    "address.country": "Gebruik een landcode van twee letters, zoals NL.",
    "address.line1": "Vul de straat en het huisnummer in.",
    "address.city": "Vul de plaats in.",
    "customer.name": "Vul de naam van de klant in.",
    "customer.email": "Kijk het e-mailadres van de klant nog eens na.",
    lines: "Geef elk artikel een SKU of een naam.",
    unknown: "Deze winkel verkoopt een van de SKU's niet. Laat de SKU leeg voor een eigen artikel."
  },
  other: (tagged) => {
    switch (tagged._tag) {
      case "RefundOverLimit":
        sayOverLimit(tagged)
        return true
      case "RefundOverBalance":
        toast.error("Meer dan er openstaat", {
          description: `Er staat nog ${euros(Number(tagged["balanceMinor"]))} open op deze bestelling.`
        })
        return true
      case "CustomerMailRefused":
        toast.error("Geen e-mailadres", { description: "Shopify heeft geen e-mailadres voor deze klant." })
        return true
      case "NotFound":
        if (tagged["entity"] !== "store") return false
        toast.error("Die winkel kun je niet bereiken", { description: "Kies een winkel waar je rol bij kan." })
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

/** Insyte's markers as the design's orders carry them: set by Insyte, never as a label. */
const AT_RISK = "at_risk"
const MARKERS: ReadonlySet<string> = new Set([AT_RISK, "tracking_sent", "tracking_failed", "draft"])

/** Why orders of a selection got no track-and-trace update, in a toast's words. */
const SKIPPED: Record<TrackingSkip, readonly [one: string, many: string]> = {
  already_told: ["kreeg dit track & trace-nummer al", "kregen dit track & trace-nummer al"],
  no_email: ["heeft geen e-mailadres", "hebben geen e-mailadres"],
  no_tracking: ["heeft nog geen track & trace", "hebben nog geen track & trace"],
  closed: ["is gesloten", "zijn gesloten"],
  delivered: ["is al bezorgd", "zijn al bezorgd"]
}

const skippedText = (skipped: TrackingSent["skipped"]) => {
  const counts = new Map<TrackingSkip, number>()
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1)
  return [...counts].map(([reason, n]) => `${n} ${SKIPPED[reason][n === 1 ? 0 : 1]}`).join(", ")
}

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
 * Nothing left to refund is said too, since the screen offers Terugbetalen on every paid order. `limit` is the server's
 * for this order (`refundLimit` on the order's or the return's detail), in the order's currency; the role's own is in
 * the workspace's, so it is held against the amount only while the server's is not there yet.
 */
export function useRefundGate(refundableMinor: number, limit?: typeof RefundLimit.Type | null): TeamGate {
  const role = useGateRole()
  if (refundableMinor <= 0) return { ok: false, reason: "Er staat niets meer open op deze bestelling" }
  if (role !== null && limit !== undefined && canRole(role, "refunds.write")) {
    if (limit === null) return { ok: true, reason: "" }
    if (limit.limitMinor === null) return { ok: false, reason: noRateText(limit) }
    if (refundableMinor <= limit.limitMinor) return { ok: true, reason: "" }
    return {
      ok: false,
      reason: `Je rol ${role.label} mag tot ${limitText(limit.limitMinor, limit)} per bestelling terugbetalen`
    }
  }
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

/** "Nieuwe bestelling" as the dialog fills it in: amounts in the store's units. */
export interface NewDraft {
  readonly storeId: string
  readonly name: string
  readonly email: string
  readonly payment: string
  readonly note: string
  readonly lines: ReadonlyArray<{ sku: string; title: string; qty: number; price: number }>
}

const PAYMENTS = ["stripe", "paypal", "klarna", "manual"] as const
const paymentOf = (p: string) => PAYMENTS.find((k) => k === p.toLowerCase()) ?? "manual"

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
    emailCustomer: useAtomSet(orderWrites.emailCustomer, { mode: "promiseExit" }),
    sendTrackingUpdate: useAtomSet(orderWrites.sendTrackingUpdate, { mode: "promiseExit" }),
    createDraft: useAtomSet(orderWrites.createDraft, { mode: "promiseExit" }),
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
    /**
     * "Conceptbestelling aanmaken": the draft in Insyte at once, in Shopify once the undo window has passed. Answers the
     * draft's id, to open it.
     */
    createDraft: async (input: NewDraft): Promise<string | undefined> => {
      const exit = await write.createDraft({
        payload: {
          storeId: input.storeId,
          customer: { name: input.name, email: input.email },
          payment: paymentOf(input.payment),
          note: input.note,
          lines: input.lines.map((l) => ({
            sku: l.sku,
            title: l.title,
            quantity: l.qty,
            unitPriceMinor: Math.max(0, Math.round(l.price * 100))
          }))
        },
        ...keys
      })
      if (Exit.isFailure(exit)) return void orderRefused(failureOf(exit))
      const draft = exit.value.orders[0]
      const ticket = exit.value.undo
      if (draft === undefined) return
      const message = `Conceptbestelling ${draft.number} aangemaakt`
      const detail = "Shopify krijgt het concept zodra je het niet meer ongedaan kunt maken."
      if (ticket === null) toast.success(message, { description: detail })
      else undoable(message, () => undo(ticket.token), detail)
      return draft.id
    },
    /** The order's tags as the screen wants them: what is new is added, what is gone is taken off. */
    setTags: async (order: Order, tags: ReadonlyArray<string>, message: string) => {
      // "Vertraagd" (`at_risk`) is the order's delay, not a label: it changes through flagDelayed and clearDelay. The
      // same goes for "Track & trace verstuurd" and "Track & trace niet verstuurd", which the track-and-trace mail sets.
      const add = tags.filter((t) => !order.tags.includes(t) && !MARKERS.has(t))
      const remove = order.tags.filter((t) => !tags.includes(t) && !MARKERS.has(t))
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
    /**
     * "Track & trace-update sturen": each order's shopper is mailed its newest parcel, once per tracking number. The mails
     * wait out the undo window; what was left out says why.
     */
    sendTrackingUpdate: async (rows: ReadonlyArray<Order>) => {
      const exit = await write.sendTrackingUpdate({ payload: { ids: rows.map((o) => o.id) }, ...keys })
      if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
      const { orders, skipped, undo: ticket } = exit.value
      const why = skipped.length === 0 ? undefined : `Overgeslagen: ${skippedText(skipped)}.`
      if (orders.length === 0 || ticket === null) {
        return void toast.error("Geen track & trace-update gestuurd", { description: why })
      }
      undoable(
        `Track & trace-update gestuurd naar ${counted(orders.length, "klant", "klanten")}`,
        () => undo(ticket.token),
        why
      )
    },
    /** The team's own mail to the order's shopper, in the store's name; it waits out the undo window. */
    emailCustomer: async (orderId: string, subject: string, body: string, customer: string) => {
      const exit = await write.emailCustomer({ payload: { orderId, subject, body, id: mintId("oml") }, ...keys })
      if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
      const ticket = exit.value.undo
      const detail = `Aan ${customer}: ${subject}`
      if (ticket === null) return void toast.success("Wordt verstuurd…", { description: detail })
      undoable("Wordt verstuurd…", () => undo(ticket.token), detail)
    },
    saveNote: async (order: Order, body: string) => {
      const exit = await write.setNote({ payload: { id: order.id, body }, ...keys })
      if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
      toast.success(body.trim() === "" ? "Notitie verwijderd" : "Notitie opgeslagen")
    }
  }
}
