import type { Urls } from "../../MailUrls.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * M2: someone signed up with an address that already has an account. The visitor is shown nothing new (no enumeration);
 * the owner hears of it here, with the way back to the sign-in page.
 */

export interface ExistingAccountProps {
  /** The console's sign-in page. */
  readonly loginUrl: string
}

export const subject = () => "Je hebt al een account bij Insyte"

const ExistingAccount = (props: ExistingAccountProps) => (
  <Letter
    preview="Iemand probeerde een account aan te maken met dit e-mailadres."
    footer={{ reason: "Je krijgt deze mail omdat iemand met dit e-mailadres een account probeerde aan te maken." }}
  >
    <Title>Je hebt al een account</Title>
    <Lead>Iemand probeerde een account aan te maken met dit e-mailadres, maar je hebt er al een.</Lead>
    <Action href={props.loginUrl} fallback={false}>Naar de inlogpagina</Action>
    <Note>
      Wachtwoord vergeten? Kies op de inlogpagina voor “Vergeten?”. Was jij dit niet? Dan hoef je niets te doen.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): ExistingAccountProps => ({ loginUrl: urls.console("/login") })

ExistingAccount.PreviewProps = preview(PREVIEW)

export default ExistingAccount
