import type { Urls } from "../../MailUrls.ts"
import { money } from "../components/format.ts"
import { ShopLetter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Paragraph, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"
import { hello, reason, type ReturnProps, sample, what } from "./parts.ts"

/*
 * M9.3: settled, and what the shopper gets: the money back on how they paid, a gift card or a discount code with its
 * code, or the new order with its number. The code is the shopper's: it is in this mail and nowhere else they can see.
 */

export const subject = (props: ReturnProps) =>
  `${props.kind === "claim" ? "Je melding" : "Je retour"} ${props.number} is afgehandeld`

const sentence = (props: ReturnProps) => {
  const r = props.resolution
  if (r === undefined) return "We hebben het afgehandeld."
  const amount = money(r.amountMinor, r.currency)
  switch (r.kind) {
    case "refund":
      return `We betalen ${amount} terug op de manier waarop je hebt betaald. Het kan een paar werkdagen duren voor het op je rekening staat.`
    case "gift_card":
      return `Je krijgt een cadeaubon van ${amount}. Gebruik de code hieronder bij je volgende bestelling.`
    case "discount":
      return `Je krijgt een kortingscode van ${amount} voor je volgende bestelling. Hij werkt één keer.`
    case "exchange":
      return `We sturen je een ander exemplaar in ruil${r.order === null ? "" : ` met bestelling ${r.order}`}.${
        r.amountMinor > 0 ? ` Voor de ruil betaal je ${amount}.` : ""
      }`
    case "replacement":
      return `We sturen je een nieuw exemplaar${r.order === null ? "" : ` met bestelling ${r.order}`}, zonder kosten.`
  }
}

const ReturnResolved = (props: ReturnProps) => {
  const r = props.resolution
  return (
    <ShopLetter
      shop={props.shop}
      preview={`${props.shop} heeft ${what(props)} afgehandeld.`}
      footer={{ reason: reason(props) }}
    >
      <Title>Afgehandeld</Title>
      <Lead>
        {hello(props.customer)} {props.shop} heeft {what(props)} afgehandeld.
      </Lead>
      <Paragraph>{sentence(props)}</Paragraph>
      <Facts
        rows={[
          ...(r?.code ? [[r.kind === "gift_card" ? "Cadeaubon" : "Kortingscode", r.code] as const] : []),
          ...(r?.order ? [["Nieuwe bestelling", r.order] as const] : []),
          ["Nummer", props.number],
          ["Bestelling", props.orderNumber]
        ]}
      />
      {props.portalUrl === null ? null : <Action href={props.portalUrl}>Naar het retourportaal</Action>}
      <Note>Vragen? Neem contact op met {props.shop} en noem het nummer {props.number}.</Note>
    </ShopLetter>
  )
}

export const preview = (urls: Urls): ReturnProps => ({
  ...sample(urls),
  resolution: { kind: "gift_card", amountMinor: 5495, currency: "EUR", code: "K7QMW2XR9PTB4HNA", order: null }
})

ReturnResolved.PreviewProps = preview(PREVIEW)

export default ReturnResolved
