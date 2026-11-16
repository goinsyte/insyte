import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { WebchatStores } from "@insyte/modules/inbox/domain/Ports"
import { mutate } from "@insyte/modules/stores/domain/Gate"
import { ConnectionGate, ShopifyGraphql } from "@insyte/modules/stores/domain/Ports"
import { Config, Effect, Layer } from "effect"

/*
 * The website chat → Shopify (M15 step 8): the storefront's primary domain, read through the stores slice's gate as
 * Live's pixel install reads it, and the theme editor's deep link that turns the app's chat embed on
 * (`shopify/extensions/insyte-chat`, block `chat`). Shopify's link names the app by its client id, which is public.
 */

const PRIMARY_DOMAIN = `query { shop { primaryDomain { url } } }`
/** The app embed block's file name in the theme app extension. */
const EMBED_HANDLE = "chat"

const originOf = (url: string | undefined): string | null => {
  if (url === undefined) return null
  try {
    return new URL(url).origin.toLowerCase()
  } catch {
    return null
  }
}

export const WebchatStoresLive = Layer.effect(
  WebchatStores,
  Effect.gen(function*() {
    const gate = yield* ConnectionGate
    const graphql = yield* ShopifyGraphql
    const clientId = yield* Config.String("SHOPIFY_CLIENT_ID").pipe(Config.withDefault(""))
    return WebchatStores.of({
      primaryOrigin: (store) =>
        mutate({ connectionId: store.connectionId, shop: store.shopDomain }, PRIMARY_DOMAIN, {}, "shop").pipe(
          Effect.map((answer) =>
            originOf((answer.data as { shop?: { primaryDomain?: { url?: string } } } | null)?.shop?.primaryDomain?.url)
          ),
          Effect.provideService(CurrentWorkspace, { id: store.workspaceId as WorkspaceId }),
          Effect.provideService(ConnectionGate, gate),
          Effect.provideService(ShopifyGraphql, graphql),
          // Without Shopify's word the myshopify domain is the only origin, until the next connect.
          Effect.catchCause(() => Effect.succeed(null))
        ),
      embedUrl: (shop) => {
        const base = `https://${shop}/admin/themes/current/editor?context=apps`
        return clientId === "" ? base : `${base}&activateAppId=${encodeURIComponent(`${clientId}/${EMBED_HANDLE}`)}`
      }
    })
  })
)
