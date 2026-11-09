import type { Urls } from "../../MailUrls.ts"
import { plural, weekday } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Rows, Subtitle, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * M11.5: the daily digest at the workspace's 08:00, holding what quiet hours kept back and what the member chose to
 * receive as a digest. Grouped as the console's notification centre groups them: Primair (asks something of you),
 * then Overig.
 */

export interface DigestItem {
  readonly title: string
  readonly detail?: string | undefined
  readonly href: string
}

export interface DailyDigestProps {
  readonly workspace: string
  readonly date: Date
  readonly primary: ReadonlyArray<DigestItem>
  readonly other: ReadonlyArray<DigestItem>
  readonly url: string
  readonly settingsUrl: string
}

const total = (p: DailyDigestProps) => p.primary.length + p.other.length

export const subject = (props: DailyDigestProps) =>
  `${props.workspace}: ${plural(total(props), "melding", "meldingen")} voor vandaag`

const DailyDigest = (props: DailyDigestProps) => (
  <Letter
    preview={props.primary[0]?.title ?? props.other[0]?.title ?? "Niets nieuws sinds gisteren."}
    footer={{
      reason: `Je krijgt dit overzicht omdat je het dagelijks overzicht aanzette in ${props.workspace}.`,
      links: [{ label: "Meldingen instellen", href: props.settingsUrl }]
    }}
  >
    <Title>Je overzicht voor {weekday(props.date)}</Title>
    <Lead>
      {total(props) === 0
        ? `Er is sinds gisteren niets binnengekomen dat je aandacht vraagt in ${props.workspace}.`
        : `${
          plural(total(props), "melding", "meldingen")
        } in ${props.workspace}, waarvan ${props.primary.length} met een vraag aan jou.`}
    </Lead>
    {props.primary.length === 0 ? null : (
      <>
        <Subtitle>Primair</Subtitle>
        <Rows rows={props.primary} />
      </>
    )}
    {props.other.length === 0 ? null : (
      <>
        <Subtitle>Overig</Subtitle>
        <Rows rows={props.other} />
      </>
    )}
    <Action href={props.url} fallback={false}>Meldingen openen</Action>
  </Letter>
)

export const preview = (urls: Urls): DailyDigestProps => ({
  workspace: "Northwind",
  date: new Date("2026-11-09T07:00:00Z"),
  primary: [
    {
      title: "Nog 2 dagen om bewijs in te dienen",
      detail: "Chargeback bij bestelling #1042",
      href: urls.console("/chargebacks/cb_voorbeeld")
    },
    {
      title: "Ticket #5101 is aan je toegewezen",
      detail: "Waar blijft mijn pakket?",
      href: urls.console("/tickets/5101")
    },
    {
      title: "DPC Apparel meldt vertraging",
      detail: "3 bestellingen, verwacht op 12 november",
      href: urls.console("/suppliers/sup_voorbeeld")
    }
  ],
  other: [
    {
      title: "Automatisering “Retour ontvangen” is 14 keer uitgevoerd",
      href: urls.console("/automations/aut_voorbeeld")
    },
    { title: "Retour R-1042 is binnen", detail: "Aurora Hooded Fleece, maat M", href: urls.console("/returns/1042") }
  ],
  url: urls.console("/notifications"),
  settingsUrl: urls.console("/settings/notifications")
})

DailyDigest.PreviewProps = preview(PREVIEW)

export default DailyDigest
