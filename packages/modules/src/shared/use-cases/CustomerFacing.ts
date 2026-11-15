import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  buttonColorOf,
  fillLinks,
  linksOf,
  logoFileOf,
  logoPath,
  type Look,
  NO_LOOK,
  parcelStatusOf,
  type ShipStatusId,
  type Worded,
  wordingFor
} from "../domain/CustomerFacing.ts"

/*
 * What a shopper sees of the settings pages (M17 step 20.1b), read on the caller's transaction in its workspace's
 * scope: the one place a tracking mail, a reply, a shopper's mail and the returns portal learn Verzending's wording,
 * Sjablonen' links and Huisstijl's colour and logo (`domain/CustomerFacing.ts`). A section never saved answers what a
 * new workspace starts from: the default wording, no links, Insyte's own look. The sections are the workspace's, not a
 * store's, so every store of it reads the same.
 */

const section = (sql: SqlClient.SqlClient, name: "shipping" | "links" | "brand") =>
  Effect.map(
    sql<{ value: unknown }>`select value from workspace_settings where section = ${name}`,
    (rows) => rows[0]?.value
  )

/** Verzending's wording as saved: a parcel's sentence by its status and carrier. */
export const wordings = Effect.fn("CustomerFacing.wordings")(function*(sql: SqlClient.SqlClient) {
  const stored = yield* section(sql, "shipping")
  return (status: ShipStatusId, carrier: string | null): Worded => wordingFor(stored, status, carrier)
})

/**
 * Verzending's sentence for the newest parcel under `trackingNumber` of an order: its status as AfterShip, or else
 * Shopify, last said it.
 */
export const parcelWording = Effect.fn("CustomerFacing.parcelWording")(function*(
  sql: SqlClient.SqlClient,
  orderId: string,
  trackingNumber: string
) {
  const [parcel] = yield* sql<{ carrier: string | null; tracked: string | null; shopify: string | null }>`
    select f.carrier, d.status as tracked, f.tracking_status as shopify
    from fulfilments f left join deliveries d on d.fulfilment_id = f.id
    where f.order_id = ${orderId} and f.tracking_number = ${trackingNumber}
    order by f.shipped_at desc nulls last, f.id desc limit 1`
  if (parcel === undefined) return undefined
  return (yield* wordings(sql))(parcelStatusOf(parcel.tracked, parcel.shopify), parcel.carrier)
})

/** The team's words with Sjablonen' links in (an empty link takes its sentence out). */
export const withLinks = Effect.fn("CustomerFacing.withLinks")(function*(sql: SqlClient.SqlClient, text: string) {
  if (!text.includes("_link}")) return text
  return fillLinks(text, linksOf(yield* section(sql, "links")))
})

/** Huisstijl as a shopper's mail and the returns portal show it; the logo only while its file is there. */
export const look = Effect.fn("CustomerFacing.look")(function*(sql: SqlClient.SqlClient) {
  const stored = yield* section(sql, "brand")
  if (stored === undefined) return NO_LOOK
  const fileId = logoFileOf(stored)
  const [logo] = fileId === null ? [] : yield* sql<{ workspaceId: string }>`
    select workspace_id from files where id = ${fileId} and kind = 'logo' and deleted_at is null`
  return {
    color: buttonColorOf(stored),
    logoPath: logo === undefined || fileId === null ? null : logoPath(logo.workspaceId, fileId)
  } satisfies Look
})
