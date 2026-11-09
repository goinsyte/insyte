import type { Urls } from "../../MailUrls.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/* M2: the link better-auth mints at sign-up and on "Opnieuw sturen" (24 hours, single use). */

export interface VerifyEmailProps {
  readonly url: string
}

export const subject = () => "Bevestig je e-mailadres voor Insyte"

const VerifyEmail = (props: VerifyEmailProps) => (
  <Letter
    preview="Eén klik, dan ga je verder waar je was."
    footer={{ reason: "Je krijgt deze mail omdat dit e-mailadres is gebruikt om een account aan te maken bij Insyte." }}
  >
    <Title>Bevestig je e-mailadres</Title>
    <Lead>
      Klik op de knop om je e-mailadres te bevestigen. Daarna ben je meteen ingelogd en ga je verder waar je was.
    </Lead>
    <Action href={props.url}>E-mailadres bevestigen</Action>
    <Note>De link is 24 uur geldig. Heb je geen account aangemaakt bij Insyte? Dan kun je deze mail negeren.</Note>
  </Letter>
)

export const preview = (urls: Urls): VerifyEmailProps => ({
  url: urls.console("/api/auth/verify-email?token=voorbeeld&callbackURL=%2Fonboarding")
})

VerifyEmail.PreviewProps = preview(PREVIEW)

export default VerifyEmail
