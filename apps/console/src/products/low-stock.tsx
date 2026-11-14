import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { LowStockRow } from "@insyte/modules/products/domain/Products"
import { undoable } from "@insyte/ui/app/lib/undo"
import { LowStockAdvice } from "@insyte/ui/app/products/low-stock-advice"
import type { Decision } from "@insyte/ui/app/stores/ask-store"
import { useNavigate } from "@tanstack/react-router"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useState } from "react"
import { toast } from "sonner"
import { lowStockAtom } from "../data/products.ts"
import { TICKETS, ticketWrites } from "../data/tickets.ts"
import { failureOf, sayRefusal, useGate } from "../frame/refusals.ts"

/*
 * The list's low-stock advice in the console: the design's plate over `Products.lowStock` (M7 9.3), the product that
 * runs out soonest at its own pace. Filing asks the supplier for a restock date in a ticket on the board (Klantenservice
 * · Bewerken, `Tickets.restock`: in the product's store), with Undo, once per product while that ticket is open; Discard leaves it, for this visit. Insyte cannot pause the ads yet (M13.5), so the plate
 * proposes the restock request alone. A role that may not open tickets is not offered it.
 */

export function ConsoleLowStock() {
  const navigate = useNavigate()
  const gate = useGate("support", 2)
  const page = Option.getOrUndefined(AsyncResult.value(useAtomValue(lowStockAtom)))
  const restock = useAtomSet(ticketWrites.restock, { mode: "promiseExit" })
  const undo = useAtomSet(ticketWrites.undo, { mode: "promiseExit" })
  const [decided, setDecided] = useState<Record<string, Decision>>({})

  if (!gate.ok || page === undefined) return null
  const pick = page.rows.find((r) =>
    r.status !== "archived" && (r.daysLeft !== null || r.available <= 0) && decided[r.productId] !== "discarded"
  )
  if (pick === undefined) return null
  const units = Math.max(0, pick.available)
  const perDay = pick.soldLast30 / 30
  const keys = { reactivityKeys: [...TICKETS] }

  const file = async (r: LowStockRow) => {
    setDecided((d) => ({ ...d, [r.productId]: "filed" }))
    // In the product's store, in the server's words, once while it is open (`Tickets.restock`).
    const exit = await restock({ payload: { productIds: [r.productId] }, ...keys })
    if (Exit.isFailure(exit)) {
      setDecided((d) => ({ ...d, [r.productId]: "open" }))
      return sayRefusal(failureOf(exit), { gone: "Dat product bestaat niet meer" })
    }
    const ticket = exit.value.tickets[0]
    const number = ticket === undefined ? "" : ` in #${ticket.number}`
    const token = exit.value.undo?.token
    // Asked before and still open: that ticket stands, and there is nothing to undo.
    if (token === undefined) return void toast(`Bijbestelling loopt al${number}`)
    undoable(`Bijbestelling gevraagd${number}`, () => {
      setDecided((d) => ({ ...d, [r.productId]: "open" }))
      void undo({ payload: { token }, ...keys }).then((e) => {
        if (Exit.isFailure(e)) {
          setDecided((d) => ({ ...d, [r.productId]: "filed" }))
          sayRefusal(failureOf(e), { gone: "Dat ticket is er niet meer" })
        }
      })
    })
  }

  return (
    <LowStockAdvice
      pick={{
        title: pick.title,
        image: pick.image ?? undefined,
        units,
        perDay,
        daysLeft: pick.daysLeft,
        openOrders: pick.openOrders,
        supplierName: pick.supplierName ?? undefined
      }}
      ads={false}
      decision={decided[pick.productId] ?? "open"}
      onFile={() => void file(pick)}
      onDiscard={() => setDecided((d) => ({ ...d, [pick.productId]: "discarded" }))}
      onEdit={() => navigate({ to: "/products/$productId", params: { productId: pick.productId } })}
    />
  )
}
