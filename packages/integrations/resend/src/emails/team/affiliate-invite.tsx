import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * `Affiliates.invite` (api.md, affiliates≥2): a brand invites a partner to its programme. The payout day and the return
 * window are the programme's own values (domain.md §14), passed in, never written here.
 */

export interface AffiliateInviteProps {
  readonly url: string
  readonly brand: string
  readonly inviter: string
  /** `affiliate_programs.payout_day`: the day of the month after the close. */
  readonly payoutDay: number
  /** `affiliate_programs.return_days`: until then a conversion can still be reversed. */
  readonly returnDays: number
  readonly expiresAt: Date
}

export const subject = (props: AffiliateInviteProps) => `${props.brand} nodigt je uit als partner`

const AffiliateInvite = (props: AffiliateInviteProps) => (
  <Letter
    preview={`Je links, doorverwijzingen en uitbetalingen van ${props.brand} op één plek.`}
    footer={{ reason: `Je krijgt deze mail omdat ${props.inviter} dit e-mailadres uitnodigde voor ${props.brand}.` }}
  >
    <Title>Word partner van {props.brand}</Title>
    <Lead>
      {props.inviter} nodigde je uit voor het partnerprogramma van{" "}
      {props.brand}. In het partnerportaal op Insyte vind je je links, je doorverwijzingen en je uitbetalingen.
    </Lead>
    <Facts
      rows={[
        ["Programma", props.brand],
        ["Uitbetaling", `op de ${props.payoutDay}e van de maand na afsluiting`],
        ["Retourtermijn", `${props.returnDays} dagen na bezorging`]
      ]}
    />
    <Action href={props.url}>Uitnodiging bekijken</Action>
    <Note>
      Een doorverwijzing telt definitief zodra de retourtermijn voorbij is. De uitnodiging werkt tot{" "}
      {day(props.expiresAt)} en alleen voor dit e-mailadres.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): AffiliateInviteProps => ({
  url: urls.console("/invitations/inv_voorbeeld?k=voorbeeld"),
  brand: "Northwind",
  inviter: "Elena Hart",
  payoutDay: 15,
  returnDays: 14,
  expiresAt: new Date("2026-11-16T12:00:00Z")
})

AffiliateInvite.PreviewProps = preview(PREVIEW)

export default AffiliateInvite
