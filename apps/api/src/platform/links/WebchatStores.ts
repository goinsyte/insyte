import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { WebchatStores } from "@insyte/modules/inbox/domain/Ports"
import { mutate } from "@insyte/modules/stores/domain/Gate"
import { ConnectionGate, ShopifyGraphql } from "@insyte/modules/stores/domain/Ports"
import { Config, Effect, Layer } from "effect"

/*
 * The website chat → Shopify (M15 step 8): the storefront's primary domain, read through the stores slice's gate as
 * Live's pixel install reads it; this stage's public API origin (`PUBLIC_API_HOST`) in the app installation's own
 * metafield, which the app embed (`shopify/extensions/insyte-chat`, block `chat`) loads the widget from, so each stage's
 * app points at its own API and a store without it shows no widget; and the theme editor's deep link that turns the
 * embed on. Shopify's link names the app by its client id, which is public. App-owned metafields need no scope.
 */

const PRIMARY_DOMAIN = `query { shop { primaryDomain { url } } }`
const APP_INSTALLATION = `query { currentAppInstallation { id } }`
const SET_METAFIELDS = `mutation SetMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } }
}`
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

type WebchatStore = { readonly workspaceId: string; readonly connectionId: string; readonly shopDomain: string }

export const WebchatStoresLive = Layer.effect(
  WebchatStores,
  Effect.gen(function*() {
    const gate = yield* ConnectionGate
    const graphql = yield* ShopifyGraphql
    const clientId = yield* Config.String("SHOPIFY_CLIENT_ID").pipe(Config.withDefault(""))
    const apiHost = yield* Config.String("PUBLIC_API_HOST").pipe(Config.withDefault(""))
    const through = <A, E>(
      store: WebchatStore,
      effect: Effect.Effect<A, E, ConnectionGate | ShopifyGraphql | CurrentWorkspace>
    ) =>
      effect.pipe(
        Effect.provideService(CurrentWorkspace, { id: store.workspaceId as WorkspaceId }),
        Effect.provideService(ConnectionGate, gate),
        Effect.provideService(ShopifyGraphql, graphql)
      )
    return WebchatStores.of({
      primaryOrigin: (store) =>
        through(
          store,
          mutate({ connectionId: store.connectionId, shop: store.shopDomain }, PRIMARY_DOMAIN, {}, "shop").pipe(
            Effect.map((answer) =>
              originOf(
                (answer.data as { shop?: { primaryDomain?: { url?: string } } } | null)?.shop?.primaryDomain?.url
              )
            )
          )
        ).pipe(
          // Without Shopify's word the myshopify domain is the only origin, until the next connect.
          Effect.catchCause(() => Effect.succeed(null))
        ),
      pointEmbed: (store) => {
        if (apiHost === "") return Effect.succeed(false)
        const target = { connectionId: store.connectionId, shop: store.shopDomain }
        return through(
          store,
          Effect.gen(function*() {
            const read = yield* mutate(target, APP_INSTALLATION, {}, "currentAppInstallation")
            const ownerId = (read.data as { currentAppInstallation?: { id?: string } } | null)?.currentAppInstallation
              ?.id
            if (ownerId === undefined) return false
            const metafields = [{
              ownerId,
              namespace: "insyte",
              key: "api_origin",
              type: "single_line_text_field",
              value: `https://${apiHost}`
            }]
            const set = yield* mutate(target, SET_METAFIELDS, { metafields }, "metafieldsSet")
            return set.errors.length === 0
          })
        ).pipe(Effect.catchCause(() => Effect.succeed(false)))
      },
      embedUrl: (shop) => {
        const base = `https://${shop}/admin/themes/current/editor?context=apps`
        return clientId === "" ? base : `${base}&activateAppId=${encodeURIComponent(`${clientId}/${EMBED_HANDLE}`)}`
      }
    })
  })
)
