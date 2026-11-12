import { mintId } from "@insyte/domain/Ids"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import * as Outbox from "../../shared/use-cases/Outbox.ts"
import { reminderDue } from "../domain/Rules.ts"

/*
 * The deadline reminders (M13 step 3; domain.md §8): five days, two days and six hours before a case's deadline, the
 * team hears it is coming, as a `chargeback.deadline` note. The hourly sweep runs this per workspace as `system`; each
 * reminder is a timeline line, once per offset per deadline (`chargeback_events_reminder`), and an outbox event the
 * notifications sink fans out. A reminder whose moment the sweep missed by more than one step is not sent late: only the
 * nearest one that has come is.
 */

export const remindIn = Effect.fn("Chargebacks.remindIn")(function*(
  sql: SqlClient.SqlClient,
  workspaceId: string,
  at: Date
) {
  const due = yield* sql<{ id: string; deadlineAt: Date }>`
    select id, deadline_at from chargebacks
    where status in ('open', 'awaiting_evidence') and deadline_at > ${at}
      and deadline_at <= ${at}::timestamptz + interval '5 days'`
  const outboxIds: Array<string> = []
  for (const c of due) {
    const reminder = reminderDue(c.deadlineAt.getTime(), at.getTime())
    if (reminder === undefined) continue
    const [made] = yield* sql<{ id: string }>`
      insert into chargeback_events (id, workspace_id, chargeback_id, at, actor_kind, actor_id, kind, data)
      values (${mintId("cbe")}, ${workspaceId}, ${c.id}, ${at}, 'insyte', null, 'deadline_reminder',
              ${JSON.stringify({ offset: reminder.offset, deadline: c.deadlineAt.toISOString() })}::jsonb)
      on conflict do nothing returning id`
    if (made === undefined) continue
    outboxIds.push(
      yield* Outbox.write(sql, workspaceId, {
        type: "chargeback.deadline_near",
        workspaceId,
        chargebackId: c.id,
        offset: reminder.offset
      })
    )
  }
  return outboxIds
})
