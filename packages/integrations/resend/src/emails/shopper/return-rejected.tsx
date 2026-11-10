import type { Urls } from "../../MailUrls.ts"
import { ShopLetter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Quote, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"
import { hello, reason, type ReturnProps, sample, what } from "./parts.ts"

/*
 * M9.3: rejected, with the reason as the team wrote it, and what the shopper can do: answer the store if they think it
 * is wrong.
 */

export const subject = (props: ReturnProps) =>
  `${props.kind === "claim" ? "Je melding" : "Je retour"} ${props.number} is niet goedgekeurd`

const ReturnRejected = (props: ReturnProps) => (
  <ShopLetter
    shop={props.shop}
    preview={`${props.shop} kan ${what(props)} niet goedkeuren.`}
    footer={{ reason: reason(props) }}
  >
    <Title>Niet goedgekeurd</Title>
    <Lead>
      {hello(props.customer)} {props.shop} kan {what(props)} niet goedkeuren. De reden:
    </Lead>
    {props.reason === undefined || props.reason === "" ? null : <Quote>{props.reason}</Quote>}
    <Facts rows={[["Nummer", props.number], ["Bestelling", props.orderNumber]]} />
    {props.portalUrl === null ? null : <Action href={props.portalUrl}>Naar het retourportaal</Action>}
    <Note>Denk je dat dit niet klopt? Neem dan contact op met {props.shop} en noem het nummer {props.number}.</Note>
  </ShopLetter>
)

export const preview = (urls: Urls): ReturnProps => ({ ...sample(urls), reason: "Buiten de retourtermijn" })

ReturnRejected.PreviewProps = preview(PREVIEW)

export default ReturnRejected
