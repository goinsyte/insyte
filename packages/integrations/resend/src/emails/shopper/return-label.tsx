import type { Urls } from "../../MailUrls.ts"
import { ShopLetter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Steps, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"
import { hello, reason, type ReturnProps, sample, what } from "./parts.ts"

/*
 * M9.3: the return label, made at the carrier, as the PDF with this mail; the carrier and its tracking number, and how
 * to send it in three steps.
 */

export const subject = (props: ReturnProps) => `Je retourlabel voor ${props.number}`

const ReturnLabel = (props: ReturnProps) => (
  <ShopLetter
    shop={props.shop}
    preview={`Het label van ${props.label?.carrier ?? "de vervoerder"} zit als PDF bij deze mail.`}
    footer={{ reason: reason(props) }}
  >
    <Title>Je retourlabel</Title>
    <Lead>
      {hello(props.customer)} het retourlabel voor {what(props)} zit als PDF bij deze mail.
    </Lead>
    <Steps
      steps={[
        { title: "Print het label", body: "Plak het op het pakket, over oude labels heen." },
        {
          title: "Breng het weg",
          body: `Lever het pakket in bij een punt van ${props.label?.carrier ?? "de vervoerder"}.`
        },
        { title: "Bewaar je bewijs", body: "Houd het verzendbewijs tot je retour is afgehandeld." }
      ]}
    />
    <Facts
      rows={[
        ["Vervoerder", props.label?.carrier ?? ""],
        ["Trackingnummer", props.label?.tracking ?? ""],
        ["Nummer", props.number]
      ]}
    />
    {props.portalUrl === null ? null : <Action href={props.portalUrl}>Naar het retourportaal</Action>}
    <Note>Zodra we het pakket binnen hebben en hebben bekeken, hoor je wat je krijgt.</Note>
  </ShopLetter>
)

export const preview = (urls: Urls): ReturnProps => ({
  ...sample(urls),
  label: { carrier: "PostNL", tracking: "3SRET1042" }
})

ReturnLabel.PreviewProps = preview(PREVIEW)

export default ReturnLabel
