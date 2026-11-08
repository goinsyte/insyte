import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Forbidden } from "@insyte/domain/Errors"
import { type AreaId, canRole, type Level, type RoleDef, type SpecialId } from "@insyte/domain/Permissions"
import type { Roles } from "@insyte/modules/roles/domain/Roles"
import { grantersOf, grantingRoles } from "@insyte/ui/app/access/denial"
import { permissionName } from "@insyte/ui/app/lib/permissions"
import type { RolesSource } from "@insyte/ui/app/roles/source"
import { Cause, Exit, Option, Schema } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { toast } from "sonner"
import { ACCESS, accessWrites, myAccessAtom } from "../data/access.ts"
import { ACCESS_LIST, accessListAtom, ROLES, rolesWrites } from "../data/roles.ts"

/*
 * Rollen's source in the console: `Roles.list` and `Access.list` as the screens read them, and every change as its RPC,
 * refreshing through `ROLES` (and `ACCESS_LIST` for a grant or decline). A refusal is said once, in Dutch, and the change
 * answers `false`, so the screen offers no undo. A declined request cannot be reopened, so its undo is not offered.
 */

const isForbidden = Schema.is(Forbidden)

const roleOf = (r: Roles["roles"][number]): RoleDef => ({
  id: r.id,
  label: r.label,
  system: r.system,
  custom: !r.system,
  ...(r.basedOn === null ? {} : { basedOn: r.basedOn }),
  levels: r.levels as Record<AreaId, Level>,
  specials: r.specials as Record<SpecialId, boolean>,
  refundLimit: r.refundLimit,
  stores: r.stores === "all" ? "all" : [...r.stores]
})

const LABEL_REASONS: Record<string, string> = {
  taken: "Er is al een rol met deze naam.",
  required: "Geef de rol een naam.",
  too_long: "Kies een kortere naam."
}

/** The server's refusal, said once. */
const refused = (error: unknown) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  switch (tagged._tag) {
    case "Forbidden":
      return void toast.error("Dat kan je rol niet", {
        description: `Je rol ${tagged["roleLabel"]} mist ${permissionName("team", tagged["level"] as Level)}.`
      })
    case "Invalid": {
      const fields = tagged["fields"] as Record<string, string>
      return void toast.error(LABEL_REASONS[fields["label"] ?? ""] ?? "Dat kan zo niet worden opgeslagen.")
    }
    case "Conflict":
      return void toast.error("Dat kan bij deze rol niet", {
        description: tagged["reason"] === "owner" ? "De eigenaar kan altijd alles." : "Een systeemrol houdt zijn naam."
      })
    case "NotFound":
      return void toast.error("Die bestaat niet meer", { description: "Iemand anders was je voor." })
    default:
      return void toast.error("Dat lukte niet", { description: "Probeer het zo nog eens." })
  }
}

const failureOf = <A, E>(exit: Exit.Failure<A, E>): unknown => {
  const failure = exit.cause.reasons.find((r) => r._tag === "Fail")
  return failure === undefined ? Cause.squash(exit.cause) : failure.error
}

/** One change, its refusal said; the answer when it took. */
const run = async <A>(write: Promise<Exit.Exit<A, unknown>>): Promise<A | undefined> => {
  const exit = await write
  if (Exit.isSuccess(exit)) return exit.value
  refused(failureOf(exit))
  return undefined
}

/** The change took: the server answered. */
const took = (result: unknown) => result !== undefined

export function useConsoleRolesSource(data: Roles): RolesSource {
  const accessList = useAtomValue(accessListAtom)
  const myAccess = useAtomValue(myAccessAtom)
  const write = {
    create: useAtomSet(rolesWrites.create, { mode: "promiseExit" }),
    update: useAtomSet(rolesWrites.update, { mode: "promiseExit" }),
    rename: useAtomSet(rolesWrites.rename, { mode: "promiseExit" }),
    reset: useAtomSet(rolesWrites.reset, { mode: "promiseExit" }),
    remove: useAtomSet(rolesWrites.remove, { mode: "promiseExit" }),
    restore: useAtomSet(rolesWrites.restore, { mode: "promiseExit" }),
    grant: useAtomSet(rolesWrites.grant, { mode: "promiseExit" }),
    decline: useAtomSet(rolesWrites.decline, { mode: "promiseExit" }),
    ask: useAtomSet(accessWrites.request, { mode: "promiseExit" }),
    withdraw: useAtomSet(accessWrites.withdraw, { mode: "promiseExit" })
  }
  const roles = useMemo(() => data.roles.map(roleOf), [data.roles])
  const mine = roles.find((r) => r.id === data.myRoleId)
  const people = data.roles.flatMap((r) => r.holders.members.map((m) => ({ ...m, role: r.label })))
  const keys = { reactivityKeys: ROLES }
  const both = { reactivityKeys: [...ROLES, ...ACCESS_LIST] }

  // Who may not manage the team is answered Forbidden for the requests: the list's place says so.
  const listFailure = AsyncResult.isFailure(accessList)
    ? accessList.cause.reasons.find((r) => r._tag === "Fail")
    : undefined
  const listDenied = listFailure !== undefined && listFailure._tag === "Fail" && isForbidden(listFailure.error)
  const asked = Option.getOrElse(AsyncResult.value(myAccess), () => []).find(
    (r) => r.area === "team" && (r.state === "open" || r.state === "declined")
  )

  return {
    roles,
    stores: [],
    holders: (role) => {
      const h = data.roles.find((r) => r.id === role.id)?.holders
      return { members: h?.members ?? [], invites: h?.invites ?? 0, link: h?.link ?? false, keys: 0 }
    },
    can: {
      manage: mine !== undefined && canRole(mine, "team", 3)
        ? { ok: true, reason: "" }
        : { ok: false, reason: `Je rol ${mine?.label ?? "in deze werkruimte"} mist ${permissionName("team", 3)}` }
    },
    requests: listDenied
      ? null
      : Option.getOrElse(AsyncResult.value(accessList), () => [])
        .filter((r) => r.state === "open")
        .map((r) => ({
          id: r.id,
          memberId: r.memberId,
          memberName: r.memberName,
          roleId: r.roleId,
          area: r.area,
          level: r.level,
          path: r.path ?? "",
          at: r.createdAt
        })),
    requestsDenial: listDenied
      ? {
        perm: "team",
        arg: 3,
        roleLabel: mine?.label ?? "",
        grantingRoles: grantingRoles(roles, "team", 3),
        granters: grantersOf(roles, people),
        request: asked === undefined
          ? { state: "none" }
          : asked.state === "open"
          ? { state: "open", at: asked.createdAt }
          : { state: "declined", at: asked.decidedAt ?? asked.createdAt },
        action: "Access.list"
      }
      : undefined,
    askAccess: listDenied
      ? async () => {
        const mine = await run(write.ask({
          payload: { area: "team", level: 3, path: "/settings/roles" },
          reactivityKeys: ACCESS
        }))
        const open = mine?.find((r) => r.area === "team" && r.state === "open")
        return open === undefined
          ? undefined
          : () => void write.withdraw({ payload: { id: open.id }, reactivityKeys: ACCESS })
      }
      : undefined,
    pageName: (path) => path,

    create: async (label, from) => (await run(write.create({ payload: { label, from }, ...keys })))?.id,
    update: async (id, p) =>
      took(
        await run(write.update({
          payload: {
            id,
            levels: p.levels,
            specials: p.specials,
            refundLimit: p.refundLimit,
            stores: p.stores === "all" ? "all" : [...p.stores]
          },
          ...keys
        }))
      ),
    rename: async (id, label) => took(await run(write.rename({ payload: { id, label }, ...keys }))),
    reset: async (id) => took(await run(write.reset({ payload: { id }, ...keys }))),
    remove: async (id, to) => {
      // A role nobody holds goes where the first other role would have taken them; nobody moves.
      const target = to ?? roles.find((r) => r.id !== id && r.id !== "owner")?.id ?? "view"
      return took(await run(write.remove({ payload: { id, to: target }, ...keys })))
    },
    restore: async (id) => took(await run(write.restore({ payload: { id }, ...keys }))),
    grant: async (req) => took(await run(write.grant({ payload: { id: req.id }, ...both }))),
    decline: async (req) => took(await run(write.decline({ payload: { id: req.id }, ...both })))
  }
}
