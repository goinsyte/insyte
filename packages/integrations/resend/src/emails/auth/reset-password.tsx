import type { Urls } from "../../MailUrls.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/* M2: "Vergeten?" on the sign-in page. The link lasts 30 minutes and works once; every session ends on the reset. */

export interface ResetPasswordProps {
  readonly url: string
}

export const subject = () => "Kies een nieuw wachtwoord voor Insyte"

const ResetPassword = (props: ResetPasswordProps) => (
  <Letter
    preview="De link is 30 minuten geldig."
    footer={{ reason: "Je krijgt deze mail omdat er een nieuw wachtwoord is aangevraagd voor dit e-mailadres." }}
  >
    <Title>Kies een nieuw wachtwoord</Title>
    <Lead>Je vroeg om een nieuw wachtwoord voor je Insyte-account. Klik op de knop om er een te kiezen.</Lead>
    <Action href={props.url}>Nieuw wachtwoord kiezen</Action>
    <Note>
      De link is 30 minuten geldig en werkt één keer. Vroeg je dit niet aan? Dan hoef je niets te doen: je wachtwoord
      blijft hetzelfde.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): ResetPasswordProps => ({
  url: urls.console("/reset-password?token=voorbeeld")
})

ResetPassword.PreviewProps = preview(PREVIEW)

export default ResetPassword
