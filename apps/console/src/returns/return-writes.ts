import { useAtomSet } from "@effect/atom-react"
import { mintId } from "@insyte/domain/Ids"
import { type ReturnChange, ReturnSettingsDoc } from "@insyte/modules/returns/domain/Returns"
import { formatCurrency } from "@insyte/ui/app/lib/format"
import {
  type Resolution,
  RESOLUTION_LABEL,
  type ReturnRecord,
  type ReturnSettings,
  STATUS_LABEL
} from "@insyte/ui/app/lib/returns"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { ReturnCommands, Said, StartDraft } from "@insyte/ui/app/returns/source"
import { Exit, Schema } from "effect"
import { toast } from "sonner"
import { ORDERS } from "../data/orders.ts"
import { RETURN_SETTINGS, RETURNS, returnWrites } from "../data/returns.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"
import { docOf } from "./return-of.ts"

/*
 * The returns commands in the console (M9.1): each the server's, refreshing what names `RETURNS`, with "Ongedaan maken"
 * spending the command's undo token. A refund goes through `Orders.refund` on the server and cannot be taken back; it
 * names `ORDERS` too. Settling with anything else is recorded here: the gift card, discount code or new order in
 * Shopify, and the shopper's mail, come later (M9.3), so nothing says they were sent.
 */

const euros = (minor: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(minor / 100)

const LINE: Record<string, string> = {
  taken: "Dat artikel zit al in een andere retour.",
  rule: "Dat artikel neemt de winkel niet terug.",
  unknown: "Dat artikel hoort niet bij deze bestelling."
}

const COPY: RefusalCopy = {
  gone: "Die retour bestaat niet meer",
  invalid: {
    reasonId: "Die reden bestaat niet meer.",
    reasons: "Twee redenen hebben dezelfde naam.",
    addresses: "Er staan twee adressen voor hetzelfde land."
  },
  other: (tagged) => {
    switch (tagged._tag) {
      case "IllegalReturnMove":
        toast.error("Dat kan nu niet meer", {
          description: `Deze retour is al ${
            STATUS_LABEL[tagged["from"] as keyof typeof STATUS_LABEL].toLowerCase()
          }. Iemand anders was je voor.`
        })
        return true
      case "ResolutionNotAllowed":
        toast.error("Die oplossing kan hier niet", {
          description: "De regel op dit artikel of je retourinstellingen staan hem niet toe."
        })
        return true
      case "LineNotReturnable":
        toast.error("Dat kan niet terug", { description: LINE[String(tagged["why"])] ?? LINE["unknown"] })
        return true
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

const refused = (error: unknown) => sayRefusal(error, COPY)

const money = (r: ReturnRecord, amount: number) =>
  formatCurrency(amount, r.currency, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Every returns command, as the screens call them; `start` and `save` too. */
export function useReturnCommands() {
  const keys = { reactivityKeys: [...RETURNS] }
  const write = {
    start: useAtomSet(returnWrites.start, { mode: "promiseExit" }),
    approve: useAtomSet(returnWrites.approve, { mode: "promiseExit" }),
    reject: useAtomSet(returnWrites.reject, { mode: "promiseExit" }),
    reopen: useAtomSet(returnWrites.reopen, { mode: "promiseExit" }),
    assign: useAtomSet(returnWrites.assign, { mode: "promiseExit" }),
    markReceived: useAtomSet(returnWrites.markReceived, { mode: "promiseExit" }),
    inspect: useAtomSet(returnWrites.inspect, { mode: "promiseExit" }),
    resolve: useAtomSet(returnWrites.resolve, { mode: "promiseExit" }),
    setSettings: useAtomSet(returnWrites.setSettings, { mode: "promiseExit" }),
    undo: useAtomSet(returnWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string, reactivityKeys: ReadonlyArray<string> = RETURNS) =>
    void write.undo({ payload: { token }, reactivityKeys: [...reactivityKeys] }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  /** Says what the change did, with its undo; a change that changed nothing says nothing. */
  const said = (exit: Exit.Exit<ReturnChange, unknown>, s: Said) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const { undo: ticket, returns } = exit.value
    if (returns.length === 0) return
    if (ticket === null) return void toast.success(s.label, { description: s.detail })
    undoable(s.label, () => undo(ticket.token), s.detail)
  }

  const commands: ReturnCommands = {
    approve: async (ids, s, keepItem) =>
      said(await write.approve({ payload: { ids: [...ids], ...(keepItem ? { keepItem } : {}) }, ...keys }), s),
    reject: async (ids, reason, s) => said(await write.reject({ payload: { ids: [...ids], reason }, ...keys }), s),
    reopen: async (id, s) => said(await write.reopen({ payload: { id }, ...keys }), s),
    receive: async (id, s) => said(await write.markReceived({ payload: { id }, ...keys }), s),
    inspect: async (id, s) => said(await write.inspect({ payload: { id }, ...keys }), s),
    assign: async (ids, memberId, s) => said(await write.assign({ payload: { ids: [...ids], memberId }, ...keys }), s),
    settle: async (r: ReturnRecord, kind: Resolution) =>
      said(
        await write.resolve({ payload: { id: r.id, resolution: kind }, ...keys }),
        { label: `${r.number} afgehandeld: ${RESOLUTION_LABEL[kind].toLowerCase()}` }
      ),
    refund: async (r: ReturnRecord, amount: number) => {
      const exit = await write.resolve({
        payload: { id: r.id, resolution: "refund", refundId: mintId("rfd") },
        reactivityKeys: [...RETURNS, ...ORDERS]
      })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      toast.success(`${money(r, amount)} wordt terugbetaald`, {
        description:
          `${r.number} is afgehandeld. Het geld gaat terug op de oorspronkelijke betaalmethode van ${r.orderNumber}.`
      })
    }
  }

  return {
    ...commands,
    /** "Retour starten": the new return's id, or `undefined` when refused (and said why). */
    start: async (draft: StartDraft) => {
      const note = draft.note.trim()
      const exit = await write.start({
        payload: {
          orderId: draft.orderId,
          lines: draft.lines.map((lineId) => ({ lineId, qty: 1 })),
          reasonId: draft.reason,
          requested: draft.want,
          ...(note === "" ? {} : { note })
        },
        ...keys
      })
      if (Exit.isFailure(exit)) return void refused(failureOf(exit))
      const made = exit.value.returns[0]
      const ticket = exit.value.undo
      if (made === undefined) return
      if (ticket !== null) undoable(`${made.number} aangemaakt`, () => undo(ticket.token))
      return made.id
    },
    /** The policy saved, with its undo; a draft the server would refuse is said here. */
    save: async (next: ReturnSettings, saved: ReturnSettingsDoc, s: Said) => {
      const decoded = Schema.decodeExit(ReturnSettingsDoc)(docOf(next, saved))
      if (Exit.isFailure(decoded)) {
        return void toast.error("Dat kan zo niet", {
          description: "Kijk de termijnen, redenen en teksten nog eens na."
        })
      }
      const exit = await write.setSettings({ payload: decoded.value, reactivityKeys: [...RETURN_SETTINGS, ...RETURNS] })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      const token = exit.value.undo.token
      undoable(s.label, () => undo(token, [...RETURN_SETTINGS, ...RETURNS]), s.detail)
    }
  }
}
