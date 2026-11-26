import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { FileStore } from "../../shared/domain/Documents.ts"
import type { Mail, ReturnMailFacts } from "../../shared/domain/Mailer.ts"
import { FIRST_RETRY_SECONDS } from "../../shared/domain/MailRetry.ts"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
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

/** The history line when the provider refused it for its recipient or its contents. */
const NOT_SENT: Record<ShopperMail, string> = {
  received: "Ontvangstbevestiging niet gemaild: de mail werd geweigerd",
  approved: "Goedkeuring niet gemaild: de mail werd geweigerd",
  rejected: "Afwijzing niet gemaild: de mail werd geweigerd",
  label: "Retourlabel niet gemaild: de mail werd geweigerd",
  resolved: "Afhandeling niet gemaild: de mail werd geweigerd"
}

/** The provider's reason for the log, without an address it may quote. */
const withoutAddresses = (reason: string) => reason.replace(/[^\s<>"'`]+@[^\s<>"'`]+/g, "<email>").slice(0, 300)

interface Facts {
  readonly workspaceId: string
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

/** What became of one return's shopper mail: gone, or nothing to send, or handed to a `return.mail` of its own. */
export type ShopperMailOutcome =
  | { readonly outcome: "done" }
  | { readonly outcome: "retry"; readonly outboxId: string; readonly afterSeconds: number }

/**
 * One mail about one return to its shopper; nothing where there is no address, or it went before. Refused for this
 * recipient or these contents (`refusedForRecipient`: an address that bounces, a payload the provider will not take),
 * trying again changes nothing: the history says it did not go. Anything else (the provider busy or out, Insyte's key
 * or sending domain refused, a template that did not render) does not hold up the event that asked for it, whose other
 * sinks (Shopify's write of the decision) commit: the mail stays in line (`return_mails.sent_at` null) and is handed to
 * a `return.mail` event of its own, from the same sender, so the same mail goes once. That event (`retry`) fails while
 * the mail does not go, so the relay tries it again on its own and, past its tries, sets it aside where it is seen.
 * The log has the provider's reason, never the address.
 */
export const shopperMail = Effect.fn("Returns.shopperMail")(function*(
  sql: SqlClient.SqlClient,
  returnId: string,
  mail: ShopperMail,
  via: "portal" | "team" = "portal",
  retry?: { readonly from: string | null | undefined }
) {
  const done: ShopperMailOutcome = { outcome: "done" }
  const [r] = yield* sql<Facts>`
    select r.workspace_id, r.number, r.type, r.status, r.source, r.customer_name, r.customer_email, r.country,
           o.number as order_number, r.requested_resolution, r.exchange_to, r.keep_item, r.rejected_reason,
           r.label::text as label, r.resolution, r.resolution_minor, r.currency,
           r.resolution_shopify::text as shopify, ro.number as replacement_number,
           coalesce(nullif(s.name, ''), w.name) as shop, rs.portal_on, rs.portal_slug
    from returns r join orders o on o.id = r.order_id join stores s on s.id = r.store_id
    join workspaces w on w.id = r.workspace_id
    left join orders ro on ro.id = r.replacement_order_id
    left join return_settings rs on rs.workspace_id = r.workspace_id
    where r.id = ${returnId}`
  if (r === undefined || r.customerEmail === null || r.customerEmail === "") return done
  const label = r.label === null ? null : JSON.parse(r.label) as StoredLabel
  const shopify = r.shopify === null ? null : JSON.parse(r.shopify) as StoredResolution
  if (!due(mail, r, label, shopify)) return done
  // Once per return and kind: the first try claims it, in line until it went; a try again takes the one in line.
  const [claimed] = retry === undefined
    ? yield* sql`
        insert into return_mails (workspace_id, return_id, kind, sent_at)
        values (app_workspace_id(), ${returnId}, ${mail}, null)
        on conflict do nothing returning kind`
    : yield* sql`
        select kind from return_mails where return_id = ${returnId} and kind = ${mail} and sent_at is null
        for update`
  if (claimed === undefined) return done

  // The variant as the screens show it: not Shopify's one variant ("Default Title"), nor one named as its product.
  const items = yield* sql<{ title: string; variantTitle: string | null; qty: number }>`
    select coalesce(p.title, ol.title) as title,
           case when trim(coalesce(ol.variant_title, '')) in ('', 'Default Title')
                  or lower(trim(ol.variant_title)) = lower(trim(coalesce(p.title, ol.title))) then null
                else ol.variant_title end as variant_title,
           rl.quantity as qty
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
  const { error, from } = yield* Senders.trySendToCustomer(sql, {
    kind: KIND[mail],
    to: r.customerEmail,
    sender: r.shop,
    reference: returnId,
    returnMail: { ...facts, ...extra },
    ...(attachments === undefined ? {} : { attachments })
  }, retry === undefined ? undefined : { from: retry.from })
  if (error !== null) {
    const refused = error.refusedForRecipient === true
    yield* Effect.logWarning(
      refused
        ? "a return's shopper mail was refused for its recipient"
        : retry === undefined
        ? "a return's shopper mail did not go; tried again on its own"
        : "a return's shopper mail did not go again",
      { returnId, kind: KIND[mail], retryable: error.retryable === true, reason: withoutAddresses(error.reason) }
    )
    if (!refused && retry !== undefined) return yield* error
    if (!refused) {
      // In line on an event of its own, a minute on, from the sender this try used.
      const afterSeconds = FIRST_RETRY_SECONDS
      const outboxId = yield* Outbox.write(sql, r.workspaceId, {
        type: "return.mail",
        workspaceId: r.workspaceId,
        userId: "system",
        returnId,
        mail,
        via,
        from
      }, { afterSeconds })
      return { outcome: "retry", outboxId, afterSeconds } satisfies ShopperMailOutcome
    }
  } else {
    yield* sql`update return_mails set sent_at = now() where return_id = ${returnId} and kind = ${mail}`
  }
  yield* sql`insert into return_events (id, workspace_id, return_id, actor, name, kind, text)
             values (${mintId("rev")}, app_workspace_id(), ${returnId}, 'insyte', null,
                     ${error === null ? "email_sent" : "note"}, ${error === null ? SENT[mail] : NOT_SENT[mail]})`
  return done
})

/** The label's PDF from the files bucket, to go with its mail. */
const labelPdf = Effect.fn("Returns.labelPdf")(function*(sql: SqlClient.SqlClient, number: string, fileId: string) {
  const [file] = yield* sql<{ r2Key: string }>`select r2_key from files where id = ${fileId} and deleted_at is null`
  if (file === undefined) return undefined
  const stored = yield* (yield* FileStore).get(file.r2Key)
  return stored === undefined ? undefined : [{ filename: `retourlabel-${number}.pdf`, content: stored.bytes }]
})
