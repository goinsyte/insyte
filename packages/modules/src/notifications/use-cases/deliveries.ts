import { mintId } from "@insyte/domain/Ids"
import { notificationKind } from "@insyte/domain/Notifications"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"
import { Mailer } from "../../shared/domain/Mailer.ts"
import { wordsOf } from "../domain/Words.ts"

/*
 * Notes outside the app (M11 step 13.5). The relay's sink plans a delivery per channel a member has on for the kind
 * (`fanout.ts`); what is due is sent here, on the sink's own transaction, and the minute sweep sends what quiet hours
 * or a failed try held back. A mail that does not go is tried three times, five minutes further apart each time, then
 * kept as `failed` with why. A member deactivated or removed in between is skipped.
 *
 * The daily digest: on a working day, once the member's hour has come in the workspace's timezone, one mail with what
 * is unread in their inbox since the last one (at most a day), Primair first. Nothing unread, no mail; the day is
 * marked all the same.
 */

const ATTEMPTS = 3
const BATCH = 25

interface Due {
  readonly id: string
  readonly recipientId: string
  readonly kind: string
  readonly subjectId: string | null
  readonly data: Record<string, unknown>
  readonly attempts: number
  readonly email: string | null
  readonly active: boolean
  readonly actor: string | null
  readonly workspace: string
}

/** The e-mails due in the transaction's workspace, sent; how many went. */
export const sendDue = Effect.fn("Notifications.sendDue")(function*(sql: SqlClient.SqlClient, at?: Date) {
  const now = at ?? new Date()
  const due = yield* sql<Due>`
    select d.id, d.recipient_id, d.kind, d.subject_id, d.data, d.attempts, u.email,
           (m.deactivated_at is null and m.removed_at is null) as active, au.name as actor, w.name as workspace
    from notification_deliveries d
    join workspaces w on w.id = d.workspace_id
    left join members m on m.id = d.recipient_id
    left join auth."user" u on u.id = m.user_id
    left join members am on am.id = d.actor_id
    left join auth."user" au on au.id = am.user_id
    where d.state = 'pending' and d.channel = 'email' and d.not_before <= ${now}
    order by d.not_before limit ${BATCH}
    for update of d skip locked`
  const mailer = yield* Mailer
  let sent = 0
  for (const d of due) {
    if (!d.active || d.email === null) {
      yield* sql`update notification_deliveries set state = 'skipped' where id = ${d.id}`
      continue
    }
    const words = wordsOf({ kind: d.kind, subjectId: d.subjectId, actor: d.actor, data: d.data })
    const went = yield* mailer.send({
      kind: "member.notification",
      to: d.email,
      reference: d.id,
      memberNote: { workspace: d.workspace, kind: d.kind, ...words }
    }).pipe(Effect.as(null), Effect.catchTag("MailNotSent", (e) => Effect.succeed(e.reason)))
    if (went === null) {
      sent++
      yield* sql`update notification_deliveries set state = 'sent', sent_at = now(), attempts = attempts + 1
                 where id = ${d.id}`
    } else if (d.attempts + 1 >= ATTEMPTS) {
      yield* sql`update notification_deliveries set state = 'failed', attempts = attempts + 1, error = ${went}
                 where id = ${d.id}`
    } else {
      yield* sql`update notification_deliveries
                 set attempts = attempts + 1, error = ${went},
                     not_before = ${now}::timestamptz + make_interval(mins => ${5 * (d.attempts + 1)})
                 where id = ${d.id}`
    }
  }
  return sent
})

/** A delivery put in line for a member, with the note's facts, from `not_before` on. */
export const plan = (
  sql: SqlClient.SqlClient,
  row: {
    readonly workspaceId: string
    readonly recipientId: string
    readonly notificationId: string | null
    readonly channel: "email" | "push" | "slack"
    readonly kind: string
    readonly subjectType: string
    readonly subjectId: string
    readonly actor: string | null
    readonly data: Record<string, unknown>
    readonly notBefore: Date | null
  }
) =>
  sql`insert into notification_deliveries (id, workspace_id, recipient_id, notification_id, channel, kind, subject_type,
                                           subject_id, actor_id, data, not_before)
      values (${mintId("dlv")}, ${row.workspaceId}, ${row.recipientId}, ${row.notificationId}, ${row.channel},
              ${row.kind}, ${row.subjectType}, ${row.subjectId}, ${row.actor}, ${JSON.stringify(row.data)}::jsonb,
              coalesce(${row.notBefore}::timestamptz, now()))`

interface DigestDue {
  readonly memberId: string
  readonly email: string
  readonly workspace: string
  readonly day: string
  readonly since: Date
}

interface Unread {
  readonly kind: string
  readonly subjectId: string | null
  readonly data: Record<string, unknown>
  readonly actor: string | null
}

/**
 * The digests due in the transaction's workspace at `at`, sent; how many went. `since` replaces the day's window (the
 * dev route's, so a test can send a digest for a day that is not today).
 */
export const digestDue = Effect.fn("Notifications.digestDue")(function*(
  sql: SqlClient.SqlClient,
  at?: Date,
  since?: Date
) {
  const now = at ?? new Date()
  const members = yield* sql<DigestDue>`
    with here as (
      select w.name, (${now}::timestamptz at time zone w.timezone) as local
      from workspaces w where w.id = app_workspace_id()
    )
    select m.id as member_id, u.email, here.name as workspace, here.local::date::text as day,
           greatest(coalesce((select max(g.created_at) from digests g where g.recipient_id = m.id),
                             ${now}::timestamptz - interval '1 day'),
                    ${now}::timestamptz - interval '1 day') as since
    from members m
    cross join here
    join auth."user" u on u.id = m.user_id
    left join notification_settings s on s.recipient_id = m.id
    where m.deactivated_at is null and m.removed_at is null
      and coalesce(s.digest_on, true)
      and extract(isodow from here.local) between 1 and 5
      and to_char(here.local, 'HH24:MI') >= coalesce(s.digest_at, '08:00')
      and not exists (select 1 from digests g where g.recipient_id = m.id and g.day = here.local::date)`
  const mailer = yield* Mailer
  let sent = 0
  for (const member of members) {
    const notes = yield* sql<Unread>`
      select n.kind, n.subject_id, n.data, au.name as actor
      from notifications n
      left join members am on n.actor_kind = 'member' and am.id = n.actor_id
      left join auth."user" au on au.id = am.user_id
      where n.recipient_kind = 'member' and n.recipient_id = ${member.memberId}
        and n.read_at is null and n.archived_at is null
        and (n.snoozed_until is null or n.snoozed_until <= ${now})
        and n.created_at > ${since ?? member.since}
      order by n.created_at desc limit 30`
    // The day is claimed first: two sweeps at once send one digest.
    const [claimed] = yield* sql<{ day: string }>`
      insert into digests (workspace_id, recipient_id, day, notes)
      values (app_workspace_id(), ${member.memberId}, ${member.day}::date, ${notes.length})
      on conflict do nothing returning day::text`
    if (claimed === undefined || notes.length === 0) continue
    const lines = notes.map((n) => ({
      primary: notificationKind(n.kind)?.primary ?? false,
      words: wordsOf({ kind: n.kind, subjectId: n.subjectId, actor: n.actor, data: n.data })
    }))
    const line = (l: (typeof lines)[number]) => ({ title: l.words.title, detail: l.words.detail, path: l.words.path })
    const went = yield* mailer.send({
      kind: "member.digest",
      to: member.email,
      reference: `${member.memberId}:${member.day}`,
      digest: {
        workspace: member.workspace,
        date: now,
        primary: lines.filter((l) => l.primary).map(line),
        other: lines.filter((l) => !l.primary).map(line)
      }
    }).pipe(Effect.as(true), Effect.catchTag("MailNotSent", () => Effect.succeed(false)))
    if (went) {
      sent++
      yield* sql`update digests set sent_at = now() where recipient_id = ${member.memberId} and day = ${member.day}::date`
    } else {
      // Not sent: the next turn tries again.
      yield* sql`delete from digests where recipient_id = ${member.memberId} and day = ${member.day}::date`
    }
  }
  return sent
})
