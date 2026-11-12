import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import { type Mail, Mailer, type ReturnMailFacts } from "../../shared/domain/Mailer.ts"
import * as Senders from "../../shared/use-cases/Senders.ts"
import type { Resolution } from "../domain/Rules.ts"
import type { StoredResolution } from "../domain/Shopify.ts"
import type { StoredLabel } from "./returns.ts"
import { load } from "./settings.ts"

/*
 * The shopper's mails about their return (M9.3), in the store's name, to the address on the return: the request came in
 * (from the portal, or the team started it for them), it was approved or rejected (with the reason), its label (the PDF
 * with the mail), and what they get once it is settled. Sent by the relay's mail sink, so a team's change waits out its
 * undo window; once per return and kind (`return_mails`), and only while it is still true (a rejection reopened since is
 * not mailed). A return that came from Shopify has had Shopify's own mail for the request. Inside the return's
 * workspace, as `system`.
 */

export type ShopperMail = "received" | "approved" | "rejected" | "label" | "resolved"

const KIND: Record<ShopperMail, Mail["kind"]> = {
  received: "return.received",
  approved: "return.approved",
  rejected: "return.rejected",
  label: "return.label",
  resolved: "return.resolved"
}

/** The history line once it went. */
const SENT: Record<ShopperMail, string> = {
  received: "Ontvangstbevestiging gemaild aan de klant",
  approved: "Goedkeuring gemaild aan de klant",
  rejected: "Afwijzing gemaild aan de klant",
  label: "Retourlabel gemaild aan de klant",
  resolved: "Afhandeling gemaild aan de klant"
}

interface Facts {
  readonly number: string
  readonly type: "return" | "claim"
  readonly status: string
  readonly source: string
  readonly customerName: string
  readonly customerEmail: string | null
  readonly country: string | null
  readonly orderNumber: string
  readonly requestedResolution: Resolution
  readonly exchangeTo: string | null
  readonly keepItem: boolean
  readonly rejectedReason: string | null
  readonly label: string | null
  readonly resolution: Resolution | null
  readonly resolutionMinor: string | null
  readonly currency: string
  readonly shopify: string | null
  readonly replacementNumber: string | null
  readonly shop: string
  readonly portalOn: boolean | null
  readonly portalSlug: string | null
}

/** Whether the mail still says what is true of the return now. */
const due = (mail: ShopperMail, r: Facts, label: StoredLabel | null, shopify: StoredResolution | null) => {
  switch (mail) {
    case "received":
      return r.source !== "shopify"
    case "approved":
      return r.status !== "review" && r.status !== "rejected"
    case "rejected":
      return r.status === "rejected"
    case "label":
      return label?.state === "issued" && label.self !== true && typeof label.fileId === "string"
    case "resolved":
      return r.status === "resolved" && (r.resolution === "refund" || shopify?.state === "done")
  }
}

/** One mail about one return to its shopper; nothing where there is no address, or it went before. */
export const shopperMail = Effect.fn("Returns.shopperMail")(function*(
  sql: SqlClient.SqlClient,
  returnId: string,
  mail: ShopperMail,
  via: "portal" | "team" = "portal"
) {
  const [r] = yield* sql<Facts>`
    select r.number, r.type, r.status, r.source, r.customer_name, r.customer_email, r.country,
           o.number as order_number, r.requested_resolution, r.exchange_to, r.keep_item, r.rejected_reason,
           r.label::text as label, r.resolution, r.resolution_minor, r.currency,
           r.resolution_shopify::text as shopify, ro.number as replacement_number,
           coalesce(nullif(s.name, ''), w.name) as shop, rs.portal_on, rs.portal_slug
    from returns r join orders o on o.id = r.order_id join stores s on s.id = r.store_id
    join workspaces w on w.id = r.workspace_id
    left join orders ro on ro.id = r.replacement_order_id
    left join return_settings rs on rs.workspace_id = r.workspace_id
    where r.id = ${returnId}`
  if (r === undefined || r.customerEmail === null || r.customerEmail === "") return
  const label = r.label === null ? null : JSON.parse(r.label) as StoredLabel
  const shopify = r.shopify === null ? null : JSON.parse(r.shopify) as StoredResolution
  if (!due(mail, r, label, shopify)) return
  const [claimed] = yield* sql`
    insert into return_mails (workspace_id, return_id, kind) values (app_workspace_id(), ${returnId}, ${mail})
    on conflict do nothing returning kind`
  if (claimed === undefined) return

  const items = yield* sql<{ title: string; variantTitle: string | null; qty: number }>`
    select coalesce(p.title, ol.title) as title, ol.variant_title, rl.quantity as qty
    from return_lines rl join order_lines ol on ol.id = rl.order_line_id left join products p on p.id = ol.product_id
    where rl.return_id = ${returnId} order by rl.id`
  const facts: ReturnMailFacts = {
    shop: r.shop,
    customer: r.customerName,
    number: r.number,
    kind: r.type,
    orderNumber: r.orderNumber,
    items: items.map((i) => ({ title: i.title, variant: i.variantTitle, qty: i.qty })),
    portal: r.portalOn === true ? r.portalSlug : null
  }
  const extra = yield* (() => {
    switch (mail) {
      case "received":
        return Effect.succeed({ via, requested: r.requestedResolution, exchangeTo: r.exchangeTo })
      case "approved":
        return Effect.map(load(sql), (s) => ({
          keepItem: r.keepItem,
          address: r.keepItem
            ? null
            : (s.addresses.find((a) => a.country === r.country) ?? s.addresses[0])?.address ?? null
        }))
      case "rejected":
        return Effect.succeed({ reason: r.rejectedReason ?? "" })
      case "label":
        return Effect.succeed({ label: { carrier: label!.carrier, tracking: label!.tracking ?? "" } })
      case "resolved":
        return Effect.succeed({
          resolution: {
            kind: r.resolution!,
            amountMinor: shopify?.amountMinor ?? Number(r.resolutionMinor ?? 0),
            currency: r.currency,
            code: r.resolution === "gift_card" || r.resolution === "discount" ? shopify?.code ?? null : null,
            order: r.replacementNumber ?? shopify?.orderName ?? null
          }
        })
    }
  })()
  const attachments = mail === "label" ? yield* labelPdf(sql, r.number, label!.fileId!) : undefined
  yield* (yield* Mailer).send({
    kind: KIND[mail],
    to: r.customerEmail,
    sender: r.shop,
    ...(yield* Senders.customerSender(sql, KIND[mail])),
    reference: returnId,
    returnMail: { ...facts, ...extra },
    ...(attachments === undefined ? {} : { attachments })
  })
  yield* sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text)
             values (${mintId("rev")}, app_workspace_id(), ${returnId}, 'insyte', null, 'email_sent', ${SENT[mail]})`
})

/** The label's PDF from the files bucket, to go with its mail. */
const labelPdf = Effect.fn("Returns.labelPdf")(function*(sql: SqlClient.SqlClient, number: string, fileId: string) {
  const [file] = yield* sql<{ r2Key: string }>`select r2_key from files where id = ${fileId} and deleted_at is null`
  if (file === undefined) return undefined
  const stored = yield* (yield* FileStore).get(file.r2Key)
  return stored === undefined ? undefined : [{ filename: `retourlabel-${number}.pdf`, content: stored.bytes }]
})
