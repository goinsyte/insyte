import { useAtomSet } from "@effect/atom-react"
import type { Level } from "@insyte/domain/Permissions"
import { permissionName } from "@insyte/ui/app/lib/permissions"
import { Cause, Exit } from "effect"
import { toast } from "sonner"
import { storeWrites } from "../data/stores.ts"

/*
 * Connecting a store from the console: the way to Shopify's approval page, and what a refused store write says. Apart
 * from the stores page's source, so Start's reconnect plate does not carry that page into the dashboard's chunk.
 */

/** What a refusal can offer besides saying why: connecting the store again, when Shopify must approve new rights. */
interface Offers {
  readonly reconnect?: (() => void) | undefined
}

/** What a refused store write says, as a toast. */
const refused = (error: unknown, offers: Offers) => {
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
          description: "Koppel de winkel opnieuw, dan vraagt Shopify toestemming voor Live.",
          ...(offers.reconnect === undefined
            ? {}
            : { action: { label: "Opnieuw koppelen", onClick: offers.reconnect } })
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

/** A store write's value, or `undefined` once its refusal was said. */
export async function run<A>(write: Promise<Exit.Exit<A, unknown>>, offers: Offers = {}): Promise<A | undefined> {
  const exit = await write
  if (Exit.isSuccess(exit)) return exit.value
  const failure = exit.cause.reasons.find((r) => r._tag === "Fail")
  refused(failure === undefined ? Cause.squash(exit.cause) : failure.error, offers)
  return undefined
}

/**
 * Sends the browser to Shopify's approval page for `domain`, coming back to `returnPath`; resolves only when it could
 * not (and said why).
 */
export function useBeginConnect(returnPath: string) {
  const begin = useAtomSet(storeWrites.beginConnect, { mode: "promiseExit" })
  return async (domain: string): Promise<void> => {
    const started = await run(begin({ payload: { shopDomain: domain, returnPath } }))
    if (started === undefined) return
    window.location.assign(started.authorizeUrl)
    // The page is leaving for Shopify: nothing here goes back to idle meanwhile.
    return new Promise<never>(() => {})
  }
}
