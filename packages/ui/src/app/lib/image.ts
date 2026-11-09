/*
 * A photograph at the size it is shown: the image CDNs Insyte reads from resize on request, so a 48 px thumbnail
 * downloads a 96 px image (twice, for sharp screens) instead of the original. Shopify's CDN takes `width`, Unsplash's
 * `w`; any other address is left as it is.
 */
export function sizedImage(url: string, cssPixels: number): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const width = String(Math.ceil(cssPixels * 2))
  if (parsed.hostname === "cdn.shopify.com" || parsed.hostname.endsWith(".myshopify.com")) {
    parsed.searchParams.set("width", width)
    return parsed.toString()
  }
  if (parsed.hostname === "images.unsplash.com") {
    parsed.searchParams.set("w", width)
    return parsed.toString()
  }
  return url
}
