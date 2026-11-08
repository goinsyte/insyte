import { Context, type Effect, Schema } from "effect"

/*
 * Sending one transactional mail, as a port (16 §3). Adapters: capture (local, tests, previews: the mail lands in a
 * table the dev route reads) and Resend (staging and production, once `mail.goinsyte.com` is verified). A use case
 * names the kind of mail and its facts; the adapter owns the template and the address it sends from.
 */

export const MailKind = Schema.Literals(["auth.verify", "auth.reset", "auth.signup_existing", "team.invite"])
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

export interface Mail {
  readonly kind: MailKind
  readonly to: string
  readonly url?: string | undefined
  /** `team.invite` only. */
  readonly invitation?: InvitationFacts | undefined
}

export class MailNotSent extends Schema.TaggedError<MailNotSent>()("MailNotSent", {
  kind: MailKind,
  reason: Schema.String
}) {}

export class Mailer extends Context.Service<Mailer, {
  readonly send: (mail: Mail) => Effect.Effect<void, MailNotSent>
}>()("shared/Mailer") {}
