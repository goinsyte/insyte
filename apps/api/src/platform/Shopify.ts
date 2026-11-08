import { ShopifyAdminLive } from "@insyte/integrations-shopify/ShopifyAdmin"
import { ShopifyGraphqlLive } from "@insyte/integrations-shopify/ShopifyGraphql"
import { ShopifyGraphqlRecorded, ShopifyRecorded } from "@insyte/integrations-shopify/ShopifyRecorded"
import type { ShopifyAdmin, ShopifyGraphql } from "@insyte/modules/stores/domain/Ports"
import { Config, Effect, Layer } from "effect"
import type { HttpClient } from "effect/http"

/*
 * Shopify (M6.2, M6.3): its recorded twin where the stage says `SHOPIFY_ADAPTER=recorded` (the worker tests), else the
 * Admin API. One choice for the install, the gate's refresh and the backfill's bulk operations.
 */

const recorded = Effect.map(
  Config.String("SHOPIFY_ADAPTER").pipe(Config.withDefault("shopify")),
  (a) => a === "recorded"
)

export const ShopifyAdminChoice = Layer.unwrap(
  Effect.map(
    recorded,
    (twin): Layer.Layer<ShopifyAdmin, Config.ConfigError, HttpClient.HttpClient> =>
      twin ? ShopifyRecorded : ShopifyAdminLive
  )
)

export const ShopifyGraphqlChoice = Layer.unwrap(
  Effect.map(
    recorded,
    (twin): Layer.Layer<ShopifyGraphql, Config.ConfigError, HttpClient.HttpClient> =>
      twin ? ShopifyGraphqlRecorded : ShopifyGraphqlLive
  )
)
