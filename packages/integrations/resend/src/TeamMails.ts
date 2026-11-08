import type { InvitationFacts } from "@insyte/modules/shared/domain/Mailer"
import { layout, type Rendered } from "./AuthMails.ts"

/*
 * The invitation (M3.4), in Dutch, in the account mails' layout: whose workspace, who asked and as what, their note in
 * their own words, one button to the landing, and until when the link works.
 */

const until = (at: Date) =>
  at.toLocaleDateString("nl-NL", { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" })

export const renderTeamInvite = (url: string, facts: InvitationFacts): Rendered =>
  layout({
    subject: `${facts.inviter} nodigt je uit voor ${facts.workspace}`,
    heading: `Kom erbij in ${facts.workspace}`,
    lead: `${facts.inviter} nodigde je uit om als ${facts.role} mee te werken in ${facts.workspace} op Insyte.`,
    quote: facts.message,
    action: "Uitnodiging bekijken",
    link: url,
    after: `De uitnodiging werkt tot ${
      until(facts.expiresAt)
    } en alleen voor dit e-mailadres. Verwachtte je hem niet? Dan kun je deze mail negeren.`
  })
