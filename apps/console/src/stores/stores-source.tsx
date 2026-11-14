import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { ConnectStoreFlow, type ConnectStoreProps } from "@insyte/ui/app/shops/connect-store-flow"
import type { StoreRow, StoresSource } from "@insyte/ui/app/shops/source"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { toast } from "sonner"
import { LIVE, liveWrites, pixelsAtom } from "../data/live.ts"
import { healthAtom, STORES, storeWrites } from "../data/stores.ts"
import { run, useBeginConnect } from "./begin-connect.ts"
import { storeHealthOf } from "./health-of.ts"

/*
 * Winkels' source in the console: `Stores.list` as the screen reads it, connecting as `Stores.beginConnect` (the browser
 * goes to Shopify's approval page and comes back through the API's callback, `routes/_frame.settings.stores.tsx`), and
 * disconnecting as `Stores.disconnect`. A disconnect drops the token, so it has no undo: the row connects again. A
 * refusal is said once, in Dutch. A connected store's Live pixel (M14 step 3) is installed or repaired from its menu as
 * `Live.installPixel`, where this environment can (`Live.pixels`). Each row's sync health is `Connections.health` (M17
 * step 6), with the incidents open on it and what Insyte already tried; a role that may not read it sees the rows
 * without.
 */

/** Where Shopify sends the person back to once they approved. */
const RETURN = "/settings/stores"

const rowOf = (s: StoreView): StoreRow => ({
  id: s.id,
  name: s.name,
  domain: s.shopDomain,
  currency: s.currency ?? "",
  // A store that needs connecting again is offered that, as a disconnected one; its health says why (M17 step 6).
  status: s.status === "connected" || s.status === "connecting" ? s.status : "disconnected"
})

/** Why a connection came back without a store, as the callback names it. */
const NOT_CONNECTED: Record<string, { title: string; description: string }> = {
  elsewhere: {
    title: "Deze winkel hangt aan een andere werkruimte",
    description: "Ontkoppel hem daar eerst, dan kun je hem hier koppelen."
  },
  shop: { title: "Shopify gaf een andere winkel terug", description: "Probeer het opnieuw met hetzelfde adres." }
}
const FAILED = { title: "Koppelen is niet gelukt", description: "Probeer het opnieuw." }

/** Says, once, why Shopify's way back brought no store. */
export const notConnected = (error: string) => {
  const said = NOT_CONNECTED[error] ?? FAILED
  toast.error(said.title, { description: said.description })
}

/** The dialog in the console: approving sends the browser to Shopify; a refusal stays and says why. */
function ConsoleConnectStore(props: ConnectStoreProps) {
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

export function useConsoleStoresSource(stores: ReadonlyArray<StoreView>, focusId?: string): StoresSource {
  const disconnect = useAtomSet(storeWrites.disconnect, { mode: "promiseExit" })
  const install = useAtomSet(liveWrites.installPixel, { mode: "promiseExit" })
  // Read in the browser; a role that may not see them, or an environment without the pixel, offers no Live item.
  const pixels = Option.getOrUndefined(AsyncResult.value(useAtomValue(pixelsAtom)))
  const pixelOf = (id: string) => pixels?.pixels.find((p) => p.storeId === id)?.state
  const health = Option.getOrUndefined(AsyncResult.value(useAtomValue(healthAtom)))
  const healthOf = (id: string) => {
    const connection = health?.connections.find((c) => c.storeId === id)
    return connection === undefined ? undefined : storeHealthOf(connection)
  }
  return {
    stores: stores.map((s) => ({ ...rowOf(s), livePixel: pixelOf(s.id), health: healthOf(s.id) })),
    focusId,
    installPixel: pixels?.available === true
      ? async (storeId) =>
        (await run(install({ payload: { storeId }, reactivityKeys: [...LIVE, ...STORES] }))) !== undefined
      : undefined,
    // One store per workspace until the store switch is live: the connected one is the one in view.
    activeId: stores.find((s) => s.status === "connected")?.id ?? null,
    disconnect: async (id) => (await run(disconnect({ payload: { id }, reactivityKeys: STORES }))) !== undefined,
    Connect: ConsoleConnectStore
  }
}
