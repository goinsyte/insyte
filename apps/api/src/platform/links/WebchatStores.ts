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
const DELETE_METAFIELDS = `mutation DeleteMetafields($metafields: [MetafieldIdentifierInput!]!) {
  metafieldsDelete(metafields: $metafields) { deletedMetafields { key } userErrors { field message } }
}`
const EMBED_FIELD = { namespace: "insyte", key: "api_origin" } as const
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
    /** A write on the app installation's own metafields: its id first, then the write; `false` on any failure. */
    const onInstallation = <E, R2>(
      store: WebchatStore,
      write: (
        target: { readonly connectionId: string; readonly shop: string },
        ownerId: string
      ) => Effect.Effect<boolean, E, R2>
    ) => {
      const target = { connectionId: store.connectionId, shop: store.shopDomain }
      return through(
        store,
        Effect.gen(function*() {
          const read = yield* mutate(target, APP_INSTALLATION, {}, "currentAppInstallation")
          const ownerId = (read.data as { currentAppInstallation?: { id?: string } } | null)?.currentAppInstallation?.id
          return ownerId === undefined ? false : yield* write(target, ownerId)
        }) as Effect.Effect<boolean, unknown, ConnectionGate | ShopifyGraphql | CurrentWorkspace>
      ).pipe(Effect.catchCause(() => Effect.succeed(false)))
    }
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
      pointEmbed: (store) =>
        apiHost === "" ? Effect.succeed(false) : onInstallation(store, (target, ownerId) =>
          Effect.map(
            mutate(target, SET_METAFIELDS, {
              metafields: [{ ownerId, ...EMBED_FIELD, type: "single_line_text_field", value: `https://${apiHost}` }]
            }, "metafieldsSet"),
            (set) => set.errors.length === 0
          )),
      clearEmbed: (store) =>
        onInstallation(store, (target, ownerId) =>
          Effect.map(
            mutate(target, DELETE_METAFIELDS, { metafields: [{ ownerId, ...EMBED_FIELD }] }, "metafieldsDelete"),
            (gone) => gone.errors.length === 0
          )),
      embedUrl: (shop) => {
        const base = `https://${shop}/admin/themes/current/editor?context=apps`
        return clientId === "" ? base : `${base}&activateAppId=${encodeURIComponent(`${clientId}/${EMBED_HANDLE}`)}`
      }
    })
  })
)
