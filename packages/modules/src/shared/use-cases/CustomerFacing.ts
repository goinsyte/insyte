import { Invalid } from "@insyte/domain/Errors"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import {
  buttonColorOf,
  contactOf,
  fillLinks,
  lacksUnsubscribe,
  linksOf,
  logoFileOf,
  logoPath,
  type Look,
  NO_LOOK,
  NO_UNSUBSCRIBE,
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

/** Verzending's wording as saved: a parcel's sentence by its status and carrier; none while it was never saved. */
export const wordings = Effect.fn("CustomerFacing.wordings")(function*(sql: SqlClient.SqlClient) {
  const stored = yield* section(sql, "shipping")
  return (status: ShipStatusId, carrier: string | null): Worded => wordingFor(stored, status, carrier)
})

/**
 * Verzending's sentence for the newest parcel under `trackingNumber` of an order: its status as AfterShip, or else
 * Shopify, last said it. None while Verzending was never saved: a store that never chose its words sends the tracking
 * mail as it always did.
 */
export const parcelWording = Effect.fn("CustomerFacing.parcelWording")(function*(
  sql: SqlClient.SqlClient,
  orderId: string,
  trackingNumber: string
) {
  const stored = yield* section(sql, "shipping")
  if (stored === undefined) return undefined
  const [parcel] = yield* sql<
    { carrier: string | null; tracked: string | null; stage: string | null; shopify: string | null }
  >`
    select f.carrier, d.status as tracked, d.stage, f.tracking_status as shopify
    from fulfilments f left join deliveries d on d.fulfilment_id = f.id
    where f.order_id = ${orderId} and f.tracking_number = ${trackingNumber}
    order by f.shipped_at desc nulls last, f.id desc limit 1`
  if (parcel === undefined) return undefined
  return wordingFor(stored, parcelStatusOf(parcel.tracked, parcel.shopify, parcel.stage), parcel.carrier)
})

/**
 * Sjablonen' links, to put in the team's words (`texts`: all of one mail): an empty link takes what only led up to it
 * out, except the unsubscribe link, whose mail is refused while it is empty (`lacksUnsubscribe`).
 */
export const linkFiller = Effect.fn("CustomerFacing.linkFiller")(function*(
  sql: SqlClient.SqlClient,
  texts: ReadonlyArray<string>
) {
  const links = linksOf(yield* section(sql, "links"))
  if (lacksUnsubscribe(texts, links)) return yield* new Invalid({ fields: NO_UNSUBSCRIBE })
  return (text: string) => text.includes("_link}") ? fillLinks(text, links) : text
})

/** The team's words with Sjablonen' links in; refused where they ask for an unsubscribe link none is saved for. */
export const withLinks = Effect.fn("CustomerFacing.withLinks")(function*(sql: SqlClient.SqlClient, text: string) {
  if (!text.includes("_link}")) return text
  return (yield* linkFiller(sql, [text]))(text)
})

/** Huisstijl's name, website and support address, as the returns portal shows them. */
export const contact = Effect.fn("CustomerFacing.contact")(function*(sql: SqlClient.SqlClient) {
  return contactOf(yield* section(sql, "brand"))
})

/**
 * Huisstijl as a shopper's mail (`mail`) or the returns portal (`page`) shows it. The logo only while its file is there
 * and not refused by a scan, and only in a workspace of one store: the section is the workspace's, and one store's logo
 * on another's mail or portal would be the wrong shop (a brand per store is a decision still to make). A mail leaves an
 * SVG logo out, which Gmail and Outlook do not show; the store's name heads it instead.
 */
export const look = Effect.fn("CustomerFacing.look")(function*(sql: SqlClient.SqlClient, on: "mail" | "page") {
  const stored = yield* section(sql, "brand")
  if (stored === undefined) return NO_LOOK
  const fileId = logoFileOf(stored)
  const [logo] = fileId === null ? [] : yield* sql<{ workspaceId: string; mime: string; stores: number }>`
    select f.workspace_id, f.mime,
           (select count(*)::int from stores s where s.status <> 'disconnected') as stores
    from files f
    where f.id = ${fileId} and f.kind = 'logo' and f.deleted_at is null and f.scan_state <> 'rejected'`
  const shown = logo !== undefined && fileId !== null && logo.stores === 1 &&
    !(on === "mail" && logo.mime === "image/svg+xml")
  return {
    color: buttonColorOf(stored),
    logoPath: shown ? logoPath(logo.workspaceId, fileId) : null
  } satisfies Look
})
