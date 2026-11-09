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
  "supplier.order"
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

export interface Mail {
  readonly kind: MailKind
  readonly to: string
  readonly url?: string | undefined
  /** `team.invite` only. */
  readonly invitation?: InvitationFacts | undefined
  /** `supplier.order` only. */
  readonly supplierOrder?: SupplierOrderFacts | undefined
  /** What makes two mails of one kind to one address different (a leg's id), for the sender's idempotency. */
  readonly reference?: string | undefined
}

export class MailNotSent extends Schema.TaggedError<MailNotSent>()("MailNotSent", {
  kind: MailKind,
  reason: Schema.String
}) {}

export class Mailer extends Context.Service<Mailer, {
  readonly send: (mail: Mail) => Effect.Effect<void, MailNotSent>
}>()("shared/Mailer") {}
