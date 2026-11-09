import type { Urls } from "../../MailUrls.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * H6, `Beta.invite`: an address on the allow-list may now sign up (PRODUCT.md: private beta, invite only). The answer
 * to "Laat je e-mailadres achter, dan laten we het je weten."
 */

export interface BetaAccessProps {
  /** The registration page, with this address filled in. */
  readonly url: string
}

export const subject = () => "Je hebt toegang tot Insyte"

const BetaAccess = (props: BetaAccessProps) => (
  <Letter
    preview="Je kunt nu een account aanmaken voor de private bèta."
    footer={{ reason: "Je krijgt deze mail omdat je dit e-mailadres achterliet om toegang te vragen tot Insyte." }}
  >
    <Title>Je hebt toegang tot Insyte</Title>
    <Lead>
      Insyte is nog alleen op uitnodiging, en dit e-mailadres staat nu op de lijst. Je kunt een account aanmaken en je
      eerste werkruimte inrichten.
    </Lead>
    <Action href={props.url}>Account aanmaken</Action>
    <Note>Gebruik bij het aanmaken dit e-mailadres: de toegang hoort erbij.</Note>
  </Letter>
)

export const preview = (urls: Urls): BetaAccessProps => ({ url: urls.console("/register?email=eva%40example.com") })

BetaAccess.PreviewProps = preview(PREVIEW)

export default BetaAccess
