import { Db } from "@insyte/database/Db"
import { Conflict, NotFound } from "@insyte/domain/Errors"
import { mintId, type WorkspaceId } from "@insyte/domain/Ids"
import { AREA_IDS, type AreaId, SPECIAL_IDS, type SpecialId } from "@insyte/domain/Permissions"
import type { Principal } from "@insyte/domain/Principal"
import { CurrentUser } from "@insyte/domain/Session"
import { Effect } from "effect"
import { PendingEvents } from "../../shared/domain/Outbox.ts"
import {
  AffiliateMe,
  type AffiliateSelf,
  Applied,
  NotAffiliate,
  ProgramLanding,
  type Tier
} from "../domain/Affiliates.ts"
import type { ApplyInput, ReapplyInput } from "../domain/Inputs.ts"

/*
 * The person before (and beside) the affiliate (M16 step 3; PLAN item 22): the affiliates they are, the application
 * that waits or was turned down, the programme's public page, applying and applying again. Before any workspace is
 * chosen, so through definers that answer only the caller's own (`app.user_id`, 0108), as the supplier's do.
 */

const LEVELS_OFF = Object.fromEntries(AREA_IDS.map((a) => [a, 0])) as Record<AreaId, 0>
const SPECIALS_OFF = Object.fromEntries(SPECIAL_IDS.map((s) => [s, false])) as Record<SpecialId, boolean>

export interface HeldAffiliate {
  readonly principal: Principal
  readonly affiliate: AffiliateSelf
  readonly row: {
    readonly name: string
    readonly email: string
    readonly code: string
    readonly tier: Tier
    readonly rate: number
    readonly status: "active" | "paused"
    readonly workspaceName: string
  }
}

interface PrincipalRow {
  readonly affiliateId: string
  readonly workspaceId: WorkspaceId
  readonly workspaceName: string
  readonly name: string
  readonly email: string
  readonly code: string
  readonly tier: Tier
  readonly rate: string
  readonly status: "active" | "paused"
}

/** The affiliates the signed-in person is, newest first, each as its principal (`affiliate`, its row as partner). */
export const held = Effect.fn("Affiliates.held")(function*() {
  const user = yield* CurrentUser
  const db = yield* Db
  const rows = yield* db.forUser((sql) =>
    sql<PrincipalRow>`
      select affiliate_id, workspace_id, workspace_name, name, email, code, tier, rate, status
      from affiliate_principals()`
  )
  return rows.map((r): HeldAffiliate => ({
    principal: {
      kind: "affiliate",
      id: r.affiliateId,
      userId: user.id,
      workspaceId: r.workspaceId,
      partnerId: r.affiliateId,
      role: {
        id: "affiliate",
        label: "Affiliate",
        version: 0,
        levels: LEVELS_OFF,
        specials: SPECIALS_OFF,
        refundLimit: null,
        stores: []
      },
      storeScope: []
    },
    affiliate: { affiliateId: r.affiliateId, name: r.name, workspaceName: r.workspaceName },
    row: { ...r, rate: Number(r.rate) }
  }))
})

interface ApplicationRow {
  readonly applicationId: string
  readonly workspaceId: string
  readonly workspaceName: string
  readonly status: "pending" | "rejected" | "approved"
  readonly reason: string | null
  readonly appliedAt: Date
  readonly name: string
}

export const applications = Effect.flatMap(Effect.service(Db), (db) =>
  db.forUser((sql) =>
    sql<ApplicationRow>`
      select application_id, workspace_id, workspace_name, status, reason, applied_at, name
      from affiliate_applications_mine() order by applied_at desc`
  ))

/**
 * Where the person stands: an affiliate (approved), else their newest application (pending, or rejected with the
 * reason), else `NotAffiliate`.
 */
export const me = Effect.fn("AffiliateApply.me")(function*() {
  const [a] = yield* held()
  if (a !== undefined) {
    return new AffiliateMe({
      state: "approved",
      workspace: { id: a.principal.workspaceId, name: a.row.workspaceName },
      affiliate: {
        id: a.affiliate.affiliateId,
        name: a.row.name,
        email: a.row.email,
        code: a.row.code,
        tier: a.row.tier,
        rate: a.row.rate,
        status: a.row.status
      },
      application: null
    })
  }
  const [app] = (yield* applications).filter((r) => r.status !== "approved")
  if (app === undefined) return yield* new NotAffiliate()
  return new AffiliateMe({
    state: app.status === "pending" ? "pending" : "rejected",
    workspace: { id: app.workspaceId, name: app.workspaceName },
    affiliate: null,
    application: { id: app.applicationId, name: app.name, appliedAt: app.appliedAt.getTime(), reason: app.reason }
  })
})

export const landing = Effect.fn("AffiliateApply.landing")(function*(program: string) {
  const db = yield* Db
  const [row] = yield* db.forUser((sql) =>
    sql<{ workspaceName: string; enabled: boolean }>`
      select workspace_name, enabled from affiliate_program_landing(${program})`
  )
  if (row === undefined) return yield* new NotFound({ entity: "affiliate_program", id: program })
  return new ProgramLanding({ brand: row.workspaceName, open: row.enabled })
})

const submit = (input: {
  readonly program: string | null
  readonly from: string | null
  readonly name: string | null
  readonly businessName?: string | undefined
  readonly country?: string | undefined
  readonly channel?: string | undefined
  readonly audience?: string | undefined
  readonly motivation?: string | undefined
  readonly url?: string | undefined
  readonly payout?: string | undefined
}) =>
  Effect.gen(function*() {
    const db = yield* Db
    const id = mintId("afa")
    const outboxId = mintId("obx")
    const [row] = yield* db.forUser((sql) =>
      sql<{ applicationId: string | null; refusal: string | null }>`
        select application_id, refusal from affiliate_apply(
          ${input.program}, ${id}, ${outboxId}, ${input.from}, ${input.name?.trim() ?? null},
          ${input.businessName?.trim() ?? null}, ${input.country?.trim() ?? null}, ${input.channel?.trim() ?? null},
          ${input.audience?.trim() ?? null}, ${input.motivation?.trim() ?? null}, ${input.url?.trim() ?? null},
          ${input.payout ?? null})`
    )
    if (row === undefined || row.applicationId === null) {
      return yield* new Conflict({ entity: "affiliate_application", reason: row?.refusal ?? "closed" })
    }
    ;(yield* PendingEvents)?.add(outboxId)
    return new Applied({ applicationId: row.applicationId })
  })

/** "Aanmelden" on the programme's page: waits for the brand (the team hears of it once it commits). */
export const apply = Effect.fn("AffiliateApply.apply")(function*(input: ApplyInput) {
  yield* CurrentUser
  return yield* submit({ ...input, from: null })
})

/** "Opnieuw aanmelden" after a rejection: a new application, the old one's answers kept where none is given. */
export const reapply = Effect.fn("AffiliateApply.reapply")(function*(input: ReapplyInput) {
  yield* CurrentUser
  return yield* submit({ ...input, program: null, from: input.applicationId, name: null })
})
