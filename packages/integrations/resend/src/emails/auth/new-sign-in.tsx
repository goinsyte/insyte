import type { Urls } from "../../MailUrls.ts"
import { moment } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * domain.md §2.11: a sign-in from a country or a device the account has not used before (`auth_events`). The place is
 * Cloudflare's guess from the address (`request.cf`), so the mail says it is approximate.
 */

export interface NewSignInProps {
  readonly at: Date
  /** "Chrome op macOS". */
  readonly device: string
  /** "Amsterdam, Nederland". */
  readonly place: string
  /** Settings → Beveiliging: the sessions list, where one can be ended. */
  readonly sessionsUrl: string
}

export const subject = () => "Nieuwe aanmelding op je account"

const NewSignIn = (props: NewSignInProps) => (
  <Letter
    preview={`Ingelogd vanaf ${props.device} in ${props.place}.`}
    footer={{ reason: "Je krijgt deze mail omdat het om de beveiliging van je Insyte-account gaat." }}
  >
    <Title>Nieuwe aanmelding op je account</Title>
    <Lead>Er is ingelogd op je Insyte-account vanaf een apparaat of een land dat we nog niet van je kenden.</Lead>
    <Facts
      rows={[
        ["Wanneer", moment(props.at)],
        ["Apparaat", props.device],
        ["Locatie", `${props.place} (bij benadering)`]
      ]}
    />
    <Action href={props.sessionsUrl}>Sessies bekijken</Action>
    <Note>
      Was jij dit? Dan hoef je niets te doen. Was jij het niet? Beëindig die sessie en kies een nieuw wachtwoord.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): NewSignInProps => ({
  at: new Date("2026-11-09T07:14:00Z"),
  device: "Chrome op macOS",
  place: "Amsterdam, Nederland",
  sessionsUrl: urls.console("/settings/security")
})

NewSignIn.PreviewProps = preview(PREVIEW)

export default NewSignIn
