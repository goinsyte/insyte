import type { Urls } from "../../MailUrls.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * security.md §2, brute force: after the attempts and the Turnstile check, a 15-minute lock "with an email to the
 * account". It says what happened and when it lifts; it never says how many attempts or from where.
 */

export interface SignInLockedProps {
  readonly minutes: number
  /** The sign-in page with the reset dialog open. */
  readonly resetUrl: string
}

export const subject = (props: SignInLockedProps) => `Inloggen is ${props.minutes} minuten geblokkeerd`

const SignInLocked = (props: SignInLockedProps) => (
  <Letter
    preview="Er is te vaak een verkeerd wachtwoord ingevoerd."
    footer={{ reason: "Je krijgt deze mail omdat het om de beveiliging van je Insyte-account gaat." }}
  >
    <Title>Inloggen is even geblokkeerd</Title>
    <Lead>
      Er is te vaak een verkeerd wachtwoord ingevoerd voor je Insyte-account. Daarom kan er de komende {props.minutes}
      {" "}
      minuten niet worden ingelogd.
    </Lead>
    <Action href={props.resetUrl}>Nieuw wachtwoord kiezen</Action>
    <Note>
      Was jij dit? Wacht dan even en probeer het opnieuw. Was jij het niet? Kies een nieuw wachtwoord: daarmee eindigt
      ook elke sessie die nog openstaat.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): SignInLockedProps => ({
  minutes: 15,
  resetUrl: urls.console("/login?reset=1")
})

SignInLocked.PreviewProps = preview(PREVIEW)

export default SignInLocked
