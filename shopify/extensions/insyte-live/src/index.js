import { register } from "@shopify/web-pixels-extension"

/*
 * Live's Web Pixel (M14 step 3). For each of Shopify's standard events that moves a visitor through the store, one small
 * POST to the Insyte API with the store's ingest key: the event, Shopify's client id (hashed by Insyte on arrival and
 * never kept), the page's or product's title, where the visitor came from (the UTM source and medium, whether a Meta or
 * Google click id was on the URL, the referring site's host), the device kind, and whether this browser was here
 * before. Nothing else: no address, no email, no cart contents, no full URL. Shopify loads it only for visitors who
 * allowed analytics.
 */

const SEEN = "insyte_live_seen"

const sourceOf = (event) => {
  const doc = event.context?.document
  const params = new URLSearchParams(doc?.location?.search ?? "")
  const source = {}
  const utmSource = params.get("utm_source")
  const utmMedium = params.get("utm_medium")
  if (utmSource) source.utmSource = utmSource.slice(0, 80)
  if (utmMedium) source.utmMedium = utmMedium.slice(0, 80)
  if (params.has("fbclid")) source.clickId = "fb"
  else if (params.has("gclid")) source.clickId = "g"
  try {
    if (doc?.referrer) source.referrer = new URL(doc.referrer).host.slice(0, 200)
  } catch {
    // A referrer that is no URL says nothing.
  }
  return source
}

const deviceOf = (event) =>
  /Mobi|Android|iPhone|iPad/i.test(event.context?.navigator?.userAgent ?? "") ? "mobiel" : "desktop"

register(({ analytics, browser, settings }) => {
  const { storeId, ingestKey, endpoint } = settings
  if (!storeId || !ingestKey || !endpoint) return

  let returning = null
  const wasHere = async () => {
    if (returning !== null) return returning
    try {
      returning = (await browser.localStorage.getItem(SEEN)) === "1"
      await browser.localStorage.setItem(SEEN, "1")
    } catch {
      returning = false
    }
    return returning
  }

  const send = async (type, event, page) => {
    const body = JSON.stringify({
      key: ingestKey,
      type,
      clientId: event.clientId,
      page: String(page ?? event.context?.document?.title ?? "").slice(0, 200),
      source: sourceOf(event),
      device: deviceOf(event),
      returning: await wasHere()
    })
    try {
      // `text/plain` keeps it a simple request: no preflight before every page view.
      await fetch(endpoint, { method: "POST", body, keepalive: true, headers: { "content-type": "text/plain" } })
    } catch {
      // Live is a view, not a record: a lost event is a visitor seen a moment later.
    }
  }

  analytics.subscribe("page_viewed", (event) => send("page_viewed", event))
  analytics.subscribe(
    "product_viewed",
    (event) => send("product_viewed", event, event.data?.productVariant?.product?.title)
  )
  analytics.subscribe(
    "product_added_to_cart",
    (event) => send("product_added_to_cart", event, event.data?.cartLine?.merchandise?.product?.title)
  )
  analytics.subscribe("checkout_started", (event) => send("checkout_started", event))
  analytics.subscribe("checkout_completed", (event) => send("checkout_completed", event))
})
