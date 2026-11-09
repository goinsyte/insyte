import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Items, Lead, Note, Status, Subtitle, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * domain.md §3.2 and §12.25: a health check opened a connection incident, and this mail goes to the person on call
 * (`notified_member_id`). It says what is wrong, what Insyte already did (`tried`), and what is left for a person. An
 * incident resolves itself when the check is healthy again; the mail says so, so nobody chases one that is gone.
 */

export type IncidentKind = "webhook_gap" | "token_expiring" | "scope_missing" | "rate_limited" | "sync_failed"

export interface ConnectionIncidentProps {
  readonly url: string
  readonly kind: IncidentKind
  /** "Shopify". */
  readonly provider: string
  /** "Northwind". */
  readonly store: string
  readonly openedAt: Date
  /** `token_expiring` only: when the token stops working. */
  readonly expiresAt?: Date | undefined
  /** What Insyte already did, in its own words: "Opnieuw geprobeerd om 08:15". */
  readonly tried: ReadonlyArray<string>
}

interface Copy {
  readonly subject: string
  readonly title: string
  readonly lead: string
  /** Whether a person has to act, or Insyte is still on it. */
  readonly yours: boolean
  readonly action: string
}

const copy = (p: ConnectionIncidentProps): Copy => {
  switch (p.kind) {
    case "token_expiring":
      return {
        subject: `De koppeling met ${p.provider} verloopt ${
          p.expiresAt === undefined ? "binnenkort" : `op ${day(p.expiresAt)}`
        }`,
        title: `De koppeling met ${p.provider} verloopt`,
        lead: `De toegang van Insyte tot ${p.store} stopt ${
          p.expiresAt === undefined ? "binnenkort" : `op ${day(p.expiresAt)}`
        }. Koppel opnieuw om te voorkomen dat er bestellingen ontbreken.`,
        yours: true,
        action: "Opnieuw koppelen"
      }
    case "scope_missing":
      return {
        subject: `${p.provider} mist een toestemming voor ${p.store}`,
        title: `${p.provider} mist een toestemming`,
        lead:
          `Insyte heeft voor ${p.store} een toestemming nodig die nu niet is gegeven. Koppel opnieuw en keur de gevraagde toegang goed.`,
        yours: true,
        action: "Opnieuw koppelen"
      }
    case "webhook_gap":
      return {
        subject: `${p.provider} stuurt geen updates voor ${p.store}`,
        title: `${p.provider} stuurt geen updates`,
        lead:
          `Er komen al een tijd geen meldingen van ${p.provider} binnen voor ${p.store}, terwijl er wel nieuwe bestellingen zijn. Insyte haalt ze zelf op tot het weer werkt.`,
        yours: false,
        action: "Koppeling bekijken"
      }
    case "rate_limited":
      return {
        subject: `${p.provider} remt de synchronisatie van ${p.store} af`,
        title: `${p.provider} remt de synchronisatie af`,
        lead:
          `${p.provider} laat Insyte tijdelijk minder vragen voor ${p.store}. Nieuwe gegevens komen trager binnen; Insyte gaat vanzelf weer op snelheid.`,
        yours: false,
        action: "Koppeling bekijken"
      }
    case "sync_failed":
      return {
        subject: `Synchroniseren met ${p.provider} lukt niet voor ${p.store}`,
        title: "Synchroniseren lukt niet",
        lead:
          `Insyte krijgt de gegevens van ${p.store} niet binnen van ${p.provider}. Wat er al geprobeerd is, staat hieronder.`,
        yours: false,
        action: "Koppeling bekijken"
      }
  }
}

export const subject = (props: ConnectionIncidentProps) => copy(props).subject

const ConnectionIncident = (props: ConnectionIncidentProps) => {
  const c = copy(props)
  return (
    <Letter
      preview={c.lead}
      footer={{ reason: `Je krijgt deze mail omdat je aanspreekpunt bent voor de koppelingen van ${props.store}.` }}
    >
      <Status>{c.yours ? "Actie nodig" : "Insyte is ermee bezig"}</Status>
      <Title>{c.title}</Title>
      <Lead>{c.lead}</Lead>
      {props.tried.length === 0 ? null : (
        <>
          <Subtitle>Wat Insyte al deed</Subtitle>
          <Items items={props.tried} />
        </>
      )}
      <Action href={props.url} fallback={false}>{c.action}</Action>
      <Note>
        Gemeld op {day(props.openedAt)}. Zodra de koppeling weer gezond is, sluit Insyte deze melding vanzelf.
      </Note>
    </Letter>
  )
}

export const preview = (urls: Urls): ConnectionIncidentProps => ({
  url: urls.console("/settings/integrations/shopify"),
  kind: "webhook_gap",
  provider: "Shopify",
  store: "Northwind",
  openedAt: new Date("2026-11-09T06:15:00Z"),
  tried: ["De koppeling opnieuw gecontroleerd om 07:15", "Ontbrekende bestellingen van de afgelopen 6 uur opgehaald"]
})

ConnectionIncident.PreviewProps = preview(PREVIEW)

export default ConnectionIncident
