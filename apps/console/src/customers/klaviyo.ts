import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { counted } from "@insyte/ui/app/lib/bulk-io"
import { undoable } from "@insyte/ui/app/lib/undo"
import { Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { CUSTOMERS } from "../data/customers.ts"
import { MARKETING, marketingListsAtom, marketingStatusAtom, marketingWrites } from "../data/marketing.ts"
import { failureOf, type RefusalCopy, sayRefusal } from "../frame/refusals.ts"

/*
 * Klaviyo in the console (M7.5): the design's sync dialog over `Marketing.*` and `Customers.syncToMarketing`. Opening
 * it asks for a dry run, so the dialog says who may go (only those who said yes to marketing, with an address of their
 * own); syncing keeps the send for the undo window, with "Ongedaan maken". Connecting leaves for Klaviyo's approval page
 * and comes back to the customers.
 */

const COPY: RefusalCopy = {
  gone: "Die klant bestaat niet meer",
  conflicts: {
    not_connected: ["Klaviyo is niet gekoppeld", "Koppel Klaviyo opnieuw; de koppeling is losgemaakt of verlopen."],
    not_configured: ["Klaviyo kan hier nog niet", "Deze omgeving heeft de Klaviyo-app nog niet."],
    unreachable: ["Klaviyo reageert niet", "Probeer het zo nog eens."]
  }
}

const refused = (error: unknown) => sayRefusal(error, COPY)

export interface Preview {
  readonly sendable: number
  readonly consent: number
  readonly email: number
}

const NO_LISTS: ReadonlyArray<{ id: string; name: string }> = []

export function useKlaviyo() {
  const status = Option.getOrUndefined(AsyncResult.value(useAtomValue(marketingStatusAtom)))
  const connected = status?.account !== null && status !== undefined
  const lists = Option.getOrUndefined(AsyncResult.value(useAtomValue(marketingListsAtom)))
  const write = {
    beginConnect: useAtomSet(marketingWrites.beginConnect, { mode: "promiseExit" }),
    sync: useAtomSet(marketingWrites.sync, { mode: "promiseExit" }),
    undo: useAtomSet(marketingWrites.undo, { mode: "promiseExit" })
  }
  const keys = { reactivityKeys: [...MARKETING, ...CUSTOMERS] }
  return {
    connected,
    lists: useMemo(() => (connected ? lists ?? NO_LISTS : NO_LISTS), [connected, lists]),
    /** Klaviyo's approval page, then back to the customers. */
    connect: async () => {
      const exit = await write.beginConnect({ payload: { returnPath: "/customers" } })
      if (Exit.isFailure(exit)) return refused(failureOf(exit))
      window.location.assign(exit.value.authorizeUrl)
    },
    /** Who of these may go, without sending anything. */
    preview: async (ids: ReadonlyArray<string>): Promise<Preview | undefined> => {
      const exit = await write.sync({
        payload: { ids: [...ids], listId: null, listName: "voorbeeld", withTags: false, dryRun: true }
      })
      if (Exit.isFailure(exit)) return undefined
      return { sendable: exit.value.sendable, ...exit.value.skipped }
    },
    sync: async (
      ids: ReadonlyArray<string>,
      list: { readonly id: string | null; readonly name: string },
      withTags: boolean
    ) => {
      const exit = await write.sync({
        payload: { ids: [...ids], listId: list.id, listName: list.name, withTags, dryRun: false },
        ...keys
      })
      if (Exit.isFailure(exit)) {
        refused(failureOf(exit))
        return false
      }
      const { undo, sendable } = exit.value
      if (undo !== null) {
        undoable(
          `${counted(sendable, "klant", "klanten")} naar ${list.name}`,
          () =>
            void write.undo({ payload: { token: undo.token }, ...keys }).then((u) => {
              if (Exit.isFailure(u)) refused(failureOf(u))
            }),
          "Klaviyo krijgt ze over een paar seconden."
        )
      }
      return true
    }
  }
}
