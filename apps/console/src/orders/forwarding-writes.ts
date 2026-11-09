import { useAtomSet } from "@effect/atom-react"
import type { ForwardingChange } from "@insyte/modules/forwarding/domain/Forwarding"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import { forwardSentence, type ForwardVia } from "@insyte/ui/app/lib/forwarding"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit } from "effect"
import { FORWARDING, forwardingWrites } from "../data/forwarding.ts"
import { ORDERS } from "../data/orders.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * The forwarding commands in the console (M8.2): each the server's, refreshing what names `FORWARDING` and `ORDERS`,
 * with "Ongedaan maken" spending the command's undo token (a forward's send waits for it).
 */

const COPY: RefusalCopy = {
  gone: "Die bestelling staat niet meer in de wachtrij",
  conflicts: {
    no_supplier: ["Geen leverancier gekoppeld", "Koppel de producten aan een leverancier, of kies een andere."],
    paused: ["De leverancier is gepauzeerd", "Hervat de leverancier, of kies een andere."],
    already_sent: ["Al doorgestuurd", "Een verzonden bestelling gaat niet meer naar een andere leverancier."],
    supplier_has_leg: ["Die leverancier heeft deze bestelling al", "Kies een andere leverancier."]
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

/** What a command needs of a queue row: the leg, its order and its supplier. */
interface Leg {
  readonly key: string
  readonly orderId: string
  readonly supplierId: string
  readonly order: { readonly number: string }
}

export function useForwardingCommands() {
  const keys = { reactivityKeys: [...FORWARDING, ...ORDERS] }
  const write = {
    forward: useAtomSet(forwardingWrites.forward, { mode: "promiseExit" }),
    markConfirmed: useAtomSet(forwardingWrites.markConfirmed, { mode: "promiseExit" }),
    reroute: useAtomSet(forwardingWrites.reroute, { mode: "promiseExit" }),
    undo: useAtomSet(forwardingWrites.undo, { mode: "promiseExit" })
  }
  const undo = (token: string) =>
    void write.undo({ payload: { token }, ...keys }).then((exit) => {
      if (Exit.isFailure(exit)) refused(failureOf(exit))
    })
  const said = (exit: Exit.Exit<ForwardingChange, unknown>, message: string, description?: string) => {
    if (Exit.isFailure(exit)) return refused(failureOf(exit))
    const ticket = exit.value.undo
    if (ticket === null) return
    undoable(message, () => undo(ticket.token), description)
  }
  return {
    forward: async (rows: ReadonlyArray<Leg>, via: Partial<Record<string, ForwardVia>>, note: string) => {
      const chosen = Object.fromEntries(
        Object.entries(via).filter((e): e is [string, ForwardVia] => e[1] !== undefined)
      )
      const sentence = forwardSentence(rows)
      said(
        await write.forward({
          payload: { ids: rows.map((r) => r.key), via: chosen, ...(note === "" ? {} : { note }) },
          ...keys
        }),
        "Wordt doorgestuurd…",
        `${sentence.replace(/ doorsturen$/, "")}. Ongedaan maken kan tot het vertrekt.`
      )
    },
    confirm: async (rows: ReadonlyArray<Leg>) =>
      said(
        await write.markConfirmed({ payload: { ids: rows.map((r) => r.key) }, ...keys }),
        `${counted(rows.length, "bestelling", "bestellingen")} als bevestigd gemarkeerd`,
        "Voor als de leverancier buiten Insyte om bevestigde."
      ),
    reroute: async (row: Leg, supplierId: string, name: string) =>
      said(
        await write.reroute({ payload: { id: row.key, toSupplierId: supplierId }, ...keys }),
        `${row.order.number} gaat naar ${name}`,
        "Staat bij Te versturen."
      )
  }
}
