import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Campaign } from "../components/layout.tsx"
import { Action, Facts, Lead } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * Marketing (not wired): for a member who has not opened the workspace in a while. The figures are the workspace's own
 * since the last visit, passed in; with none, the mail says only that it is all still there.
 */

export interface ReEngagementProps {
  readonly firstName: string
  readonly workspace: string
  readonly lastSeen: Date
  /** Label and figure, read from the workspace when the mail is written: ["Nieuwe bestellingen", "38"]. */
  readonly since: ReadonlyArray<readonly [string, string]>
  readonly url: string
  readonly unsubscribeUrl: string
}

export const subject = (props: ReEngagementProps) => `${props.workspace} staat nog voor je klaar`

const ReEngagement = (props: ReEngagementProps) => (
  <Campaign
    preview={`Je was er sinds ${day(props.lastSeen)} niet meer.`}
    plate={{
      title: "Alles staat nog waar je het liet",
      lead: `Je was sinds ${day(props.lastSeen)} niet meer in ${props.workspace}.`,
      block: ["Insyte", props.workspace, `Laatst gezien ${day(props.lastSeen)}`]
    }}
    footer={{
      reason: "Je krijgt deze mail omdat je een account hebt bij Insyte.",
      links: [{ label: "Afmelden", href: props.unsubscribeUrl }]
    }}
  >
    <Lead>
      {props.since.length === 0
        ? `${props.firstName}, je werkruimte, je koppelingen en je instellingen staan er nog.`
        : `${props.firstName}, dit gebeurde er in ${props.workspace} sinds je laatste bezoek:`}
    </Lead>
    {props.since.length === 0 ? null : <Facts rows={props.since} />}
    <Action href={props.url} fallback={false}>Werkruimte openen</Action>
  </Campaign>
)

export const preview = (urls: Urls): ReEngagementProps => ({
  firstName: "Eva",
  workspace: "Northwind",
  lastSeen: new Date("2026-10-19T12:00:00Z"),
  since: [["Nieuwe bestellingen", "38"], ["Open tickets", "4"], ["Retouren te beoordelen", "2"]],
  url: urls.console("/"),
  unsubscribeUrl: urls.console("/settings/notifications?unsubscribe=marketing")
})

ReEngagement.PreviewProps = preview(PREVIEW)

export default ReEngagement
