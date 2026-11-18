import { Db } from "@insyte/database/Db"
import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"

/*
 * A click on an affiliate's link (M16 step 4), before any principal: `affiliate_click` (0105) finds the link by its
 * slug, writes the click in the link's workspace (the address and the browser only as the day's keyed hashes) and
 * answers where to send the visitor: the store's own address, the link's own path and tags, never anything the
 * request named. An unknown slug, or a programme without a store, is nothing.
 */

export interface Landing {
  readonly location: string
}

const SLUG = /^[a-z0-9]{8,16}$/

export const click = Effect.fn("Affiliates.click")(function*(input: {
  readonly slug: string
  readonly ipHash: Uint8Array | null
  readonly uaHash: Uint8Array | null
  readonly country: string | null
}) {
  if (!SLUG.test(input.slug)) return undefined
  const db = yield* Db
  const [row] = yield* db.routing((sql) =>
    sql<{ baseUrl: string; path: string; campaign: string; medium: string; slug: string }>`
      select base_url, path, campaign, medium, slug
      from affiliate_click(${input.slug}, ${mintId("acl")}, ${input.ipHash}, ${input.uaHash}, ${input.country})`
  ).pipe(Effect.orDie)
  if (row === undefined) return undefined
  return { location: landingUrl(row) } satisfies Landing
})

/**
 * The store's page with the link's tags. Only an `https:` origin of the store is a base, and the path is joined to that
 * origin alone, so no path can lead elsewhere (`//evil.example` is a path on the store).
 */
export const landingUrl = (row: {
  readonly baseUrl: string
  readonly path: string
  readonly campaign: string
  readonly medium: string
  readonly slug: string
}) => {
  const base = new URL(row.baseUrl)
  if (base.protocol !== "https:") throw new Error("a store's address is https")
  const url = new URL(base.origin)
  url.pathname = row.path.startsWith("/") ? row.path.replace(/^\/+/, "/") : `/${row.path}`
  url.searchParams.set("utm_source", "insyte")
  url.searchParams.set("utm_medium", row.medium)
  url.searchParams.set("utm_campaign", row.campaign)
  url.searchParams.set("insyte_ref", row.slug)
  if (url.origin !== base.origin) throw new Error("a link lands on its store")
  return url.toString()
}
