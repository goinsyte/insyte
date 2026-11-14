import { useAtomSet } from "@effect/atom-react"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { toast } from "sonner"
import { TICKETS, ticketWrites } from "../data/tickets.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * "Bijbestelling aanvragen" (the products list's selection), "{n} bijbestellen" (the supplier's dialog) and the
 * low-stock plate's restock: `Tickets.restock`, one ticket per product on the board awaiting the supplier's reply, in
 * the product's store and in words the server takes from its stock, once per product while that ticket is open. The
 * new ones share one Undo; one asked for before stands. A role that may not open tickets (Klantenservice · Bewerken) is
 * not offered it.
 */

/** Files the restock tickets for these products, `to` naming the supplier; `undefined` where the role may not. */
export function useRestock():
  | ((productIds: ReadonlyArray<string>, options?: { readonly to?: string }) => Promise<void>)
  | undefined
{
  const gate = useGate("support", 2)
  const restock = useAtomSet(ticketWrites.restock, { mode: "promiseExit" })
  const undo = useAtomSet(ticketWrites.undo, { mode: "promiseExit" })
  if (!gate.ok) return undefined
  const keys = { reactivityKeys: [...TICKETS] }
  return async (productIds, options) => {
    const exit = await restock({ payload: { productIds: [...productIds] }, ...keys })
    if (Exit.isFailure(exit)) return sayRefusal(failureOf(exit), { gone: "Dat product bestaat niet meer" })
    const { tickets, undo: token, already } = exit.value
    const made = tickets.length - already
    const before = already === 0
      ? undefined
      : `${counted(already, "bijbestelling liep", "bijbestellingen liepen")} al.`
    if (token === null) {
      return void toast(tickets.length === 1 ? `Bijbestelling loopt al in #${tickets[0]!.number}` : (before ?? ""))
    }
    undoable(
      `${counted(made, "bijbestelling", "bijbestellingen")} ${
        options?.to === undefined ? "opgesteld op het bord" : `gestuurd naar ${options.to}`
      }`,
      () =>
        void undo({ payload: { token: token.token }, ...keys }).then((e) => {
          if (Exit.isFailure(e)) sayRefusal(failureOf(e), { gone: "Dat ticket is er niet meer" })
        }),
      before
    )
  }
}
