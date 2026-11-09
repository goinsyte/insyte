import type { Urls } from "../../MailUrls.ts"
import { count, day, money, month } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * M5, supplier statements: on the 1st the month before is closed into a statement (`0 3 1 * *`), and the supplier hears
 * of it (`partner.money`). Figures are the statement's own sums, passed in.
 */

export interface StatementReadyProps {
  readonly url: string
  readonly brand: string
  /** Any day in the statement's month. */
  readonly period: Date
  readonly orders: number
  readonly totalMinor: number
  readonly currency: string
  readonly dueAt: Date
}

export const subject = (props: StatementReadyProps) =>
  `Je afrekening van ${month(props.period)} voor ${props.brand} staat klaar`

const StatementReady = (props: StatementReadyProps) => (
  <Letter
    preview={`${money(props.totalMinor, props.currency)} over ${month(props.period)}.`}
    footer={{ reason: `Je krijgt deze mail omdat je contact bent voor de afrekeningen met ${props.brand}.` }}
  >
    <Title>Je afrekening van {month(props.period)}</Title>
    <Lead>
      {props.brand} heeft de afrekening over {month(props.period)} klaargezet in het leveranciersportaal.
    </Lead>
    <Facts
      rows={[
        ["Periode", month(props.period)],
        ["Bestellingen", count(props.orders)],
        ["Totaal", money(props.totalMinor, props.currency)],
        ["Betaaldatum", day(props.dueAt)]
      ]}
    />
    <Action href={props.url} fallback={false}>Afrekening bekijken</Action>
  </Letter>
)

export const preview = (urls: Urls): StatementReadyProps => ({
  url: urls.console("/supplier/statements/2026-10"),
  brand: "Northwind",
  period: new Date("2026-10-15T12:00:00Z"),
  orders: 214,
  totalMinor: 1_284_050,
  currency: "EUR",
  dueAt: new Date("2026-11-15T12:00:00Z")
})

StatementReady.PreviewProps = preview(PREVIEW)

export default StatementReady
