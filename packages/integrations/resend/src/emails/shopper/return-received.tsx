import type { Urls } from "../../MailUrls.ts"
import { ShopLetter } from "../components/layout.tsx"
import { Action, Facts, Items, Lead, Note, Subtitle, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"
import { GETS, hello, lines, reason, type ReturnProps, sample, what } from "./parts.ts"

/*
 * M9.3: the shopper's request came in, from the returns portal or started by the team for them. What they asked for,
 * which items, and what happens next: the store looks at it within two working days.
 */

export const subject = (props: ReturnProps) =>
  `${props.kind === "claim" ? "We hebben je melding" : "We hebben je retour"} ${props.number} ontvangen`

const ReturnReceived = (props: ReturnProps) => (
  <ShopLetter
    shop={props.shop}
    preview={`${props.shop} bekijkt ${what(props)} binnen twee werkdagen.`}
    footer={{ reason: reason(props) }}
  >
    <Title>{props.kind === "claim" ? "Melding ontvangen" : "Retour ontvangen"}</Title>
    <Lead>
      {hello(props.customer)} {props.via === "team"
        ? `${props.shop} heeft ${what(props)} voor je aangemaakt.`
        : `we hebben ${what(props)} ontvangen.`}{" "}
      We bekijken hem binnen twee werkdagen en laten je per mail weten wat er gebeurt.
    </Lead>
    <Facts
      rows={[
        ["Nummer", props.number],
        ["Bestelling", props.orderNumber],
        ...(props.requested === undefined
          ? []
          : [
            [
              "Je vraagt om",
              `${GETS[props.requested]}${
                props.requested === "exchange" && props.exchangeTo ? ` (${props.exchangeTo})` : ""
              }`
            ] as const
          ])
      ]}
    />
    <Subtitle>Artikelen</Subtitle>
    <Items items={lines(props)} />
    {props.portalUrl === null ? null : <Action href={props.portalUrl}>Naar het retourportaal</Action>}
    <Note>Stuur nog niets op: je hoort eerst of de retour is goedgekeurd en hoe je hem verstuurt.</Note>
  </ShopLetter>
)

export const preview = (urls: Urls): ReturnProps => ({ ...sample(urls), via: "portal", requested: "refund" })

ReturnReceived.PreviewProps = preview(PREVIEW)

export default ReturnReceived
