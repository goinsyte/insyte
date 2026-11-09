import type { Urls } from "../../MailUrls.ts"
import { day } from "../components/format.ts"
import { Letter } from "../components/layout.tsx"
import { Action, Facts, Lead, Title } from "../components/text.tsx"
import { PREVIEW } from "../preview.ts"

/* `Courses.remind` (api.md, courses≥2): "Herinneren", in the app and by mail, after the undo window. */

export interface CourseReminderProps {
  readonly url: string
  readonly course: string
  readonly workspace: string
  readonly sender: string
  readonly stepsDone: number
  readonly steps: number
  readonly assignedAt: Date
}

export const subject = (props: CourseReminderProps) => `Herinnering: ${props.course}`

const CourseReminder = (props: CourseReminderProps) => (
  <Letter
    preview={`${props.sender} vraagt je de cursus af te ronden.`}
    footer={{ reason: `Je krijgt deze mail omdat ${props.sender} je een herinnering stuurde in ${props.workspace}.` }}
  >
    <Title>{props.course}</Title>
    <Lead>
      {props.sender} vraagt je de cursus {props.course} in {props.workspace} af te ronden.
    </Lead>
    <Facts
      rows={[
        ["Voortgang", `${props.stepsDone} van ${props.steps} stappen`],
        ["Toegewezen op", day(props.assignedAt)]
      ]}
    />
    <Action href={props.url} fallback={false}>
      {props.stepsDone === 0 ? "Cursus starten" : "Verder met de cursus"}
    </Action>
  </Letter>
)

export const preview = (urls: Urls): CourseReminderProps => ({
  url: urls.console("/courses/crs_voorbeeld"),
  course: "Retouren afhandelen",
  workspace: "Northwind",
  sender: "Elena Hart",
  stepsDone: 3,
  steps: 8,
  assignedAt: new Date("2026-11-02T09:00:00Z")
})

CourseReminder.PreviewProps = preview(PREVIEW)

export default CourseReminder
