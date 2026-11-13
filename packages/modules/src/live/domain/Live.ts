import { Schema } from "effect"

/*
 * Live (M14 step 3; widgets/02 Part B `/live`, domain.md §10.3): who is on the store right now. Visitors are anonymised
 * sessions held in memory by the workspace's live room, never rows: a hashed client id, the city and country Cloudflare
 * reads from the request, the page they look at, where they came from, the stage they are in. The two money figures
 * ("Gekocht, laatste 10 min", "Omzet vandaag") and the sales in the feed are real orders, in minor units of the
 * workspace currency, converted at the order day's `fx_rates` row as Start's figures are.
 */

/** Where a visitor is in the funnel. */
export const Stage = Schema.Literals(["browsing", "cart", "checkout", "bought"])
export type Stage = typeof Stage.Type

export const Device = Schema.Literals(["mobiel", "desktop"])
export type Device = typeof Device.Type

/** One visitor on a store: anonymised, in memory only (ADR-0013's one exception: the frame carries this). */
export const LiveVisitor = Schema.Struct({
  /** The keyed hash of the store and Shopify's client id, shortened: stable for the visit, never the client id. */
  id: Schema.String,
  storeId: Schema.String,
  city: Schema.String,
  /** ISO 3166-1 alpha-2, as Cloudflare reads it; the console names it in Dutch. */
  country: Schema.String,
  lon: Schema.Finite,
  lat: Schema.Finite,
  /** "Meta ads", "Google", "Instagram", "Klaviyo", "Direct", or the referring site's host. */
  source: Schema.String,
  device: Device,
  stage: Stage,
  /** The page's or the product's title. */
  page: Schema.String,
  arrivedAt: Schema.Finite,
  /** When the stage last changed (the map's ping). */
  movedAt: Schema.Finite,
  returning: Schema.Boolean
})
export type LiveVisitor = typeof LiveVisitor.Type

/** Something a visitor did that the feed says: arriving, putting something in the cart, starting the checkout. */
export const LiveEvent = Schema.Struct({
  id: Schema.String,
  at: Schema.Finite,
  kind: Schema.Literals(["arrive", "cart", "checkout"]),
  visitor: LiveVisitor
})
export type LiveEvent = typeof LiveEvent.Type

/** A sale in the feed: the real order, not the pixel's word for it. */
export const LiveSale = Schema.Struct({
  orderId: Schema.String,
  number: Schema.String,
  /** In the workspace currency; `null` when the order's currency has no rate for its day. */
  totalMinor: Schema.NullOr(Schema.Finite),
  city: Schema.NullOr(Schema.String),
  country: Schema.NullOr(Schema.String),
  at: Schema.Finite
})
export type LiveSale = typeof LiveSale.Type

/**
 * Whether Live can show anything: no connected store in the role's scope, stores but no pixel installed on any, or at
 * least one store with the pixel.
 */
export const PixelState = Schema.Literals(["no_store", "not_installed", "installed"])
export type PixelState = typeof PixelState.Type

/** What `/live` reads when it opens, and again after the socket comes back. */
export class LiveSnapshot extends Schema.Class<LiveSnapshot>("live/LiveSnapshot")({
  pixel: PixelState,
  /** The stores in scope whose pixel is installed: the header's "Northwind US en EU". */
  stores: Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String })),
  visitors: Schema.Array(LiveVisitor),
  /** The last pixel events, newest first (at most 60). */
  events: Schema.Array(LiveEvent),
  /** Orders placed in the last hour, newest first (at most 20): the feed's sales. */
  sales: Schema.Array(LiveSale),
  boughtLast10m: Schema.Int,
  revenueToday: Schema.Struct({
    minor: Schema.Finite,
    currency: Schema.String,
    /** Orders today left out because their currency had no rate. */
    unconverted: Schema.Int
  }),
  /** The server's clock, so the console's "zojuist" does not depend on the laptop's. */
  at: Schema.Finite
}) {}

/** A tab's subscription to the room's frames: its realtime socket's tab id. */
export const LiveTab = Schema.Struct({ tab: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{8,64}$/)) })
export type LiveTab = typeof LiveTab.Type

export const LiveLease = Schema.Struct({ leaseSeconds: Schema.Int })

/* ── the pixel ─────────────────────────────────────────────────────────────────────────────────── */

/** The Web Pixel's events that move a visitor (the Shopify standard events of the same names). */
export const PixelEventType = Schema.Literals([
  "page_viewed",
  "product_viewed",
  "product_added_to_cart",
  "checkout_started",
  "checkout_completed"
])
export type PixelEventType = typeof PixelEventType.Type

const Short = (max: number) => Schema.String.check(Schema.isMaxLength(max))

/**
 * What the pixel posts (`shopify/extensions/insyte-live`): the event, Shopify's client id (hashed on arrival, never
 * kept), a title, and the hints the source is told from. No address, no email, no IP in the body: Cloudflare's geo
 * comes from the request, and the IP only counts against the rate limit.
 */
export const PixelEvent = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(16), Schema.isMaxLength(128)),
  type: PixelEventType,
  clientId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  /** The document's title, or the product's. */
  page: Short(200),
  source: Schema.Struct({
    utmSource: Schema.optional(Short(80)),
    utmMedium: Schema.optional(Short(80)),
    /** A click id on the landing URL: Meta's `fbclid` or Google's `gclid`. */
    clickId: Schema.optional(Schema.Literals(["fb", "g"])),
    /** The referring site's host only. */
    referrer: Schema.optional(Short(200))
  }),
  device: Device,
  returning: Schema.Boolean
})
export type PixelEvent = typeof PixelEvent.Type

/** A pixel event as the room takes it: hashed, located, its source named. */
export interface PixelHit {
  readonly storeId: string
  readonly visitorId: string
  readonly type: PixelEventType
  readonly city: string
  readonly country: string
  readonly lon: number
  readonly lat: number
  readonly source: string
  readonly device: Device
  readonly page: string
  readonly returning: boolean
  readonly at: number
}

/** A store's pixel, for Instellingen → Winkels. */
export const StorePixel = Schema.Struct({
  storeId: Schema.String,
  state: Schema.Literals(["none", "installed"]),
  installedAt: Schema.NullOr(Schema.Finite),
  lastEventAt: Schema.NullOr(Schema.Finite)
})
export type StorePixel = typeof StorePixel.Type

export class StorePixels extends Schema.Class<StorePixels>("live/StorePixels")({
  /** Whether this environment can install a pixel at all (a public API host and Shopify's app). */
  available: Schema.Boolean,
  pixels: Schema.Array(StorePixel)
}) {}

export const InstallPixel = Schema.Struct({ storeId: Schema.String })

/**
 * Shopify would not install the pixel: the store has not granted the pixel scopes, or Shopify refused; or another
 * install of the same store's pixel is running (`busy`).
 */
export class PixelInstallFailed extends Schema.TaggedError<PixelInstallFailed>()("PixelInstallFailed", {
  reason: Schema.Literals(["unavailable", "scope", "shopify", "busy"]),
  message: Schema.String
}) {}
