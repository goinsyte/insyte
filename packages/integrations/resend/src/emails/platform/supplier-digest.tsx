import type { Urls } from "../../MailUrls.ts"
import { plural, weekday } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Rows, Subtitle, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * P4: the supplier's digest at their local 08:00 and the late reminder at 14:00, per contact who has them on
 * (`supplier_contacts.notify`: `digest`, `late`). The supplier sees the brand's orders for them only.
 */

export interface SupplierOrder {
  /** "#1042". */
  readonly number: string
  /** "2 artikelen · besteld 8 november". */
  readonly detail: string
  readonly href: string
}

export interface SupplierDigestProps {
  /** 08:00 or 14:00. */
  readonly moment: "morning" | "late"
  readonly brand: string
  readonly date: Date
  readonly toShip: number
  readonly late: ReadonlyArray<SupplierOrder>
  readonly url: string
  readonly settingsUrl: string
}

export const subject = (props: SupplierDigestProps) =>
  props.moment === "late"
    ? `${plural(props.late.length, "bestelling", "bestellingen")} van ${props.brand} te laat`
    : `${plural(props.toShip, "bestelling", "bestellingen")} van ${props.brand} te versturen`

const SupplierDigest = (props: SupplierDigestProps) => (
  <Letter
    preview={props.moment === "late"
      ? `Nog niet verstuurd: ${props.late.map((o) => o.number).join(", ")}.`
      : `${plural(props.toShip, "bestelling", "bestellingen")} klaar om te versturen.`}
    footer={{
      reason: `Je krijgt deze mail omdat je dit overzicht aanzette in het leveranciersportaal van ${props.brand}.`,
      links: [{ label: "Meldingen instellen", href: props.settingsUrl }]
    }}
  >
    <Title>
      {props.moment === "late" ? "Nog niet verstuurd" : `Je bestellingen voor ${weekday(props.date)}`}
    </Title>
    <Lead>
      {props.moment === "late"
        ? `Deze bestellingen van ${props.brand} hadden vandaag weg moeten gaan en zijn nog niet als verstuurd gemeld.`
        : `Dit staat vandaag voor je klaar in het leveranciersportaal van ${props.brand}.`}
    </Lead>
    {props.moment === "late" ?
      null :
      <Facts rows={[["Te versturen", String(props.toShip)], ["Te laat", String(props.late.length)]]} />}
    {props.late.length === 0 ? null : (
      <>
        <Subtitle>Te laat</Subtitle>
        <Rows rows={props.late.map((o) => ({ title: o.number, detail: o.detail, href: o.href }))} />
      </>
    )}
    <Action href={props.url} fallback={false}>Bestellingen openen</Action>
  </Letter>
)

export const preview = (urls: Urls): SupplierDigestProps => ({
  moment: "morning",
  brand: "Northwind",
  date: new Date("2026-11-09T07:00:00Z"),
  toShip: 6,
  late: [{ number: "#1038", detail: "2 artikelen · besteld 5 november", href: urls.console("/supplier/orders/1038") }],
  url: urls.console("/supplier/orders"),
  settingsUrl: urls.console("/supplier/settings")
})

SupplierDigest.PreviewProps = preview(PREVIEW)

export default SupplierDigest
