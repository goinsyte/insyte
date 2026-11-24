import { casesNow, changeCase, restoreCases } from "../fixtures/chargebacks.ts"
import { getProductState, setProductState } from "../fixtures/products.ts"
import { customer, SUPPLIERS } from "../fixtures/records.ts"
import { ME } from "../fixtures/workspace.ts"
import { paths } from "../router.tsx"
import { createDraft, remove as removeFlow } from "../screens/automations/store.ts"
import {
  createTicket,
  dropEntries,
  dropTickets,
  getInbox,
  nowClock,
  patchTicket,
  ticketsOf
} from "../screens/inbox/store.ts"

/**
 * What Uitvoeren on one of Magnus's proposals does to the workspace: the same stores the areas read,
 * so a ticket filed here is on the inbox's board, a paused ad is paused on the product, an evidence
 * pack sent is sent on the case. Every action returns its undo, which puts the store back as it was.
 */

export type ProposalAction =
  | { readonly kind: "supplier-ticket"; readonly supplierId: string; readonly orders: ReadonlyArray<string> }
  | {
    readonly kind: "send-reply"
    readonly customerId: string
    /** The ticket it answers; without one, a new mail ticket is opened for it. */
    readonly ticket?: string
    readonly subject: string
  }
  | { readonly kind: "submit-evidence"; readonly caseId: string }
  | { readonly kind: "pause-ads"; readonly productId: string }
  | { readonly kind: "create-automation"; readonly templateId: string; readonly name: string }

/** What happened, for the toast, and how to take it back. */
type Applied = {
  readonly title: string
  readonly body: string
  readonly href?: string
  readonly undo: () => void
}

/** Do it. `text` is the proposal's draft as the person left it (Bewerken), for what is sent. */
export function apply(action: ProposalAction, text: string): Applied {
  switch (action.kind) {
    case "supplier-ticket": {
      const supplier = SUPPLIERS.find((s) => s.id === action.supplierId)
      const name = supplier?.name ?? "de leverancier"
      const list = action.orders.map((n) => `#${n}`).join(", ")
      const number = createTicket({
        customerId: "",
        handle: supplier?.email ?? "Intern",
        subject: `Nieuwe overdrachtsdata van ${name}`,
        channel: "email",
        status: "wacht",
        priority: "gemiddeld",
        assignee: "elena",
        labels: ["Leverancier", "Levering"],
        also: { kind: "supplier", id: action.supplierId, label: name },
        createdAt: nowClock(),
        unread: false,
        entries: [{ kind: "team", who: "elena", at: nowClock(), text }, {
          kind: "event",
          at: nowClock(),
          text: `${ME.name} vroeg ${name} om nieuwe data voor ${list}, via Magnus.`
        }]
      })
      return {
        title: `Ticket #${number} geopend voor ${name}`,
        body: "Het staat in de inbox onder Wacht op antwoord.",
        href: paths.ticket(number),
        undo: () => dropTickets([number])
      }
    }
    case "send-reply": {
      const who = customer(action.customerId)
      const first = who?.name.split(" ")[0] ?? "de klant"
      const open = action.ticket === undefined
        ? undefined
        : ticketsOf(getInbox(), false).find((t) => t.number === action.ticket)
      if (open !== undefined) {
        const before = { status: open.status, waiting: open.waitingSince !== undefined }
        patchTicket(open.number, {
          status: "wacht",
          answered: true,
          unread: false,
          entries: [{ kind: "team", who: "elena", at: nowClock(), text }]
        })
        return {
          title: `Antwoord aan ${first} staat klaar om te versturen`,
          body: `Op ticket #${open.number}, dat naar Wacht op antwoord gaat.`,
          href: paths.ticket(open.number),
          undo: () => {
            dropEntries(open.number, 1)
            patchTicket(open.number, { status: before.status, answered: !before.waiting })
          }
        }
      }
      const number = createTicket({
        customerId: action.customerId,
        handle: who?.email ?? "Intern",
        subject: action.subject,
        channel: "email",
        status: "wacht",
        priority: "laag",
        assignee: "elena",
        labels: ["Klant"],
        createdAt: nowClock(),
        unread: false,
        entries: [{ kind: "team", who: "elena", at: nowClock(), text }]
      })
      return {
        title: `Mail aan ${first} staat klaar om te versturen`,
        body: `Gevolgd als ticket #${number} onder Wacht op antwoord.`,
        href: paths.ticket(number),
        undo: () => dropTickets([number])
      }
    }
    case "submit-evidence": {
      const before = changeCase(action.caseId, (c) => ({
        status: "ingediend",
        events: [...c.events, { at: casesNow(), who: ME.name, text: "Bewijs ingediend via Magnus" }]
      }))
      return {
        title: `Bewijs voor ${action.caseId} ingediend`,
        body: "De zaak staat nu op Ingediend; de uitspraak komt binnen tien dagen.",
        href: paths.chargeback(action.caseId),
        undo: () => restoreCases(before)
      }
    }
    case "pause-ads": {
      const id = action.productId
      const before = getProductState().edits[id]
      setProductState((s) => ({ ...s, edits: { ...s.edits, [id]: { ...s.edits[id], adsPaused: true } } }))
      return {
        title: "Advertenties gepauzeerd",
        body: "Bij Meta, voor dit product. Ze gaan weer aan als je ze hervat.",
        href: paths.product(id),
        undo: () =>
          setProductState((s) => ({
            ...s,
            edits: before === undefined
              ? Object.fromEntries(Object.entries(s.edits).filter(([key]) => key !== id))
              : { ...s.edits, [id]: before }
          }))
      }
    }
    case "create-automation": {
      const id = createDraft(action.templateId, action.name)
      return {
        title: "Automatisering staat als concept klaar",
        body: "Er draait niets tot je hem publiceert.",
        href: paths.automation(id),
        undo: () => removeFlow(id)
      }
    }
  }
}
