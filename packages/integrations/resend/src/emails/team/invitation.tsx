import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Note, Quote, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * M3.4: the invitation, sent by the relay once its undo window has passed. Whose workspace, who asked and as what, their
 * note in their own words, one button to the landing, and until when the link works.
 */

export interface InvitationProps {
  readonly url: string
  readonly workspace: string
  readonly inviter: string
  readonly role: string
  readonly message?: string | undefined
  readonly expiresAt: Date
}

export const subject = (props: InvitationProps) => `${props.inviter} nodigt je uit voor ${props.workspace}`

const Invitation = (props: InvitationProps) => (
  <Letter
    preview={`Werk mee in ${props.workspace} als ${props.role}.`}
    footer={{
      reason: `Je krijgt deze mail omdat ${props.inviter} dit e-mailadres uitnodigde voor ${props.workspace}.`
    }}
  >
    <Title>Kom erbij in {props.workspace}</Title>
    <Lead>
      {props.inviter} nodigde je uit om als {props.role} mee te werken in {props.workspace} op Insyte.
    </Lead>
    {props.message === undefined || props.message === "" ? null : <Quote>{props.message}</Quote>}
    <Action href={props.url}>Uitnodiging bekijken</Action>
    <Note>
      De uitnodiging werkt tot {day(props.expiresAt)}{" "}
      en alleen voor dit e-mailadres. Verwachtte je hem niet? Dan kun je deze mail negeren.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): InvitationProps => ({
  url: urls.console("/invitations/inv_voorbeeld?k=voorbeeld"),
  workspace: "Northwind",
  inviter: "Elena Hart",
  role: "Klantenservice",
  message: "Welkom. Je pakt vanaf maandag de tickets op, ik loop de eerste week met je mee.",
  expiresAt: new Date("2026-11-16T12:00:00Z")
})

Invitation.PreviewProps = preview(PREVIEW)

export default Invitation
