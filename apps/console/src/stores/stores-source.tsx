import { useAtomSet } from "@effect/atom-react"
import type { Level } from "@insyte/domain/Permissions"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { permissionName } from "@insyte/ui/app/lib/permissions"
import { ConnectStoreFlow, type ConnectStoreProps } from "@insyte/ui/app/shops/connect-store-flow"
import type { StoreRow, StoresSource } from "@insyte/ui/app/shops/source"
import { Cause, Exit } from "effect"
import { toast } from "sonner"
import { STORES, storeWrites } from "../data/stores.ts"

/*
 * Winkels' source in the console: `Stores.list` as the screen reads it, connecting as `Stores.beginConnect` (the browser
 * goes to Shopify's approval page and comes back through the API's callback, `routes/_frame.settings.stores.tsx`), and
 * disconnecting as `Stores.disconnect`. A disconnect drops the token, so it has no undo: the row connects again. A
 * refusal is said once, in Dutch.
 */

/** Where Shopify sends the person back to once they approved. */
const RETURN = "/settings/stores"

const rowOf = (s: StoreView): StoreRow => ({
  id: s.id,
  name: s.name,
  domain: s.shopDomain,
  currency: s.currency ?? "",
  // "Actie nodig" until the incidents arrive (M6.4): the store must be connected again, as a disconnected one.
  status: s.status === "connected" || s.status === "connecting" ? s.status : "disconnected"
})

const refused = (error: unknown) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  switch (tagged._tag) {
    case "Forbidden":
      return void toast.error("Dat kan je rol niet", {
        description: `Je rol ${tagged["roleLabel"]} mist ${permissionName("settings", tagged["level"] as Level)}.`
      })
    case "ShopNotFound":
      return void toast.error("Die winkel bestaat niet", {
        description: `Shopify kent ${tagged["shopDomain"]} niet. Controleer het adres.`
      })
    case "ShopifyUnavailable":
      return void toast.error("Koppelen met Shopify kan hier nog niet")
    case "NotFound":
      return void toast.error("Die winkel is er niet meer")
    default:
      return void toast.error("Dat lukte niet", { description: "Probeer het zo nog eens." })
  }
}

async function run<A>(write: Promise<Exit.Exit<A, unknown>>): Promise<A | undefined> {
  const exit = await write
  if (Exit.isSuccess(exit)) return exit.value
  const failure = exit.cause.reasons.find((r) => r._tag === "Fail")
  refused(failure === undefined ? Cause.squash(exit.cause) : failure.error)
  return undefined
}

/** The dialog in the console: approving sends the browser to Shopify; a refusal stays and says why. */
function ConsoleConnectStore(props: ConnectStoreProps) {
  const begin = useAtomSet(storeWrites.beginConnect, { mode: "promiseExit" })
  return (
    <ConnectStoreFlow
      {...props}
      handoff
      connect={async (domain) => {
        const started = await run(begin({ payload: { shopDomain: domain, returnPath: RETURN } }))
        if (started !== undefined) window.location.assign(started.authorizeUrl)
        return undefined
      }}
    />
  )
}

export function useConsoleStoresSource(stores: ReadonlyArray<StoreView>): StoresSource {
  const disconnect = useAtomSet(storeWrites.disconnect, { mode: "promiseExit" })
  return {
    stores: stores.map(rowOf),
    // One store per workspace until the store switch is live: the connected one is the one in view.
    activeId: stores.find((s) => s.status === "connected")?.id ?? null,
    disconnect: async (id) => (await run(disconnect({ payload: { id }, reactivityKeys: STORES }))) !== undefined,
    Connect: ConsoleConnectStore
  }
}
