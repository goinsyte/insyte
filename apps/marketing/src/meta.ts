import { origin, site } from "./site.ts"

type Tag = Record<string, string>

/**
 * One helper that builds the title, the description, the canonical, Open Graph and Twitter together.
 *
 * Together, because they are the same three facts restated five times, and restating them by hand is
 * how a page ends up with an `og:title` from a previous version of itself. The legacy marketing
 * pages have none of this at all: no canonical, no `og:image`, no `twitter:card`.
 *
 * `path` is the route's own path, and the canonical is absolute against the intended production
 * origin rather than against the host that served the request — a preview deployment should point
 * search engines at the real page, not at itself.
 */
export const meta = (
  { description, image, path, title }: {
    readonly path: string
    readonly title: string
    readonly description: string
    /**
     * The share image, absolute against the production origin.
     *
     * Optional, and currently never passed. A missing `og:image` is a plain link preview; a
     * `og:image` that 404s is a broken one, and the mark this site would put in it is still an open
     * decision (`PRODUCT.md`: the legacy repo ships two). It arrives with the mark.
     */
    readonly image?: string
  }
  // Mutable arrays, because that is what the router's `head()` accepts; a `ReadonlyArray` here is a
  // type error at every call site rather than a safety.
): { meta: Array<Tag>; links: Array<Tag> } => {
  const url = `${origin}${path}`

  const share: Array<Tag> = image === undefined
    // `summary` rather than `summary_large_image`: the large card with no image is an empty box.
    ? [{ name: "twitter:card", content: "summary" }]
    : [
      { property: "og:image", content: `${origin}${image}` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: `${origin}${image}` }
    ]

  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },

      { property: "og:type", content: "website" },
      { property: "og:site_name", content: site.name },
      { property: "og:locale", content: site.ogLocale },
      { property: "og:url", content: url },
      { property: "og:title", content: title },
      { property: "og:description", content: description },

      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...share
    ],
    links: [{ rel: "canonical", href: url }]
  }
}
