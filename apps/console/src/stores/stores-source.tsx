import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Level } from "@insyte/domain/Permissions"
import type { StoreView } from "@insyte/modules/stores/domain/Stores"
import { permissionName } from "@insyte/ui/app/lib/permissions"
import { ConnectStoreFlow, type ConnectStoreProps } from "@insyte/ui/app/shops/connect-store-flow"
import type { StoreRow, StoresSource } from "@insyte/ui/app/shops/source"
import { Cause, Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { toast } from "sonner"
import { LIVE, liveWrites, pixelsAtom } from "../data/live.ts"
import { STORES, storeWrites } from "../data/stores.ts"

/*
 * Winkels' source in the console: `Stores.list` as the screen reads it, connecting as `Stores.beginConnect` (the browser
 * goes to Shopify's approval page and comes back through the API's callback, `routes/_frame.settings.stores.tsx`), and
 * disconnecting as `Stores.disconnect`. A disconnect drops the token, so it has no undo: the row connects again. A
 * refusal is said once, in Dutch. A connected store's Live pixel (M14 step 3) is installed or repaired from its menu as
 * `Live.installPixel`, where this environment can (`Live.pixels`).
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
    case "PixelInstallFailed":
      return void (tagged["reason"] === "scope"
        ? toast.error("Keur eerst de nieuwe rechten goed in Shopify", {
          description: "Koppel de winkel opnieuw, dan vraagt Shopify toestemming voor Live."
        })
        : tagged["reason"] === "unavailable"
        ? toast.error("Live kan hier nog niet worden aangezet")
        : tagged["reason"] === "busy"
        ? toast.error("Live wordt al aangezet", { description: "Wacht even en kijk dan opnieuw." })
        : toast.error("Shopify zette Live niet aan", { description: "Probeer het zo nog eens." }))
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

/**
 * Sends the browser to Shopify's approval page for `domain`, coming back to `returnPath`; resolves only when it could
 * not (and said why).
 */
export function useBeginConnect(returnPath: string) {
  const begin = useAtomSet(storeWrites.beginConnect, { mode: "promiseExit" })
  return async (domain: string): Promise<void> => {
    const started = await run(begin({ payload: { shopDomain: domain, returnPath } }))
    if (started !== undefined) window.location.assign(started.authorizeUrl)
  }
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

export function useConsoleStoresSource(stores: ReadonlyArray<StoreView>): StoresSource {
  const disconnect = useAtomSet(storeWrites.disconnect, { mode: "promiseExit" })
  const install = useAtomSet(liveWrites.installPixel, { mode: "promiseExit" })
  // Read in the browser; a role that may not see them, or an environment without the pixel, offers no Live item.
  const pixels = Option.getOrUndefined(AsyncResult.value(useAtomValue(pixelsAtom)))
  const pixelOf = (id: string) => pixels?.pixels.find((p) => p.storeId === id)?.state
  return {
    stores: stores.map((s) => ({ ...rowOf(s), livePixel: pixelOf(s.id) })),
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
