import type { Urls } from "../../MailUrls.ts"
import { count, day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * M6: the first sync of a newly connected store is done (`integration.sync`, the onboarding sync step's counts). The
 * figures are the import's own counts, passed in.
 */

export interface StoreSyncedProps {
  readonly url: string
  readonly store: string
  readonly orders: number
  readonly customers: number
  readonly products: number
  /** The oldest order the import reached back to. */
  readonly since: Date
}

export const subject = (props: StoreSyncedProps) => `${props.store} is gesynchroniseerd`

const StoreSynced = (props: StoreSyncedProps) => (
  <Letter
    preview="Je bestellingen, klanten en producten staan in Insyte."
    footer={{ reason: "Je krijgt deze mail omdat je deze winkel koppelde aan Insyte." }}
  >
    <Title>{props.store} staat in Insyte</Title>
    <Lead>
      De eerste synchronisatie met Shopify is klaar. Vanaf nu komen nieuwe bestellingen, klanten en producten vanzelf
      binnen.
    </Lead>
    <Facts
      rows={[
        ["Bestellingen", count(props.orders)],
        ["Klanten", count(props.customers)],
        ["Producten", count(props.products)],
        ["Vanaf", day(props.since)]
      ]}
    />
    <Action href={props.url} fallback={false}>Naar Start</Action>
    <Note>Shopify blijft de bron: wat je daar verandert, neemt Insyte over.</Note>
  </Letter>
)

export const preview = (urls: Urls): StoreSyncedProps => ({
  url: urls.console("/"),
  store: "Northwind",
  orders: 1284,
  customers: 932,
  products: 146,
  since: new Date("2026-05-12T00:00:00Z")
})

StoreSynced.PreviewProps = preview(PREVIEW)

export default StoreSynced
