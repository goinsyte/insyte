import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { canRole } from "@insyte/domain/Permissions"
import type { OrderChange } from "@insyte/modules/orders/domain/Commands"
import { useGateRole } from "@insyte/ui/app/access/gate-role"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import { type Level, type Permission, permissionName } from "@insyte/ui/app/lib/permissions"
import type { Address, Order } from "@insyte/ui/app/lib/types/domain"
import { undoable } from "@insyte/ui/app/lib/undo"
import type { TeamGate } from "@insyte/ui/app/orders/source"
import { Cause, Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { toast } from "sonner"
import { ORDERS, orderTagsAtom, orderWrites } from "../data/orders.ts"

/*
 * The order commands in the console (M7.1): each one the server's, refreshing what names `ORDERS`. What can be taken
 * back says what it did with "Ongedaan maken", which spends the command's undo token (`Shared.undo`) inside the
 * window, before Shopify hears of it. A cancellation was confirmed in its dialog and has no undo. A refusal is said
 * once, in Dutch; a missing permission says which.
 */

/** The typed failure of a write's exit, or the defect squashed: what the server said. */
const failureOf = <A, E>(exit: Exit.Failure<A, E>): unknown => {
  const failure = exit.cause.reasons.find((r) => r._tag === "Fail")
  return failure === undefined ? Cause.squash(exit.cause) : failure.error
}

const CONFLICT: Record<string, [string, string]> = {
  closed: ["Deze bestelling is al gesloten", "Een geannuleerde of terugbetaalde bestelling verandert niet meer."],
  fulfilled: ["Deze bestelling is al onderweg", "Een bestelling met verzonden pakketten kun je niet meer zo wijzigen."],
  already_sent: ["Te laat om ongedaan te maken", "De wijziging is al naar Shopify gegaan."],
  expired: ["Te laat om ongedaan te maken", "De wijziging is al naar Shopify gegaan."],
  used: ["Al ongedaan gemaakt", "Deze wijziging is al teruggedraaid."],
  gone: ["Die bestelling bestaat niet meer", "Iemand anders was je voor."]
}

const INVALID: Record<string, string> = {
  system: "Dit label zet Insyte zelf; je kunt het hier niet toevoegen of weghalen.",
  "address.country": "Gebruik een landcode van twee letters, zoals NL.",
  "address.line1": "Vul de straat en het huisnummer in.",
  "address.city": "Vul de plaats in."
}

/** The server's refusal, said once. */
const orderRefused = (error: unknown) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  switch (tagged._tag) {
    case "Forbidden":
      return void toast.error("Dat kan je rol niet", {
        description: `Je rol ${tagged["roleLabel"]} mist ${
          permissionName(tagged["permission"] as Permission, tagged["level"] as Level)
        }.`
      })
    case "Conflict": {
      const [title, description] = CONFLICT[String(tagged["reason"])] ?? ["Dat lukte niet", "Probeer het zo nog eens."]
      return void toast.error(title, { description })
    }
    case "Invalid": {
      const fields = tagged["fields"] as Record<string, string>
      const said = Object.entries(fields).map(([field, reason]) => INVALID[field] ?? INVALID[reason]).find(Boolean)
      return void toast.error("Dat kan zo niet", { description: said ?? "Kijk de invoer nog eens na." })
    }
    case "NotFound":
      return void toast.error("Die bestelling bestaat niet meer", { description: "Iemand anders was je voor." })
    default:
      return void toast.error("Dat lukte niet", { description: "Probeer het zo nog eens." })
  }
}

/** Whether the viewer's role may, and if not which permission it misses, as the design's gates say it. */
export function useOrderGate(perm: Permission, arg?: Level): TeamGate {
  const role = useGateRole()
  if (role === null || canRole(role, perm, arg)) return { ok: true, reason: "" }
  return { ok: false, reason: `Je rol ${role.label} mist ${permissionName(perm, arg)}` }
}

const NO_TAGS: ReadonlyArray<string> = []

/** The tags other orders use, offered while typing one (`Orders.tags`). */
export function useKnownOrderTags(): ReadonlyArray<string> {
  const result = useAtomValue(orderTagsAtom)
  const counts = Option.getOrUndefined(AsyncResult.value(result))
  return useMemo(() => counts?.map((c) => c.tag) ?? NO_TAGS, [counts])
}

/** Every order command, as the screens call them. */
export function useOrderCommands() {
  const keys = { reactivityKeys: ORDERS }
  const write = {
    tag: useAtomSet(orderWrites.tag, { mode: "promiseExit" }),
    markFulfilled: useAtomSet(orderWrites.markFulfilled, { mode: "promiseExit" }),
    updateShipping: useAtomSet(orderWrites.updateShipping, { mode: "promiseExit" }),
    cancel: useAtomSet(orderWrites.cancel, { mode: "promiseExit" }),
    setNote: useAtomSet(orderWrites.setNote, { mode: "promiseExit" }),
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
      const add = tags.filter((t) => !order.tags.includes(t))
      const remove = order.tags.filter((t) => !tags.includes(t))
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
    cancel: async (order: Order) =>
      said(
        await write.cancel({ payload: { ids: [order.id], restock: true, notify: true }, ...keys }),
        `${order.number} geannuleerd`
      ),
    saveNote: async (order: Order, body: string) => {
      const exit = await write.setNote({ payload: { id: order.id, body }, ...keys })
      if (Exit.isFailure(exit)) return orderRefused(failureOf(exit))
      toast.success(body.trim() === "" ? "Notitie verwijderd" : "Notitie opgeslagen")
    }
  }
}
