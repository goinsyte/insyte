import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Frame } from "@insyte/api/rpc/ShellRpcs"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import type { ShellSource } from "@insyte/ui/app/shell/source"
import { ConnectStoreFlow, type ConnectStoreProps } from "@insyte/ui/app/shops/connect-store-flow"
import { useMemo } from "react"
import type { StoreChoice } from "../data/in-view.ts"
import { chosenStoreAtom, viewStoreAtom } from "../data/store-view.ts"
import { useBeginConnect } from "../stores/begin-connect.ts"
import { usePrefSection } from "./prefs.ts"

/*
 * The top bar's store switch in the console (M6 multi-store): the stores the member reaches, from the frame, and
 * "Alle winkels" when they reach more than one. A switch counts at once in this tab (`chosenStoreAtom`) and is kept as
 * the member's `store` preference, so the next visit opens on the same store. Every store-bound read follows the store
 * in view (`data/store-view.ts`). Connecting another store from the menu is Shopify's approval, as on Winkels, and comes
 * back there.
 */

type ActiveStore = ShellSource["activeStore"]["stores"][number]

const EVERY: StoreChoice = { id: null }

/** Where Shopify sends the person back to once they approved: Winkels says the store is in. */
const RETURN = "/settings/stores"

const activeOf = (s: StoreView): ActiveStore => ({
  id: s.id,
  name: s.name,
  domain: s.shopDomain,
  currency: s.currency ?? "",
  connected: s.status === "connected",
  // A store that needs connecting again is offered that, as a disconnected one.
  status: s.status === "connected" || s.status === "connecting" ? s.status : "disconnected"
})

/** The design's store switch over the frame's stores and the store in view. */
export function useConsoleActiveStore(frame: Frame): ShellSource["activeStore"] {
  const [, save] = usePrefSection<StoreChoice>(frame, "store", EVERY)
  const choose = useAtomSet(chosenStoreAtom)
  const inView = useAtomValue(viewStoreAtom)
  const stores = useMemo(() => frame.stores.map(activeOf), [frame.stores])
  const pick = (choice: StoreChoice) => {
    choose(choice)
    save(choice)
  }
  return {
    stores,
    // Every store at once is none of them, unless there is only the one.
    active: stores.length === 1 ? stores[0] : stores.find((s) => s.id === inView),
    setActive: (id) => pick({ id }),
    viewAll: () => pick(EVERY)
  }
}

/** Connecting another store from the store menu: the browser goes to Shopify's approval page. */
export function ShellConnectStore(props: ConnectStoreProps) {
  const begin = useBeginConnect(RETURN)
  return (
    <ConnectStoreFlow
      {...props}
      handoff
      connect={async (domain) => {
        await begin(domain)
        return undefined
      }}
    />
  )
}
