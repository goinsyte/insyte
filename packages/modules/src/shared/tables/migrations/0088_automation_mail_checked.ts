import { statements } from "../statements.ts"

/*
 * Which published versions passed the publish rules for "E-mail versturen" (W9.3). Before this release the step never
 * ran (the executor skipped it as unsupported) and publishing did not check its recipient, subject or body; once it
 * runs, a version published then would start mailing shoppers with whatever it held (the old default subject included).
 * So a version is marked when it is published from now on, and the executor skips a mail step in a version without the
 * mark and asks the flow's owner to publish it again.
 *
 * - `mail_checked`: true for a version published (or brought back by undo from one) under the mail rules; every version
 *   published before is false. Set when the row is written: versions never change after.
 */
export default statements(
  "alter table automation_versions add column mail_checked boolean not null default false"
)
