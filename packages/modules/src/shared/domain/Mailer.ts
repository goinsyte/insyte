import { Context, type Effect, Schema } from "effect"

/*
 * Sending one transactional mail, as a port (16 §3). Adapters: capture (local, tests, previews: the mail lands in a
 * table the dev route reads) and Resend (staging and production, once `mail.goinsyte.com` is verified). A use case
 * names the kind of mail and its facts; the adapter owns the template and the address it sends from.
 */

export const MailKind = Schema.Literals([
  "auth.verify",
  "auth.reset",
  "auth.signup_existing",
  "team.invite",
  "supplier.order",
  "return.received",
  "return.approved",
  "return.rejected",
  "return.label",
  "return.resolved",
  "order.delayed",
  "member.notification",
  "member.digest"
])
export type MailKind = typeof MailKind.Type

/** What an invitation mail says beside its link: whose workspace, who asked, as what, and their note. */
export interface InvitationFacts {
  readonly workspace: string
  readonly inviter: string
  readonly role: string
  readonly message?: string | undefined
  /** When the link stops working. */
  readonly expiresAt: Date
}

/**
 * An order forwarded to a supplier by mail (M8.2): who it is for, whose shop it comes from, and the order as the supplier
 * may see it (their lines, the address to ship to, the note; never the customer's email or phone).
 */
export interface SupplierOrderFacts {
  readonly supplier: string
  readonly shop: string
  readonly order: {
    readonly leg_id: string
    readonly order: { readonly number: string; readonly placed_at: string; readonly note: string | null }
    readonly ship_to: Readonly<
      Record<"name" | "line1" | "line2" | "city" | "postcode" | "region" | "country", string | null>
    >
    readonly lines: ReadonlyArray<{
      readonly sku: string | null
      readonly title: string
      readonly variant_title: string | null
      readonly quantity: number
    }>
  }
}

/**
 * A shopper's return as their mail tells it (M9.3), in the store's name: the request came in (from the portal, or the
 * team started it for them), it was approved (whether anything goes back, and where to) or rejected (why), its label
 * (the PDF goes with it), and what they get. The kind of mail says which of the optional facts it needs.
 */
export interface ReturnMailFacts {
  /** The store's name, which the mail is sent in. */
  readonly shop: string
  /** The shopper's name as the order has it. */
  readonly customer: string
  /** `R-1042`. */
  readonly number: string
  readonly kind: "return" | "claim"
  readonly orderNumber: string
  readonly items: ReadonlyArray<{ readonly title: string; readonly variant: string | null; readonly qty: number }>
  /** The returns portal's handle, where it is on: the mail links to it. */
  readonly portal: string | null
  /** `return.received`: who put it in, and what the shopper asked for. */
  readonly via?: "portal" | "team" | undefined
  readonly requested?: "refund" | "exchange" | "gift_card" | "replacement" | "discount" | undefined
  readonly exchangeTo?: string | null | undefined
  /** `return.approved`: nothing goes back (a claim settled without it), else where to and whether a label follows. */
  readonly keepItem?: boolean | undefined
  readonly address?: string | null | undefined
  /** `return.rejected`: why, as the team wrote it. */
  readonly reason?: string | undefined
  /** `return.label`: the carrier and its tracking number; the PDF goes with the mail. */
  readonly label?: { readonly carrier: string; readonly tracking: string } | undefined
  /** `return.resolved`: what they get, the code to use or the new order's number where there is one. */
  readonly resolution?:
    | {
      readonly kind: "refund" | "exchange" | "gift_card" | "replacement" | "discount"
      readonly amountMinor: number
      readonly currency: string
      readonly code: string | null
      readonly order: string | null
    }
    | undefined
}

/**
 * A shopper's order is late (M10.2), in the store's name: the words were written when the plate was drawn and filed
 * (`orders/domain/DelayMail.ts`), so the template sets them as they are, with the order's number and lines beside.
 */
export interface OrderDelayFacts {
  readonly shop: string
  readonly number: string
  readonly subject: string
  readonly paragraphs: ReadonlyArray<string>
  readonly items: ReadonlyArray<{ readonly title: string; readonly variant: string | null; readonly qty: number }>
}

/**
 * One note delivered by e-mail to a member who has e-mail on for its kind (M11 step 13.5): the words are written by
 * the notifications slice (`notifications/domain/Words.ts`), the link is a console path the adapter makes absolute.
 */
export interface MemberNoteFacts {
  readonly workspace: string
  readonly kind: string
  readonly title: string
  readonly detail?: string | undefined
  readonly quote?: string | undefined
  readonly record?: string | undefined
  readonly actionLabel: string
  readonly path: string
}

/** One line of the digest: the note's sentence, its detail and its console path. */
export interface DigestLine {
  readonly title: string
  readonly detail?: string | undefined
  readonly path: string
}

/** The member's daily overview (M11 step 13.5): what is unread, Primair first. */
export interface DigestFacts {
  readonly workspace: string
  readonly date: Date
  readonly primary: ReadonlyArray<DigestLine>
  readonly other: ReadonlyArray<DigestLine>
}

export interface Mail {
  readonly kind: MailKind
  readonly to: string
  readonly url?: string | undefined
  /** `team.invite` only. */
  readonly invitation?: InvitationFacts | undefined
  /** `supplier.order` only. */
  readonly supplierOrder?: SupplierOrderFacts | undefined
  /** `return.*` only. */
  readonly returnMail?: ReturnMailFacts | undefined
  /** `order.delayed` only. */
  readonly orderDelay?: OrderDelayFacts | undefined
  /** `member.notification` only. */
  readonly memberNote?: MemberNoteFacts | undefined
  /** `member.digest` only. */
  readonly digest?: DigestFacts | undefined
  /** The name the mail is sent in (a store's, to its shopper); absent, Insyte's own. */
  readonly sender?: string | undefined
  /** What makes two mails of one kind to one address different (a leg's id), for the sender's idempotency. */
  readonly reference?: string | undefined
  /** Files sent with it (a packing slip, M8.5). */
  readonly attachments?: ReadonlyArray<{ readonly filename: string; readonly content: Uint8Array }> | undefined
}

export class MailNotSent extends Schema.TaggedError<MailNotSent>()("MailNotSent", {
  kind: MailKind,
  reason: Schema.String
}) {}

export class Mailer extends Context.Service<Mailer, {
  readonly send: (mail: Mail) => Effect.Effect<void, MailNotSent>
}>()("shared/Mailer") {}
