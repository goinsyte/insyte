import type { Urls } from "../../MailUrls.ts"
import { Campaign } from "../components/layout.tsx"
import { Action, Facts, Lead, Note } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * Marketing (not wired): the onboarding nudge for a workspace that skipped the store step (`connect_store` set up for
 * later, domain.md §2.10). It names what connecting reads and what it does not do.
 */

export interface ConnectStoreNudgeProps {
  readonly firstName: string
  readonly workspace: string
  readonly url: string
  readonly unsubscribeUrl: string
}

export const subject = (props: ConnectStoreNudgeProps) => `${props.workspace} wacht nog op je winkel`

const ConnectStoreNudge = (props: ConnectStoreNudgeProps) => (
  <Campaign
    preview="Zonder winkel is er nog niets om te laten zien."
    plate={{
      title: "Nog één stap",
      lead: `${props.workspace} staat klaar, maar zonder winkel is er nog niets om te laten zien.`,
      block: ["Insyte", "Winkel koppelen", props.workspace]
    }}
    footer={{
      reason: "Je krijgt deze mail omdat je een werkruimte aanmaakte bij Insyte.",
      links: [{ label: "Afmelden", href: props.unsubscribeUrl }]
    }}
  >
    <Lead>
      {props.firstName}, koppelen gaat via Shopify: je logt in, geeft Insyte toestemming en de eerste synchronisatie
      begint.
    </Lead>
    <Facts
      rows={[
        ["Insyte leest", "Bestellingen, klanten, producten en afhandelingen"],
        ["Bron", "Shopify, voor alles wat je daar verandert"]
      ]}
    />
    <Action href={props.url} fallback={false}>Winkel koppelen</Action>
    <Note>Ontkoppelen kan altijd, bij Instellingen → Winkels.</Note>
  </Campaign>
)

export const preview = (urls: Urls): ConnectStoreNudgeProps => ({
  firstName: "Eva",
  workspace: "Northwind",
  url: urls.console("/onboarding?step=store"),
  unsubscribeUrl: urls.console("/settings/notifications?unsubscribe=marketing")
})

ConnectStoreNudge.PreviewProps = preview(PREVIEW)

export default ConnectStoreNudge
