import { accountScopes, grantsOf, SCOPE_GRANTS } from "@insyte/domain/automations/Engine"
import { Forbidden } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { AREA_IDS, type AreaId, canRole, type Level, SPECIAL_IDS, type SpecialId } from "@insyte/domain/Permissions"
import type { Principal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import type { SqlClient } from "effect/sql"

/*
 * A flow's service account (M12 step 2): it acts as itself, never as the person who published it. One per published
 * flow, holding what the live version needs less what was switched off plus what was added (`accountScopes`). Each
 * command that changes the flow brings the account in line on its own transaction: publishing makes or renews it (a new
 * version of the account), pausing or removing disables it, turning on or restoring enables it again.
 */

interface FlowState {
  readonly workspaceId: string
  readonly name: string
  readonly status: string
  readonly liveVersion: number
  readonly removed: boolean
  readonly required: Array<string> | null
  readonly scopesOff: Array<string> | null
  readonly scopesExtra: Array<string> | null
}

interface AccountRow {
  readonly id: string
  readonly scopes: Array<string>
  readonly disabledAt: Date | null
}

const same = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((s) => b.includes(s))

/** The account brought in line with the flow; `renew` (a publication) makes it a new version even if nothing changed. */
export const syncAccount = Effect.fn("Automations.syncAccount")(function*(
  sql: SqlClient.SqlClient,
  automationId: string,
  options: { readonly renew?: boolean } = {}
) {
  const [flow] = yield* sql<FlowState>`
    select a.workspace_id, a.name, a.status, a.live_version, a.deleted_at is not null as removed,
           v.scopes_required as required, s.scopes_off, s.scopes_extra
    from automations a
    left join automation_versions v on v.automation_id = a.id and v.version = a.live_version
    left join automation_settings s on s.automation_id = a.id
    where a.id = ${automationId}`
  if (flow === undefined) return
  const [account] = yield* sql<AccountRow>`
    select id, scopes, disabled_at from service_accounts where automation_id = ${automationId} for update`
  const off = flow.liveVersion === 0 || flow.status !== "active" || flow.removed
  if (flow.liveVersion === 0) {
    if (account !== undefined && account.disabledAt === null) {
      yield* sql`update service_accounts set disabled_at = now() where id = ${account.id}`
    }
    return
  }
  const scopes = [
    ...accountScopes(flow.required ?? [], { scopesOff: flow.scopesOff ?? [], scopesExtra: flow.scopesExtra ?? [] })
  ]
  const label = `Workflow: ${flow.name}`
  if (account === undefined) {
    yield* sql`
      insert into service_accounts (id, workspace_id, automation_id, label, scopes, disabled_at)
      values (${mintId("sa")}, ${flow.workspaceId}, ${automationId}, ${label}, ${scopes}::text[],
              ${off ? new Date() : null})`
    return
  }
  const renew = options.renew === true || !same(account.scopes, scopes)
  yield* sql`
    update service_accounts
    set label = ${label}, scopes = ${scopes}::text[],
        version = version + ${renew ? 1 : 0},
        rotated_at = case when ${renew} then now() else rotated_at end,
        disabled_at = case when ${off} then coalesce(disabled_at, now()) else null end
    where id = ${account.id}`
})

const LEVELS_OFF = Object.fromEntries(AREA_IDS.map((a) => [a, 0])) as Record<AreaId, Level>
const SPECIALS_OFF = Object.fromEntries(SPECIAL_IDS.map((s) => [s, false])) as Record<SpecialId, boolean>

/** An account as the principal its steps run as: its rights as levels, the flow's stores, no refund limit. */
export const principalOf = (
  workspaceId: string,
  account: {
    readonly id: string
    readonly label: string
    readonly version: number
    readonly scopes: ReadonlyArray<string>
  },
  storeScope: ReadonlyArray<string> | null
): Principal => {
  const { levels, specials } = grantsOf(account.scopes)
  return {
    kind: "service_account",
    id: account.id,
    userId: null,
    workspaceId: workspaceId as WorkspaceId,
    partnerId: null,
    role: {
      id: "service_account",
      label: account.label,
      version: account.version,
      levels: { ...LEVELS_OFF, ...levels } as Record<AreaId, Level>,
      specials: { ...SPECIALS_OFF, ...specials } as Record<SpecialId, boolean>,
      // A flow refunds only through a step with its own amount, which does not run yet (M13): none until then.
      refundLimit: 0,
      stores: storeScope === null ? "all" : [...storeScope]
    },
    storeScope: storeScope === null ? null : [...storeScope]
  }
}

/**
 * Whether `principal` may hand a flow these rights: each one's grants (`SCOPE_GRANTS`) must be within what the principal
 * holds itself, as a key's rights are within its creator's (12-auth §6 rule 5). Publishing, granting a right in
 * Instellingen, and starting a run by hand over `/v1` or MCP ask it, so nobody gets a flow to do what they may not.
 * `Forbidden` names the first permission missing.
 */
export const mayHand = Effect.fn("Automations.mayHand")(function*(principal: Principal, scopes: ReadonlyArray<string>) {
  const role = {
    ...principal.role,
    stores: principal.role.stores === "all" ? "all" as const : [...principal.role.stores]
  }
  for (const scope of scopes) {
    for (const g of SCOPE_GRANTS[scope] ?? []) {
      if (!canRole(role, g.area as AreaId, g.level as Level)) {
        return yield* new Forbidden({ permission: g.area, level: g.level, roleLabel: principal.role.label })
      }
      if (g.special !== undefined && !canRole(role, g.special as SpecialId)) {
        return yield* new Forbidden({ permission: g.special, level: 0, roleLabel: principal.role.label })
      }
    }
  }
})
