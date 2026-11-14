import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import { Relay } from "../shared/domain/Outbox.ts"
import { InvitationLinks } from "./domain/Ports.ts"
import type {
  InviteRow,
  SeatLimitReached,
  SetLink,
  SupplierAccess,
  SupplierAccessChanged,
  SupplierInvitationsSent,
  SupplierInviteRow,
  Team,
  Teammate
} from "./domain/Team.ts"
import { directory } from "./use-cases/directory.ts"
import * as Invitations from "./use-cases/invitations.ts"
import * as SupplierInvites from "./use-cases/invite-supplier.ts"
import { send } from "./use-cases/invite.ts"
import * as Link from "./use-cases/link.ts"
import * as People from "./use-cases/members.ts"
import { get } from "./use-cases/team.ts"

/**
 * The members slice (M3.3–M3.4): the team page and everything done on it, as the request's principal in its
 * workspace. Every method answers the page as it now stands. The links invitations travel by and the relay's kick are
 * ports, taken when the layer is built.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class Members extends Context.Service<Members, {
  readonly get: Effect.Effect<Team, Forbidden, Db | CurrentPrincipal>
  /** Every active member's name, face and role: what the top bar and mentions show, for any member. */
  readonly directory: Effect.Effect<ReadonlyArray<Teammate>, never, Db | CurrentPrincipal>
  readonly send: (
    rows: ReadonlyArray<InviteRow>
  ) => Effect.Effect<Team, Forbidden | Invalid | SeatLimitReached, Db | CurrentPrincipal>
  readonly sendSupplier: (
    rows: ReadonlyArray<SupplierInviteRow>
  ) => Effect.Effect<typeof SupplierInvitationsSent.Type, Forbidden | Invalid, Db | CurrentPrincipal>
  /** One supplier's portal access, and taking it back (M16): suppliers at Bekijken to read, Beheren to change. */
  readonly supplierAccess: (supplierId: string) => Effect.Effect<SupplierAccess, Forbidden, Db | CurrentPrincipal>
  readonly revokeSupplier: (
    ids: ReadonlyArray<string>
  ) => Effect.Effect<typeof SupplierAccessChanged.Type, Forbidden, Db | CurrentPrincipal>
  readonly restoreSupplier: (
    id: string
  ) => Effect.Effect<typeof SupplierAccessChanged.Type, Forbidden | NotFound | Conflict, Db | CurrentPrincipal>
  readonly revokeContact: (
    id: string
  ) => Effect.Effect<typeof SupplierAccessChanged.Type, Forbidden | NotFound, Db | CurrentPrincipal>
  readonly restoreContact: (
    id: string
  ) => Effect.Effect<typeof SupplierAccessChanged.Type, Forbidden | NotFound | Conflict, Db | CurrentPrincipal>
  readonly revoke: (ids: ReadonlyArray<string>) => Effect.Effect<Team, Forbidden, Db | CurrentPrincipal>
  readonly restore: (
    id: string
  ) => Effect.Effect<Team, Forbidden | NotFound | Conflict | SeatLimitReached, Db | CurrentPrincipal>
  readonly resend: (id: string) => Effect.Effect<Team, Forbidden | NotFound, Db | CurrentPrincipal>
  readonly undoResend: (id: string) => Effect.Effect<Team, Forbidden | Conflict, Db | CurrentPrincipal>
  readonly setInvitationRole: (
    id: string,
    roleId: string
  ) => Effect.Effect<Team, Forbidden | Invalid | NotFound, Db | CurrentPrincipal>
  readonly setMemberRole: (
    id: string,
    roleId: string
  ) => Effect.Effect<Team, Forbidden | Invalid | NotFound | Conflict, Db | CurrentPrincipal>
  readonly setDeactivated: (
    id: string,
    deactivated: boolean
  ) => Effect.Effect<Team, Forbidden | NotFound | Conflict | SeatLimitReached, Db | CurrentPrincipal>
  readonly remove: (id: string) => Effect.Effect<Team, Forbidden | NotFound | Conflict, Db | CurrentPrincipal>
  readonly restoreMember: (
    id: string
  ) => Effect.Effect<Team, Forbidden | NotFound | Conflict | SeatLimitReached, Db | CurrentPrincipal>
  readonly setLink: (patch: SetLink) => Effect.Effect<Team, Forbidden | Invalid, Db | CurrentPrincipal>
  readonly regenerateLink: Effect.Effect<Team, Forbidden | Invalid, Db | CurrentPrincipal>
  readonly undoRegenerateLink: Effect.Effect<Team, Forbidden | Conflict, Db | CurrentPrincipal>
}>()("modules/Members") {
  // A database that does not answer is a defect: the RPC answers it as one, and the request is in the traces.
  static readonly layer = Layer.effect(
    Members,
    Effect.map(Effect.all([Effect.service(InvitationLinks), Effect.service(Relay)]), ([links, relay]) => {
      const run = <A, E, R>(effect: Effect.Effect<A, E | SqlError.SqlError, R>) =>
        effect.pipe(
          Effect.provideService(InvitationLinks, links),
          Effect.provideService(Relay, relay),
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
      return {
        get: run(get()),
        directory: run(directory()),
        send: (rows) => run(send(rows)),
        sendSupplier: (rows) => run(SupplierInvites.sendSupplier(rows)),
        supplierAccess: (supplierId) => run(SupplierInvites.supplierAccess(supplierId)),
        revokeSupplier: (ids) => run(SupplierInvites.revokeSupplier(ids)),
        restoreSupplier: (id) => run(SupplierInvites.restoreSupplier(id)),
        revokeContact: (id) => run(SupplierInvites.revokeContact(id)),
        restoreContact: (id) => run(SupplierInvites.restoreContact(id)),
        revoke: (ids) => run(Invitations.revoke(ids)),
        restore: (id) => run(Invitations.restore(id)),
        resend: (id) => run(Invitations.resend(id)),
        undoResend: (id) => run(Invitations.undoResend(id)),
        setInvitationRole: (id, roleId) => run(Invitations.setRole(id, roleId)),
        setMemberRole: (id, roleId) => run(People.setRole(id, roleId)),
        setDeactivated: (id, deactivated) => run(People.setDeactivated(id, deactivated)),
        remove: (id) => run(People.remove(id)),
        restoreMember: (id) => run(People.restore(id)),
        setLink: (patch) => run(Link.set(patch)),
        regenerateLink: run(Link.regenerate()),
        undoRegenerateLink: run(Link.undoRegenerate())
      }
    })
  )
}
