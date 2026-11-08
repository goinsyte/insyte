import { useAtomSet } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import type { AreaId, Level, RoleDef as Role, SpecialId } from "@insyte/domain/Permissions"
import { canRole } from "@insyte/domain/Permissions"
import type { Team } from "@insyte/modules/members/domain/Team"
import { grantersOf, grantingRoles } from "@insyte/ui/app/access/denial"
import { type Permission, permissionName } from "@insyte/ui/app/lib/permissions"
import type { Invite } from "@insyte/ui/app/lib/team-core"
import type { RefusalScope, TeamGate, TeamRefusal, TeamSource } from "@insyte/ui/app/team/source"
import { Cause, Exit, Schema } from "effect"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { TEAM, teamWrites } from "../data/team.ts"

/*
 * The team screens' source in the console: `Team.get` as they read it, and each action as its RPC, refreshing the page
 * through `TEAM`. A missing permission (`Forbidden`) is said where it was asked, as the denied states say it; any other
 * refusal is said here once, in Dutch. Either way the action answers `false`, so the screen offers no undo. What
 * the console has no screen or server for yet is left out (the view as the invitee, handing over ownership, stores
 * until M6), and buying seats waits for billing (M13).
 */

const roleOf = (role: Team["roles"][number]): Role => ({
  id: role.id,
  label: role.label,
  system: role.system,
  custom: !role.system,
  levels: role.levels as Record<AreaId, Level>,
  specials: role.specials as Record<SpecialId, boolean>,
  refundLimit: role.refundLimit,
  stores: role.stores === "all" ? "all" : [...role.stores]
})

const gate = (role: Role | undefined, level: Level): TeamGate =>
  role !== undefined && canRole(role, "team", level)
    ? { ok: true, reason: "" }
    : { ok: false, reason: `Je rol ${role?.label ?? "in deze werkruimte"} mist ${permissionName("team", level)}` }

const ADDRESS_REASONS: Record<string, string> = {
  format: "is geen geldig e-mailadres",
  duplicate: "staat er dubbel tussen",
  member: "zit al in het team",
  invited: "heeft al een uitnodiging",
  unknown: "krijgt een rol die niet bestaat"
}

const isForbidden = Schema.is(Forbidden)

/** The server's refusal, said once (a missing permission is said in place instead, `TeamRefusal`). */
const refused = (error: unknown) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  switch (tagged._tag) {
    case "SeatLimitReached":
      return void toast.error("Niet genoeg plekken vrij", {
        description: `Je abonnement heeft ${tagged["total"]} plekken; er ${tagged["free"] === 1 ? "is" : "zijn"} nog ${
          tagged["free"]
        } vrij.`
      })
    case "Forbidden":
      return void toast.error("Dat kan je rol niet", {
        description: `Je rol ${tagged["roleLabel"]} mist ${permissionName("team", tagged["level"] as Level)}.`
      })
    case "Invalid": {
      const fields = tagged["fields"] as Record<string, string>
      const reasons = [...new Set(Object.values(fields).map((r) => ADDRESS_REASONS[r] ?? r))]
      return void toast.error("Niet alles kan verstuurd worden", { description: `Een adres ${reasons.join(", ")}.` })
    }
    case "Conflict":
      return void toast.error("Dat lukte niet meer", {
        description: tagged["reason"] === "already_sent"
          ? "De mail is al verstuurd."
          : tagged["reason"] === "newer_invitation"
          ? "Er ging intussen een nieuwere uitnodiging naar dit adres."
          : "De werkruimte is intussen veranderd. Kijk het nog eens na."
      })
    case "NotFound":
      return void toast.error("Die bestaat niet meer", { description: "Iemand anders was je voor." })
    default:
      return void toast.error("Dat lukte niet", { description: "Probeer het zo nog eens." })
  }
}

/** The typed failure of a write's exit, or the defect squashed: what the server said. */
const failureOf = <A, E>(exit: Exit.Failure<A, E>): unknown => {
  const failure = exit.cause.reasons.find((r) => r._tag === "Fail")
  return failure === undefined ? Cause.squash(exit.cause) : failure.error
}

const asInvite = (i: Team["invitations"][number]): Invite => ({
  id: i.id,
  email: i.email,
  roleId: i.roleId,
  stores: i.stores === "all" ? "all" : [...i.stores],
  ...(i.message === null ? {} : { message: i.message }),
  invitedBy: i.invitedBy,
  sentAt: i.sentAt,
  expiresAt: i.expiresAt,
  resent: i.resent
})

/** The write took: the server answered the page. */
const took = (result: unknown) => result !== undefined

export function useConsoleTeamSource(team: Team): TeamSource {
  const write = {
    send: useAtomSet(teamWrites.send, { mode: "promiseExit" }),
    revoke: useAtomSet(teamWrites.revoke, { mode: "promiseExit" }),
    restore: useAtomSet(teamWrites.restore, { mode: "promiseExit" }),
    resend: useAtomSet(teamWrites.resend, { mode: "promiseExit" }),
    undoResend: useAtomSet(teamWrites.undoResend, { mode: "promiseExit" }),
    setInvitationRole: useAtomSet(teamWrites.setInvitationRole, { mode: "promiseExit" }),
    setMemberRole: useAtomSet(teamWrites.setMemberRole, { mode: "promiseExit" }),
    deactivate: useAtomSet(teamWrites.deactivate, { mode: "promiseExit" }),
    reactivate: useAtomSet(teamWrites.reactivate, { mode: "promiseExit" }),
    remove: useAtomSet(teamWrites.remove, { mode: "promiseExit" }),
    restoreMember: useAtomSet(teamWrites.restoreMember, { mode: "promiseExit" }),
    setLink: useAtomSet(teamWrites.setLink, { mode: "promiseExit" }),
    regenerateLink: useAtomSet(teamWrites.regenerateLink, { mode: "promiseExit" }),
    undoRegenerateLink: useAtomSet(teamWrites.undoRegenerateLink, { mode: "promiseExit" })
  }
  const roles = useMemo(() => team.roles.map(roleOf), [team.roles])
  const mine = roles.find((r) => r.id === team.members.find((m) => m.id === team.me)?.roleId)
  const keys = { reactivityKeys: TEAM }
  const [refusal, setRefusal] = useState<TeamRefusal | null>(null)
  const people = team.members.map((m) => ({ id: m.id, name: m.name, role: m.roleLabel }))

  const denialFor = (perm: Permission, arg?: Level | number) => ({
    perm,
    ...(arg === undefined ? {} : { arg }),
    roleLabel: mine?.label ?? "",
    grantingRoles: grantingRoles(roles, perm, arg),
    granters: grantersOf(roles, people),
    // Asking arrives with access requests (M3.5); until then the denied states only explain.
    request: { state: "none" } as const
  })

  /**
   * Runs one write and refreshes the page after. A missing permission (`Forbidden`) is said where the write was asked,
   * with the server's words for what is missing; anything else is said once as a toast. `undefined` when it did not
   * take.
   */
  const run = async <A>(
    scope: RefusalScope,
    action: string,
    attempt: () => Promise<Exit.Exit<A, unknown>>
  ): Promise<A | undefined> => {
    const exit = await attempt()
    if (Exit.isSuccess(exit)) {
      setRefusal(null)
      return exit.value
    }
    const error = failureOf(exit)
    if (isForbidden(error)) {
      setRefusal({
        scope,
        denial: { ...denialFor(error.permission as Permission, error.level as Level), action, at: Date.now() },
        retry: () => void run(scope, action, attempt)
      })
    } else {
      refused(error)
    }
    return undefined
  }

  return {
    me: team.me,
    people: team.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.roleLabel,
      stores: m.stores === "all" ? "all" : [...m.stores],
      ...(m.invitedBy === null ? {} : { invitedBy: m.invitedBy }),
      joinedAt: m.joinedAt,
      ...(m.lastActiveAt === null ? {} : { lastSeen: m.lastActiveAt }),
      deactivated: m.deactivated
    })),
    invites: team.invitations.map(asInvite),
    seats: { ...team.seats, extra: 0 },
    link: {
      enabled: team.link.enabled,
      token: team.link.token ?? "",
      roleId: team.link.roleId,
      days: team.link.days,
      createdAt: team.link.createdAt,
      joined: team.link.joined,
      url: team.link.url ?? ""
    },
    roles,
    stores: [],
    can: { invite: gate(mine, 2), manage: gate(mine, 3) },
    denialFor,
    refusal,
    dismissRefusal: () => setRefusal(null),
    inviteUrl: (id) => team.invitations.find((i) => i.id === id)?.url ?? undefined,
    buySeats: () =>
      void toast("Extra plekken komen met Facturatie", {
        description: "Tot dan werk je met de plekken van je proefperiode."
      }),

    send: async (rows) => {
      const sent = await run(
        "invite",
        "Invitations.send",
        () => write.send({ payload: { rows: rows.map((r) => ({ ...r })) }, ...keys })
      )
      if (sent === undefined) return undefined
      const addresses = new Set(rows.map((r) => r.email.trim().toLowerCase()))
      return sent.invitations.filter((i) => addresses.has(i.email)).map(asInvite)
    },
    unsend: async (ids) =>
      took(await run("invite", "Invitations.revoke", () => write.revoke({ payload: { ids: [...ids] }, ...keys }))),
    revoke: async (id) =>
      took(await run("invitations", "Invitations.revoke", () => write.revoke({ payload: { ids: [id] }, ...keys }))),
    restoreInvite: async (id) =>
      took(await run("invitations", "Invitations.restore", () => write.restore({ payload: { id }, ...keys }))),
    resend: async (id) =>
      took(await run("invitations", "Invitations.resend", () => write.resend({ payload: { id }, ...keys }))),
    undoResend: async (id) =>
      took(await run("invitations", "Invitations.undoResend", () => write.undoResend({ payload: { id }, ...keys }))),
    setInviteRole: async (id, roleId) =>
      took(
        await run("invitations", "Invitations.setRole", () =>
          write.setInvitationRole({ payload: { id, roleId }, ...keys }))
      ),
    setMemberRole: async (id, roleId) =>
      took(await run("members", "Members.setRole", () => write.setMemberRole({ payload: { id, roleId }, ...keys }))),
    // Stores arrive with Shopify (M6); until then everyone works in every store.
    setMemberStores: () => Promise.resolve(false),
    setDeactivated: async (id, deactivated) =>
      took(
        await run(
          "members",
          deactivated ? "Members.deactivate" : "Members.reactivate",
          () => (deactivated ? write.deactivate : write.reactivate)({ payload: { id }, ...keys })
        )
      ),
    remove: async (id) =>
      took(await run("members", "Members.remove", () => write.remove({ payload: { id }, ...keys }))),
    restoreMember: async (id) =>
      took(await run("members", "Members.restore", () => write.restoreMember({ payload: { id }, ...keys }))),
    setLink: async (patch) =>
      took(await run("link", "InviteLink.set", () => write.setLink({ payload: patch, ...keys }))),
    regenerateLink: async () =>
      took(await run("link", "InviteLink.regenerate", () => write.regenerateLink({ payload: undefined, ...keys }))),
    undoRegenerateLink: async () =>
      took(
        await run("link", "InviteLink.undoRegenerate", () => write.undoRegenerateLink({ payload: undefined, ...keys }))
      )
  }
}
