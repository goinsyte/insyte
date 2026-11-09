import type { Urls } from "../../MailUrls.ts"
import { count, day, money, month } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * domain.md §12.10: a month's payout moves to `approved` and the affiliate hears of it (`affiliate.payout.approved`,
 * on by default for affiliates). The amount is the ledger's sum and the date the programme's one payday.
 */

export interface AffiliatePayoutProps {
  readonly url: string
  readonly brand: string
  readonly period: Date
  readonly conversions: number
  readonly amountMinor: number
  readonly currency: string
  readonly payday: Date
}

export const subject = (props: AffiliatePayoutProps) => `Je uitbetaling van ${month(props.period)} is goedgekeurd`

const AffiliatePayout = (props: AffiliatePayoutProps) => (
  <Letter
    preview={`${money(props.amountMinor, props.currency)}, uitbetaald op ${day(props.payday)}.`}
    footer={{ reason: `Je krijgt deze mail omdat je partner bent van ${props.brand}.` }}
  >
    <Title>Je uitbetaling is goedgekeurd</Title>
    <Lead>
      {props.brand} keurde je uitbetaling over {month(props.period)} goed. Het bedrag wordt op {day(props.payday)}{" "}
      overgemaakt.
    </Lead>
    <Facts
      rows={[
        ["Periode", month(props.period)],
        ["Doorverwijzingen", count(props.conversions)],
        ["Bedrag", money(props.amountMinor, props.currency)],
        ["Uitbetaling", day(props.payday)]
      ]}
    />
    <Action href={props.url} fallback={false}>Uitbetaling bekijken</Action>
  </Letter>
)

export const preview = (urls: Urls): AffiliatePayoutProps => ({
  url: urls.console("/affiliate/payouts/2026-10"),
  brand: "Northwind",
  period: new Date("2026-10-15T12:00:00Z"),
  conversions: 37,
  amountMinor: 41_820,
  currency: "EUR",
  payday: new Date("2026-11-15T12:00:00Z")
})

AffiliatePayout.PreviewProps = preview(PREVIEW)

export default AffiliatePayout
