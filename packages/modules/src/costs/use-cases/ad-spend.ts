import { Db } from "@insyte/database/Db"
import type { WorkspaceId } from "@insyte/domain/Ids"
import { CurrentWorkspace } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { type AdProvider, AdSpend } from "../domain/Ports.ts"

/*
 * The daily ad spend sync (M13 step 5): for every connected Meta or Google Ads account, the last days it reports,
 * written whole per day and campaign into `ad_spend_day` (a late correction by the provider replaces the day). An
 * environment without the provider's app keys reads nothing, and an account that fails is left for the next day; its
 * lines keep what they had. With no account connected anywhere (today), the sync visits no workspace.
 */

/** How many days back each run reads again: providers settle a day's spend over the next few. */
export const DAYS_BACK = 3

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10)

const syncIn = Effect.fn("Costs.syncAdSpend")(function*(workspaceId: WorkspaceId, now: Date) {
  const adSpend = yield* AdSpend
  const db = yield* Db
  const accounts = yield* db.scopedFor((sql) =>
    sql<{ id: string; provider: AdProvider; accountRef: string }>`
      select id, provider, account_ref from connections
      where provider in ('meta', 'google_ads') and status = 'connected' order by id`
  )
  const to = isoDay(now.getTime() - 86_400_000)
  const from = isoDay(now.getTime() - DAYS_BACK * 86_400_000)
  let written = 0
  for (const account of accounts) {
    if (!adSpend.configured(account.provider)) continue
    const days = yield* adSpend.read({
      provider: account.provider,
      connectionId: account.id,
      accountRef: account.accountRef,
      from,
      to
    }).pipe(
      Effect.tapError((e) => Effect.logWarning("ad spend not read", { provider: e.provider, reason: e.reason })),
      Effect.orElseSucceed(() => undefined)
    )
    if (days === undefined) continue
    yield* db.scopedFor((sql) =>
      Effect.gen(function*() {
        yield* sql`delete from ad_spend_day where connection_id = ${account.id}
                   and day between ${from}::date and ${to}::date`
        for (const d of days) {
          yield* sql`
            insert into ad_spend_day (workspace_id, connection_id, provider, account_ref, campaign_ref, channel, day,
                                      spend_minor, currency)
            values (${workspaceId}, ${account.id}, ${account.provider}, ${account.accountRef}, ${d.campaignRef},
                    ${d.channel}, ${d.day}::date, ${d.spendMinor}, ${d.currency})
            on conflict (connection_id, day, campaign_ref) do update
              set spend_minor = excluded.spend_minor, currency = excluded.currency, channel = excluded.channel,
                  synced_at = now()`
          written++
        }
        yield* sql`update connections set last_synced_at = now() where id = ${account.id}`
      })
    )
  }
  return written
})

/** One workspace's connected ad accounts read and written; how many day rows were written. */
export const syncWorkspace = (workspaceId: WorkspaceId, now = new Date()) =>
  syncIn(workspaceId, now).pipe(Effect.provideService(CurrentWorkspace, { id: workspaceId }))

/** The workspaces with a connected ad account, read across workspaces. */
export const syncWorkspaces = Effect.flatMap(
  Effect.service(Db),
  (db) =>
    db.routing((sql) =>
      Effect.map(
        sql<{ workspaceId: WorkspaceId }>`select workspace_id from ad_spend_workspaces()`,
        (rows) => rows.map((r) => r.workspaceId)
      )
    )
)
