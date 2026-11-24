import type { Priority, Ticket } from "../../fixtures/inbox.ts"
import { supplier } from "../../fixtures/records.ts"
import { ME } from "../../fixtures/workspace.ts"
import { navigate, paths } from "../../router.tsx"
import { toast } from "../../ui/toast.tsx"
import { createTicket, dropTickets, nowClock } from "../inbox/store.ts"

/*
 * Work for a supplier, filed as a ticket on the board: a late order to chase, a product to restock, a
 * check that came back wrong. Every area that asks a supplier something files it the same way, so it
 * is followed up like any other piece of work, and the toast offers the way back.
 */

export type SupplierAsk = {
  readonly supplierId: string
  readonly subject: string
  /** What the ticket says, as an internal note for whoever picks it up. */
  readonly note: string
  readonly priority: Priority
  /** The customer the work is for, when there is one (a late order). */
  readonly customerId?: string
  readonly order?: string
  readonly also?: Ticket["also"]
}

function file(ask: SupplierAsk): string {
  const s = supplier(ask.supplierId)
  return createTicket({
    customerId: ask.customerId ?? "",
    handle: s?.email ?? ask.supplierId,
    subject: ask.subject,
    channel: "email",
    status: "nieuw",
    priority: ask.priority,
    assignee: "elena",
    labels: ["Leverancier"],
    ...(ask.order === undefined ? {} : { order: ask.order }),
    also: ask.also ?? { kind: "supplier", id: ask.supplierId, label: s?.name ?? ask.supplierId },
    createdAt: nowClock(),
    unread: false,
    entries: [{ kind: "note", who: "elena", at: nowClock(), text: ask.note }]
  })
}

/**
 * File one ticket per ask and say so: "3 tickets opgesteld". One ticket can be opened from the toast;
 * several can be taken back together. `quiet` files them without a toast, for a caller that says it
 * in its own. Returns the new ticket numbers.
 */
export function fileSupplierTickets(
  asks: ReadonlyArray<SupplierAsk>,
  { title, quiet = false }: { readonly title?: string; readonly quiet?: boolean } = {}
): ReadonlyArray<string> {
  const numbers = asks.map(file)
  if (quiet) return numbers
  const first = numbers[0]
  const names = [...new Set(asks.map((a) => supplier(a.supplierId)?.name ?? a.supplierId))]
  const body = `Op het bord voor ${ME.name.split(" ")[0] ?? ME.name}, aan ${
    names.length === 1 ? names[0] : `${names.length} leveranciers`
  }. Controleer het voordat het naar de leverancier gaat.`
  if (numbers.length === 1 && first !== undefined) {
    toast({
      title: title ?? `Opgesteld als ticket #${first}`,
      body,
      tone: "good",
      duration: 8000,
      action: { label: "Openen", onClick: () => navigate(paths.ticket(first)) }
    })
  } else {
    toast({
      title: title ?? `${numbers.length} tickets opgesteld`,
      body,
      tone: "good",
      duration: 30_000,
      action: {
        label: "Ongedaan maken",
        onClick: () => {
          dropTickets(numbers)
          toast({ title: "Teruggezet" })
        }
      }
    })
  }
  return numbers
}
