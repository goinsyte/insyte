import type { OrderDelayFacts } from "@insyte/modules/shared/domain/Mailer"
import { ShopLetter } from "../components/layout.tsx"
import { Facts, Lead, Paragraph, Title } from "../components/text.tsx"

/*
 * M10.2: the shopper's order is late, in the store's name. The words were written when the plate was drawn and the
 * team filed it as it stood (`orders/domain/DelayMail.ts`), so the template sets them as they are: the greeting and the
 * news as the lead, the rest as paragraphs, the order's number beside.
 */

export const subject = (props: OrderDelayFacts) => props.subject

const OrderDelayed = (props: OrderDelayFacts) => {
  const [hello, news, ...rest] = props.paragraphs
  return (
    <ShopLetter
      shop={props.shop}
      preview={news ?? props.subject}
      footer={{ reason: `Je krijgt deze mail omdat je bij ${props.shop} iets hebt besteld.` }}
    >
      <Title>Later dan verwacht</Title>
      <Lead>{[hello, news].filter((p) => p !== undefined).join(" ")}</Lead>
      <Facts rows={[["Bestelling", props.number]]} />
      {rest.map((p) => <Paragraph key={p}>{p}</Paragraph>)}
    </ShopLetter>
  )
}

export const preview = (): OrderDelayFacts => ({
  shop: "Northwind",
  number: "#1003",
  subject: "Je bestelling #1003 is later dan verwacht",
  paragraphs: [
    "Hallo Anna,",
    "Je bestelling #1003 bij Northwind is later dan verwacht. We verwachten hem nu op dinsdag 18 november bij je.",
    "Het gaat om 1 × Linnen overhemd (M).",
    "Je hoeft niets te doen. Heb je een vraag, neem dan contact op met de winkel en noem je bestelnummer."
  ],
  items: [{ title: "Linnen overhemd", variant: "M", qty: 1 }]
})

OrderDelayed.PreviewProps = preview()

export default OrderDelayed
