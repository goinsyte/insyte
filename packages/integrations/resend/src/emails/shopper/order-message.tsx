import type { OrderMessageFacts } from "@insyte/modules/shared/domain/Mailer"
import { ShopLetter } from "../components/layout.tsx"
import { Action, Facts, Lead, Paragraph, Title } from "../components/text.tsx"

/*
 * M7 9.1: the team's mail to a shopper about one order, in the store's name. The words were fixed when it was put in
 * line (`orders/domain/CustomerMail.ts`), so the template sets them as they are. A track-and-trace update has a title,
 * the parcel beside it and the carrier's page to follow it on; the team's own words stand alone, as they wrote them.
 */

export const subject = (props: OrderMessageFacts) => props.subject

const OrderMessage = (props: OrderMessageFacts) => {
  const footer = { reason: `Je krijgt deze mail omdat je bij ${props.shop} iets hebt besteld.` }
  const tracking = props.tracking
  if (tracking === undefined) {
    const [first, ...rest] = props.paragraphs
    return (
      <ShopLetter shop={props.shop} preview={rest[0] ?? first ?? props.subject} footer={footer}>
        <Lead>{first ?? ""}</Lead>
        {rest.map((p, i) => <Paragraph key={`${i}-${p}`}>{p}</Paragraph>)}
        <Facts rows={[["Bestelling", props.number]]} />
      </ShopLetter>
    )
  }
  const [hello, news, ...rest] = props.paragraphs
  return (
    <ShopLetter shop={props.shop} preview={news ?? props.subject} footer={footer}>
      <Title>Je bestelling is onderweg</Title>
      <Lead>{[hello, news].filter((p) => p !== undefined).join(" ")}</Lead>
      <Facts
        rows={[
          ["Bestelling", props.number],
          ...(tracking.carrier === null ? [] : [["Vervoerder", tracking.carrier] as const]),
          ["Track & trace", tracking.number]
        ]}
      />
      {tracking.url === null ? null : <Action href={tracking.url}>Pakket volgen</Action>}
      {rest.map((p, i) => <Paragraph key={`${i}-${p}`}>{p}</Paragraph>)}
    </ShopLetter>
  )
}

export const preview = (): OrderMessageFacts => ({
  shop: "Northwind",
  number: "#1003",
  subject: "Je bestelling #1003 is onderweg",
  paragraphs: [
    "Hallo Anna,",
    "Je bestelling #1003 bij Northwind is onderweg met PostNL.",
    "Met het track & trace-nummer volg je het pakket tot het bij je is.",
    "Heb je een vraag, neem dan contact op met de winkel en noem je bestelnummer."
  ],
  // The carrier's own page is a link to another host; the preview leaves it out, a real mail has it where Shopify does.
  tracking: { carrier: "PostNL", number: "3SABCD1234567", url: null }
})

OrderMessage.PreviewProps = preview()

export default OrderMessage
