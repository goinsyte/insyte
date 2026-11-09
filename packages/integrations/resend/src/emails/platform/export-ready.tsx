import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Lead, Note, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/*
 * domain.md §12.15: an export is `ready` in R2 with a notification and a 7-day link (M14), the workspace export of
 * "Je gegevens" included (M17).
 */

export interface ExportReadyProps {
  readonly url: string
  /** What was exported: "Bestellingen, oktober 2026", "Alle gegevens van Northwind". */
  readonly what: string
  readonly expiresAt: Date
}

export const subject = () => "Je export staat klaar"

const ExportReady = (props: ExportReadyProps) => (
  <Letter
    preview={`${props.what}: te downloaden tot ${day(props.expiresAt)}.`}
    footer={{ reason: "Je krijgt deze mail omdat je deze export aanvroeg in Insyte." }}
  >
    <Title>Je export staat klaar</Title>
    <Lead>
      {props.what} is klaar om te downloaden. De link werkt tot {day(props.expiresAt)}.
    </Lead>
    <Action href={props.url} fallback={false}>Export downloaden</Action>
    <Note>
      De export kan persoonsgegevens van je klanten bevatten. Bewaar hem zorgvuldig en stuur de link niet door.
    </Note>
  </Letter>
)

export const preview = (urls: Urls): ExportReadyProps => ({
  url: urls.console("/data/exports/exp_voorbeeld"),
  what: "Bestellingen, oktober 2026",
  expiresAt: new Date("2026-11-16T09:30:00Z")
})

ExportReady.PreviewProps = preview(PREVIEW)

export default ExportReady
