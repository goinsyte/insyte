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
  "order.message",
  "support.message",
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
 * The team's mail to a shopper about one order (M7 9.1 `Orders.emailCustomer`), in the store's name: a track-and-trace
 * update with the parcel beside it, or the team's own words (forwarding's "Klant mailen", an automation's mail). The
 * words were fixed when it was put in line (`orders/domain/CustomerMail.ts`), so the template sets them as they are.
 */
export interface OrderMessageFacts {
  readonly shop: string
  readonly number: string
  readonly subject: string
  readonly paragraphs: ReadonlyArray<string>
  /** A track-and-trace update's parcel; absent for the team's own words. */
  readonly tracking?:
    | { readonly carrier: string | null; readonly number: string; readonly url: string | null }
    | undefined
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
  /** Where an answer goes: the delivery's own address on the inbound domain, when the record takes comments. */
  readonly replyTo?: string | undefined
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

/**
 * A message the team wrote in the inbox (M11 step 2): a reply, a forward or a new mail, sent in the mailbox's name
 * from Insyte's sending domain, answered to the mailbox's own address, and threaded by its headers.
 */
export interface SupportFacts {
  readonly subject: string
  readonly text: string
  /** The mailbox's own address, which forwards to Insyte: where the customer's answer goes. */
  readonly replyTo: string
  /** `<id@domain>`, as the thread knows it. */
  readonly messageId: string
  readonly inReplyTo: string | null
  readonly references: ReadonlyArray<string>
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
  /** `order.message` only. */
  readonly orderMessage?: OrderMessageFacts | undefined
  /** `member.notification` only. */
  readonly memberNote?: MemberNoteFacts | undefined
  /** `member.digest` only. */
  readonly digest?: DigestFacts | undefined
  /** `support.message` only. */
  readonly support?: SupportFacts | undefined
  /** The name the mail is sent in (a store's, to its shopper); absent, Insyte's own. */
  readonly sender?: string | undefined
  /**
   * The address it goes from, on the brand's own verified domain (`use-cases/Senders.ts`, E-mail en domein); absent,
   * Insyte's sending address.
   */
  readonly from?: string | undefined
  /** Where an answer goes (E-mail en domein's "Antwoorden naar"), where the kind has no reply address of its own. */
  readonly replyTo?: string | undefined
  /** What makes two mails of one kind to one address different (a leg's id), for the sender's idempotency. */
  readonly reference?: string | undefined
  /** Files sent with it (a packing slip, M8.5). */
  readonly attachments?: ReadonlyArray<{ readonly filename: string; readonly content: Uint8Array }> | undefined
}

export class MailNotSent extends Schema.TaggedError<MailNotSent>()("MailNotSent", {
  kind: MailKind,
  reason: Schema.String,
  /**
   * The mail named the brand's own address (`Mail.from`) and the provider refused that sender: its domain is not
   * verified (any more). `use-cases/Senders.ts` sends it again from Insyte's address.
   */
  senderRefused: Schema.optional(Schema.Boolean),
  /** The provider was busy or out (429, 5xx, unreachable): the same mail may go if it is tried again later. */
  retryable: Schema.optional(Schema.Boolean)
}) {}

export class Mailer extends Context.Service<Mailer, {
  readonly send: (mail: Mail) => Effect.Effect<void, MailNotSent>
}>()("shared/Mailer") {}
