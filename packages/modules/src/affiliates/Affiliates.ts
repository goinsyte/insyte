import { Effect } from "effect"
import { SqlError } from "effect/sql"
import * as Applicant from "./use-cases/applicant.ts"
import * as Close from "./use-cases/close.ts"
import * as Conversions from "./use-cases/conversions.ts"
import * as Operator from "./use-cases/operator.ts"
import * as Payouts from "./use-cases/payouts.ts"
import * as Portal from "./use-cases/portal.ts"
import * as Relay from "./use-cases/relay.ts"
import { restore } from "./use-cases/restore.ts"
import * as Team from "./use-cases/team.ts"

/*
 * The affiliate programme (M16 steps 3–5; widgets/06 Parts B and C), as one module the transports load on first use
 * (`lazy.ts`): nothing of it is in a Worker's startup graph. A database that does not answer is a defect, as
 * everywhere.
 */

const die = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.catchIf(SqlError.isSqlError, Effect.die)) as Effect.Effect<A, Exclude<E, SqlError.SqlError>, R>

type Fn = (...args: Array<any>) => Effect.Effect<any, any, any>
const dying = <T extends Record<string, unknown>>(m: T) =>
  Object.fromEntries(
    Object.entries(m).map(([k, v]) => [k, typeof v === "function" ? (...a: Array<unknown>) => die((v as Fn)(...a)) : v])
  ) as {
    [K in keyof T]: T[K] extends (...a: infer P) => Effect.Effect<infer A, infer E, infer R>
      ? (...a: P) => Effect.Effect<A, Exclude<E, SqlError.SqlError>, R>
      : T[K]
  }

export const operator = dying({
  program: Operator.program,
  updateProgram: Operator.updateProgram,
  list: Operator.list,
  get: Operator.get,
  setTier: Operator.setTier,
  setPaused: Operator.setPaused,
  applications: Operator.applications,
  approve: Operator.approve,
  reject: Operator.reject,
  proposeCode: Operator.proposeCode,
  retryDiscount: Operator.retryDiscount,
  payouts: Payouts.list,
  approvePayouts: Payouts.approve,
  markPaid: Payouts.markPaid,
  invites: Team.invites,
  invite: Team.invite,
  resendInvite: Team.resend,
  revokeInvite: Team.revoke,
  inviteLink: Team.inviteLink,
  resources: Team.resources,
  uploadResource: Team.upload,
  removeResource: Team.removeResource
})

export const portal = dying({
  dashboard: Portal.dashboard,
  listLinks: Portal.listLinks,
  getLink: Portal.getLink,
  destinations: Portal.destinations,
  createLink: Portal.createLink,
  archiveLink: Portal.archiveLink,
  listConversions: Portal.listConversions,
  listPayouts: Portal.listPayouts,
  getPayout: Portal.getPayout,
  resources: Portal.resources,
  notifications: Portal.notifications,
  readNotifications: Portal.readNotifications,
  profile: Portal.profile,
  updateProfile: Portal.updateProfile,
  payment: Portal.payment,
  updatePayment: Portal.updatePayment
})

export const applicant = dying({
  held: Applicant.held,
  me: Applicant.me,
  landing: Applicant.landing,
  apply: Applicant.apply,
  reapply: Applicant.reapply
})

export { Close, Conversions, Relay, restore }
export { RedirectOrigin } from "./use-cases/portal.ts"
export { resourceFile } from "./use-cases/team.ts"
export const restorePortal = Portal.restore
