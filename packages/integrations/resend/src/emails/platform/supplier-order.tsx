import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Facts, Items, Lead, Note, Paragraph, Subtitle, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * An order forwarded to a supplier by mail (M8.2, `Forwarding.forward`): their own lines, where to ship them, and the
 * brand's note. Never the customer's email or phone, never prices or another supplier's lines. Until the portal opens
 * (M16) the supplier confirms by replying; the brand marks it confirmed.
 */

export interface SupplierOrderProps {
  readonly supplier: string
  readonly shop: string
  readonly order: {
    readonly leg_id: string
    readonly order: { readonly number: string; readonly placed_at: string; readonly note: string | null }
    readonly ship_to: Readonly<
      Record<"name" | "line1" | "line2" | "city" | "postcode" | "region" | "country", string | null>
    >
    readonly lines: ReadonlyArray<{
      readonly sku: string | null
      readonly title: string
      readonly variant_title: string | null
      readonly quantity: number
    }>
  }
}

export const subject = (props: SupplierOrderProps) => `Nieuwe bestelling ${props.order.order.number} van ${props.shop}`

const addressOf = (a: SupplierOrderProps["order"]["ship_to"]) =>
  [a.name, a.line1, a.line2, [a.postcode, a.city].filter(Boolean).join(" "), a.region, a.country]
    .filter((part): part is string => part !== null && part !== "")

const SupplierOrder = (props: SupplierOrderProps) => {
  const { order, ship_to: to, lines } = props.order
  const units = lines.reduce((n, l) => n + l.quantity, 0)
  return (
    <Letter
      preview={`${units} ${units === 1 ? "stuk" : "stuks"} voor ${props.shop}, te versturen naar ${
        to.city ?? "de klant"
      }.`}
      footer={{
        reason: `Je krijgt deze mail omdat ${props.shop} jou als leverancier van deze producten heeft opgegeven.`
      }}
    >
      <Title>Bestelling {order.number}</Title>
      <Lead>
        Hallo {props.supplier}, {props.shop}{" "}
        vraagt je deze bestelling te versturen. Laat het weten door op deze mail te antwoorden.
      </Lead>
      <Facts
        rows={[["Van", props.shop], ["Besteld op", day(new Date(order.placed_at))], ["Bestelling", order.number]]}
      />
      <Subtitle>Te versturen</Subtitle>
      <Items
        items={lines.map((l) =>
          `${l.quantity} × ${l.title}${l.variant_title ? ` (${l.variant_title})` : ""}${l.sku ? ` · ${l.sku}` : ""}`
        )}
      />
      <Subtitle>Verzendadres</Subtitle>
      <Paragraph tight>
        {addressOf(to).map((line, i) => (
          <span key={i}>
            {line}
            <br />
          </span>
        ))}
      </Paragraph>
      {order.note ?
        (
          <>
            <Subtitle>Notitie van {props.shop}</Subtitle>
            <Paragraph>{order.note}</Paragraph>
          </>
        ) :
        null}
      <Note>Kenmerk {props.order.leg_id}. Vermeld het als je over deze bestelling mailt.</Note>
    </Letter>
  )
}

export const preview = (_urls: Urls): SupplierOrderProps => ({
  supplier: "Atelier Noord",
  shop: "Northwind",
  order: {
    leg_id: "fwd_voorbeeld",
    order: { number: "#1042", placed_at: "2026-11-09T10:30:00Z", note: "Graag zonder factuur in het pakket." },
    ship_to: {
      name: "Anna de Vries",
      line1: "Prinsengracht 263",
      line2: null,
      city: "Amsterdam",
      postcode: "1016 GV",
      region: null,
      country: "NL"
    },
    lines: [
      { sku: "LIN-M", title: "Linnen overhemd", variant_title: "M", quantity: 1 },
      { sku: "WOL-1", title: "Wollen trui", variant_title: null, quantity: 2 }
    ]
  }
})

SupplierOrder.PreviewProps = preview(PREVIEW)

export default SupplierOrder
