import { useAtomSet } from "@effect/atom-react"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { toast } from "sonner"
import { TICKETS, ticketWrites } from "../data/tickets.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * "Bijbestelling aanvragen" (the products list's selection) and "{n} bijbestellen" (the supplier's dialog): one ticket
 * per product on the board, awaiting the supplier's reply, as the low-stock plate files it (`low-stock.tsx`), once per
 * product while that ticket is open (`restock:<product>`). The new ones share one Undo; one asked for before stands.
 * A role that may not open tickets (Klantenservice · Bewerken) is not offered it.
 */

/** A product to restock, as far as the host knows it. */
export type RestockLine = {
  readonly productId: string
  readonly title: string
  readonly supplierName: string | null
  /** Units on hand where the host knows them. */
  readonly units: number | null
  readonly out: boolean
}

const descriptionOf = (l: RestockLine, supplier: string) =>
  `${
    l.units === null
      ? `${l.title} is ${l.out ? "uitverkocht" : "bijna op"}`
      : `Van ${l.title} zijn nog ${l.units} stuks over`
  }. Vraag ${supplier} wanneer er nieuwe voorraad komt.`

/** Files the restock tickets; `undefined` where the role may not open tickets. */
export function useRestock(): ((lines: ReadonlyArray<RestockLine>, to?: string) => Promise<void>) | undefined {
  const gate = useGate("support", 2)
  const create = useAtomSet(ticketWrites.create, { mode: "promiseExit" })
  const undo = useAtomSet(ticketWrites.undo, { mode: "promiseExit" })
  if (!gate.ok) return undefined
  const keys = { reactivityKeys: [...TICKETS] }
  return async (lines, to) => {
    const tokens: Array<string> = []
    let asked = 0
    for (const l of lines) {
      const supplier = l.supplierName ?? "de leverancier"
      const exit = await create({
        payload: {
          title: `${l.title} bijbestellen bij ${supplier}`.slice(0, 200),
          description: descriptionOf(l, supplier),
          priority: l.out || l.units === 0 ? "high" : "medium",
          status: "awaiting_reply",
          labels: ["Leverancier"],
          once: `restock:${l.productId}`
        },
        ...keys
      })
      if (Exit.isFailure(exit)) {
        sayRefusal(failureOf(exit), { gone: "Dat product bestaat niet meer" })
        continue
      }
      const token = exit.value.undo?.token
      if (token === undefined) asked += 1
      else tokens.push(token)
    }
    const already = asked === 0 ? undefined : `${counted(asked, "bijbestelling liep", "bijbestellingen liepen")} al.`
    if (tokens.length === 0) {
      if (already !== undefined) toast(already)
      return
    }
    undoable(
      `${counted(tokens.length, "bijbestelling", "bijbestellingen")} ${
        to === undefined ? "opgesteld op het bord" : `gestuurd naar ${to}`
      }`,
      () => {
        for (const token of tokens) {
          void undo({ payload: { token }, ...keys }).then((e) => {
            if (Exit.isFailure(e)) sayRefusal(failureOf(e), { gone: "Dat ticket is er niet meer" })
          })
        }
      },
      already
    )
  }
}
