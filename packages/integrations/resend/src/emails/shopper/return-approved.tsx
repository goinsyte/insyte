import type { Urls } from "../../MailUrls.ts"
import { ShopLetter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Paragraph, Subtitle, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"
import { hello, reason, type ReturnProps, sample, what } from "./parts.ts"

/*
 * M9.3: approved. For a claim settled without sending anything back, that it is being arranged; otherwise where the
 * parcel goes, and that a label, where the store sends one, comes in its own mail.
 */

export const subject = (props: ReturnProps) =>
  `${props.kind === "claim" ? "Je melding" : "Je retour"} ${props.number} is goedgekeurd`

const ReturnApproved = (props: ReturnProps) => (
  <ShopLetter
    shop={props.shop}
    preview={props.keepItem === true
      ? "Je hoeft niets terug te sturen."
      : "Stuur het artikel terug naar het adres in deze mail."}
    footer={{ reason: reason(props) }}
  >
    <Title>Goedgekeurd</Title>
    <Lead>
      {hello(props.customer)} {props.shop} heeft {what(props)} goedgekeurd.
    </Lead>
    {props.keepItem === true
      ? <Paragraph>Je hoeft niets terug te sturen. We regelen de rest en mailen je zodra het geregeld is.</Paragraph>
      : (
        <>
          <Paragraph>
            Pak het artikel goed in en stuur het terug. Zet het nummer {props.number}{" "}
            op of in het pakket, dan weten we meteen van wie het is.
          </Paragraph>
          {props.address === null || props.address === undefined ? null : (
            <>
              <Subtitle>Retouradres</Subtitle>
              <Paragraph tight>{props.address}</Paragraph>
            </>
          )}
        </>
      )}
    <Facts rows={[["Nummer", props.number], ["Bestelling", props.orderNumber]]} />
    {props.portalUrl === null ? null : <Action href={props.portalUrl}>Naar het retourportaal</Action>}
    {props.keepItem === true ?
      null :
      <Note>Krijg je van ons een retourlabel? Dan komt dat in een aparte mail. Bewaar je verzendbewijs.</Note>}
  </ShopLetter>
)

export const preview = (urls: Urls): ReturnProps => ({
  ...sample(urls),
  keepItem: false,
  address: "Northwind Retouren, Distributieweg 12, 3045 AB Rotterdam"
})

ReturnApproved.PreviewProps = preview(PREVIEW)

export default ReturnApproved
