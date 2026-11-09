import { Context, type Effect } from "effect"

/*
 * The links an invitation travels by, as a port (16 §3). Their secret is derived on the server from what the link is
 * for and its round, so the mail sent after the undo window carries the same link the send made, and nothing but its
 * hash is stored. The API Worker implements it over its auth secret and the console's origin.
 */

export interface Minted {
  /** The landing's address, with the secret in it. */
  readonly url: string
  /** The secret alone: the shareable link shows `link_<token>`. */
  readonly token: string
  /** SHA-256 of the secret, hex: what the table keeps and the landing compares. */
  readonly tokenHash: string
}

export class InvitationLinks extends Context.Service<InvitationLinks, {
  /** One person's invitation, in this round. */
  readonly invitation: (invitationId: string, round: number) => Effect.Effect<Minted>
  /** The workspace's shareable link, in this round. */
  readonly shareable: (workspaceId: string, round: number) => Effect.Effect<Minted>
}>()("members/InvitationLinks") {}

export { UNDO_SECONDS } from "../../shared/domain/Undo.ts"

/** An invitation is valid this long, and a resend starts it again. */
export const INVITATION_DAYS = 7
