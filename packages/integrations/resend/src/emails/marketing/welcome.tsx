import type { Urls } from "../../MailUrls.ts"
import { Campaign } from "../components/layout.tsx"
import { Action, Lead, Steps } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * Marketing (not wired): the first mail after a workspace exists. Three steps whose order is the information, each a
 * thing the console does today. No figures, no promises about time saved (PRODUCT.md, Evidence on hand: none).
 */

export interface WelcomeProps {
  readonly firstName: string
  readonly workspace: string
  readonly url: string
  readonly unsubscribeUrl: string
}

export const subject = (props: WelcomeProps) => `Welkom bij Insyte, ${props.firstName}`

const Welcome = (props: WelcomeProps) => (
  <Campaign
    preview="Drie dingen om je eerste week mee te beginnen."
    plate={{
      title: `${props.workspace} staat klaar`,
      lead: "Je bestellingen, klanten, producten en leveranciers op één plek, in plaats van in een dozijn tabbladen.",
      block: ["Insyte", "Welkom", props.workspace]
    }}
    footer={{
      reason: "Je krijgt deze mail omdat je een account hebt bij Insyte.",
      links: [{ label: "Afmelden", href: props.unsubscribeUrl }]
    }}
  >
    <Lead>Welkom, {props.firstName}. Hiermee begin je:</Lead>
    <Steps
      steps={[
        {
          title: "Koppel je Shopify-winkel",
          body: "Insyte leest je bestellingen, klanten, producten en afhandelingen. Shopify blijft de bron."
        },
        {
          title: "Nodig je team uit",
          body: "Iedereen krijgt een rol, en ziet en doet precies wat bij die rol hoort."
        },
        {
          title: "Kies wat je wilt horen",
          body: "Stel per soort melding in of hij in de app of per e-mail komt, of helemaal niet."
        }
      ]}
    />
    <Action href={props.url} fallback={false}>Naar je werkruimte</Action>
  </Campaign>
)

export const preview = (urls: Urls): WelcomeProps => ({
  firstName: "Eva",
  workspace: "Northwind",
  url: urls.console("/"),
  unsubscribeUrl: urls.console("/settings/notifications?unsubscribe=marketing")
})

Welcome.PreviewProps = preview(PREVIEW)

export default Welcome
