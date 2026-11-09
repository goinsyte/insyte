import type { Urls } from "../../MailUrls.ts"
import { Campaign } from "../components/layout.tsx"
import { Action, Lead, Paragraph, Soon, Subtitle } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * Marketing (not wired): a product update. The items are props, written per issue; the preview's sample is what the
 * repo shipped in November 2026 (orders, customers and products read from the store; invitations after the undo
 * window), plus MCP labelled "Binnenkort", as PRODUCT.md requires.
 */

export interface UpdateItem {
  readonly title: string
  readonly body: string
  readonly soon?: boolean | undefined
}

export interface ProductUpdateProps {
  /** "November 2026". */
  readonly issue: string
  readonly title: string
  readonly lead: string
  readonly items: ReadonlyArray<UpdateItem>
  readonly url: string
  readonly unsubscribeUrl: string
}

export const subject = (props: ProductUpdateProps) => `Nieuw in Insyte: ${props.title.toLowerCase()}`

const ProductUpdate = (props: ProductUpdateProps) => (
  <Campaign
    preview={props.lead}
    plate={{ title: props.title, lead: props.lead, block: ["Insyte", "Productupdate", props.issue] }}
    footer={{
      reason: "Je krijgt deze mail omdat je productupdates van Insyte ontvangt.",
      links: [{ label: "Afmelden", href: props.unsubscribeUrl }]
    }}
  >
    <Lead>Dit is er veranderd sinds de vorige update.</Lead>
    {props.items.map((item) => (
      <div key={item.title}>
        <Subtitle>
          {item.title}
          {item.soon === true
            ? (
              <>
                {" "}
                <Soon />
              </>
            )
            : null}
        </Subtitle>
        <Paragraph tight>{item.body}</Paragraph>
      </div>
    ))}
    <Action href={props.url} fallback={false}>Insyte openen</Action>
  </Campaign>
)

export const preview = (urls: Urls): ProductUpdateProps => ({
  issue: "November 2026",
  title: "Je winkel in de console",
  lead: "Bestellingen, klanten en producten komen nu rechtstreeks uit je Shopify-winkel.",
  items: [
    {
      title: "Bestellingen",
      body:
        "De bestellijst toont je echte Shopify-bestellingen in plaats van voorbeelddata, en blijft bij als er nieuwe binnenkomen."
    },
    {
      title: "Klanten en producten",
      body: "Ook de klanten- en productlijsten lezen nu uit je eigen winkel."
    },
    {
      title: "Collega's uitnodigen",
      body: "Een uitnodiging gaat pas weg als het venster om hem ongedaan te maken voorbij is, met de rol die je koos."
    },
    {
      title: "Insyte voor je eigen AI-tools",
      body: "Een MCP-server, zodat je eigen agents met dezelfde rechten als een API-sleutel bij je gegevens kunnen.",
      soon: true
    }
  ],
  url: urls.console("/"),
  unsubscribeUrl: urls.console("/settings/notifications?unsubscribe=marketing")
})

ProductUpdate.PreviewProps = preview(PREVIEW)

export default ProductUpdate
