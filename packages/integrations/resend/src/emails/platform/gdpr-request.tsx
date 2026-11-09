import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * integrations.md §2, compliance: Shopify's `customers/data_request` becomes a `gdpr_requests` row, an export workflow
 * and a notification to the owner, due in 30 days. The owner answers the customer; Insyte gathers what it holds.
 */

export interface GdprRequestProps {
  readonly url: string
  readonly store: string
  /** How the customer is known to the store: an address or a customer number. */
  readonly customer: string
  readonly receivedAt: Date
  readonly dueAt: Date
}

export const subject = (props: GdprRequestProps) => `Gegevensverzoek van een klant van ${props.store}`

const GdprRequest = (props: GdprRequestProps) => (
  <Letter
    preview={`Beantwoord het uiterlijk op ${day(props.dueAt)}.`}
    footer={{ reason: `Je krijgt deze mail omdat je eigenaar bent van de werkruimte van ${props.store}.` }}
  >
    <Title>Een klant vraagt welke gegevens je bewaart</Title>
    <Lead>
      Via Shopify vraagt een klant van {props.store}{" "}
      welke gegevens je over hem of haar bewaart. Insyte zet een export klaar van alles wat het over deze klant heeft.
      Stuur die binnen de termijn naar de klant.
    </Lead>
    <Facts
      rows={[
        ["Winkel", props.store],
        ["Klant", props.customer],
        ["Ontvangen", day(props.receivedAt)],
        ["Uiterlijk beantwoorden", day(props.dueAt)]
      ]}
    />
    <Action href={props.url} fallback={false}>Verzoek bekijken</Action>
    <Note>De AVG geeft je 30 dagen om te antwoorden.</Note>
  </Letter>
)

export const preview = (urls: Urls): GdprRequestProps => ({
  url: urls.console("/settings/privacy/requests/gdpr_voorbeeld"),
  store: "Northwind",
  customer: "eva@example.com",
  receivedAt: new Date("2026-11-09T09:30:00Z"),
  dueAt: new Date("2026-12-09T09:30:00Z")
})

GdprRequest.PreviewProps = preview(PREVIEW)

export default GdprRequest
