import type { Urls } from "../../MailUrls.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Quote, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * M11.5: one note from the catalogue (`@insyte/domain/Notifications`) delivered by e-mail, instantly, to a member who
 * has e-mail on for its kind. The console owns the words for each kind (title, detail, quote); the sender passes them
 * in rendered, so this one template carries every kind. Replies to it become comments on the record (domain.md §13).
 */

export interface NotificationProps {
  /** The catalogue key, for the footer's reason: "chargeback.deadline". */
  readonly kind: string
  readonly workspace: string
  /** The sentence the console's row shows. */
  readonly title: string
  readonly detail?: string | undefined
  /** Someone's own words, where the note has them: a mention, a supplier's message. */
  readonly quote?: string | undefined
  /** What the note is about: "Bestelling #1042", "Ticket #5101". */
  readonly record?: string | undefined
  readonly actionLabel: string
  readonly url: string
  readonly settingsUrl: string
}

export const subject = (props: NotificationProps) => props.title

const Notification = (props: NotificationProps) => (
  <Letter
    preview={props.detail ?? props.title}
    footer={{
      reason: `Je krijgt deze mail omdat e-mail aanstaat voor dit soort meldingen in ${props.workspace}.`,
      links: [{ label: "Meldingen instellen", href: props.settingsUrl }]
    }}
  >
    <Title>{props.title}</Title>
    {props.detail === undefined ? null : <Lead>{props.detail}</Lead>}
    {props.record === undefined ? null : <Facts rows={[["Over", props.record], ["Werkruimte", props.workspace]]} />}
    {props.quote === undefined ? null : <Quote>{props.quote}</Quote>}
    <Action href={props.url} fallback={false}>{props.actionLabel}</Action>
  </Letter>
)

export const preview = (urls: Urls): NotificationProps => ({
  kind: "chargeback.deadline",
  workspace: "Northwind",
  title: "Nog 2 dagen om bewijs in te dienen",
  detail: "Het geschil over bestelling #1042 sluit op 11 november. Het bewijspakket staat klaar als concept.",
  record: "Chargeback bij bestelling #1042",
  actionLabel: "Bewijspakket bekijken",
  url: urls.console("/chargebacks/cb_voorbeeld"),
  settingsUrl: urls.console("/settings/notifications")
})

Notification.PreviewProps = preview(PREVIEW)

export default Notification
