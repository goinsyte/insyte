import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { NoteReplies } from "../domain/Ports.ts"

/*
 * An answer to a notification mail (M11 step 13.5; M11 step 5's "replies land in the `email()` handler"): a mail
 * about a ticket is answered to `reply+<token>@<inbound domain>`, the delivery's own address. The answer becomes the
 * member's comment on the record, when it comes from the address the mail went to, the member is still on the team
 * and may comment there (Klantenservice at Bewerken). Only what they wrote counts: the quoted mail below it, and the
 * client's line above that, are cut. Anything else is dropped without a word back: a stranger learns nothing.
 */

const ADDRESS = /^reply\+([0-9a-z]{26})@/

/** Whether a mail's address is an answer to a notification mail, rather than a forwarding address. */
export const isReplyAddress = (to: string) => ADDRESS.test(to.trim().toLowerCase())

/** What the member wrote above the quoted mail, its lines kept; signatures after `-- ` cut. */
export const answerOf = (text: string) => {
  const lines: Array<string> = []
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) break
    if (/^\s*(On|Op)\s.+(wrote|schreef)[^:]*:\s*$/i.test(line)) break
    if (/^-{2,}\s*(Original Message|Oorspronkelijk bericht|Forwarded message|Doorgestuurd bericht)/i.test(line)) break
    if (/^(Van|From):\s/i.test(line) && lines.length > 0) break
    if (line === "-- ") break
    lines.push(line)
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 5000)
}

export type ReplyOutcome = "commented" | "unknown" | "refused" | "empty"

/** The `email()` handler's way in for an answer: the delivery it answers, then the comment, as the workspace. */
export const receiveReply = Effect.fn("Notifications.receiveReply")(function*(
  to: string,
  from: string,
  text: string
) {
  const token = ADDRESS.exec(to.trim().toLowerCase())?.[1]
  if (token === undefined) return "unknown" satisfies ReplyOutcome
  const db = yield* Db
  const [route] = yield* db.routing((sql) =>
    sql<{ workspaceId: string; recipientId: string; subjectType: string | null; subjectId: string | null }>`
      select * from notification_reply(${token})`
  )
  if (route === undefined || route.subjectType === null || route.subjectId === null) {
    return "unknown" satisfies ReplyOutcome
  }
  const body = answerOf(text)
  if (body === "") return "empty" satisfies ReplyOutcome
  const replies = yield* NoteReplies
  return yield* db.scopedFor((sql) =>
    Effect.gen(function*() {
      // The member as they are now: on the team, the mail's address theirs, and allowed to comment on tickets.
      const [member] = yield* sql<{ email: string; level: number }>`
        select lower(u.email) as email,
               case when r.id = 'owner' then 3 else coalesce((r.levels ->> 'support')::int, 0) end as level
        from members m join auth."user" u on u.id = m.user_id
        join roles r on r.workspace_id = m.workspace_id and r.id = m.role_id
        where m.id = ${route.recipientId} and m.deactivated_at is null and m.removed_at is null`
      if (member === undefined || member.email !== from.trim().toLowerCase() || member.level < 2) {
        return "refused" satisfies ReplyOutcome
      }
      const added = yield* replies.comment(sql, {
        workspaceId: route.workspaceId,
        memberId: route.recipientId,
        subjectType: route.subjectType!,
        subjectId: route.subjectId!,
        body
      })
      return (added ? "commented" : "refused") satisfies ReplyOutcome
    })
  ).pipe(Effect.provideService(CurrentWorkspace, { id: route.workspaceId as WorkspaceId }))
})
