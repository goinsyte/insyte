import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { type AreaId, canRole, type Level, type RoleDef, type SpecialId } from "@insyte/domain/Permissions"
import type { ApiKeyView } from "@insyte/modules/developer/domain/ApiKey"
import type { Roles } from "@insyte/modules/roles/domain/Roles"
import type { DeveloperSource } from "@insyte/ui/app/developer/source"
import type { ApiKey, ApiRequest } from "@insyte/ui/app/lib/developer-core"
import { permissionName } from "@insyte/ui/app/lib/permissions"
import { Cause, Exit, Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { toast } from "sonner"
import { keyActivityAtom, KEYS, keyWrites } from "../data/developer.ts"

/*
 * API-sleutels' source in the console: `ApiKeys.list` and each key's `ApiKeys.activity` as the screens read them, and
 * every change as its RPC, refreshing through `KEYS`. A refusal is said once, in Dutch.
 */

const iso = (ms: number) => new Date(ms).toISOString()

const asKey = (k: ApiKeyView): ApiKey => ({
  id: k.id,
  label: k.label,
  prefix: k.prefix,
  created_at: iso(k.createdAt),
  created_by: k.createdBy,
  ...(k.lastUsedAt === null ? {} : { last_used_at: iso(k.lastUsedAt) }),
  status: k.status,
  access: k.access.kind === "role"
    ? { kind: "role", roleId: k.access.roleId }
    : { kind: "custom", scopes: { ...k.access.scopes } as Partial<Record<AreaId, 0 | 1 | 2>> },
  stores: k.stores === "all" ? "all" : [...k.stores],
  expires_at: k.expiresAt === null ? null : iso(k.expiresAt),
  ips: [...k.ips],
  ...(k.rotated === null ? {} : { rotated: { previousPrefix: k.rotated.previousPrefix, until: iso(k.rotated.until) } }),
  ...(k.revokedAt === null ? {} : { revoked_at: iso(k.revokedAt) }),
  agent: k.agent
})

const roleOf = (r: Roles["roles"][number]): RoleDef => ({
  id: r.id,
  label: r.label,
  system: r.system,
  custom: !r.system,
  levels: r.levels as Record<AreaId, Level>,
  specials: r.specials as Record<SpecialId, boolean>,
  refundLimit: r.refundLimit,
  stores: r.stores === "all" ? "all" : [...r.stores]
})

const FIELDS: Record<string, string> = {
  required: "Geef de sleutel een naam.",
  too_long: "Kies een kortere naam.",
  format: "Een van de adressen is geen IP-adres of bereik.",
  owner: "Een sleutel kan niet de rol Eigenaar krijgen.",
  unknown_role: "Die rol bestaat niet meer."
}

const refused = (error: unknown) => {
  const tagged = error as { _tag?: string; [field: string]: unknown }
  switch (tagged._tag) {
    case "Forbidden":
      return void toast.error("Dat kan je rol niet", {
        description: `Je rol ${tagged["roleLabel"]} mist ${permissionName("integrations", tagged["level"] as Level)}.`
      })
    case "Invalid": {
      const reason = Object.values(tagged["fields"] as Record<string, string>)[0] ?? ""
      return void toast.error(FIELDS[reason] ?? "Dat kan zo niet worden opgeslagen.")
    }
    case "Conflict":
      return void toast.error("Deze sleutel is ingetrokken", { description: "Zet hem eerst terug." })
    case "NotFound":
      return void toast.error("Die sleutel bestaat niet meer")
    default:
      return void toast.error("Dat lukte niet", { description: "Probeer het zo nog eens." })
  }
}

const run = async <A>(write: Promise<Exit.Exit<A, unknown>>): Promise<A | undefined> => {
  const exit = await write
  if (Exit.isSuccess(exit)) return exit.value
  const failure = exit.cause.reasons.find((r) => r._tag === "Fail")
  refused(failure === undefined ? Cause.squash(exit.cause) : failure.error)
  return undefined
}

/** The change took: the server answered. */
const took = (result: unknown) => result !== undefined

/** A key's activity as the detail draws it, from `ApiKeys.activity` once it is in. */
function useKeyActivity(
  key: ApiKey
): { requests: ReadonlyArray<ApiRequest>; usage: ReadonlyArray<{ day: string; count: number; errors: number }> } {
  const result = useAtomValue(keyActivityAtom(key.id))
  const activity = Option.getOrUndefined(AsyncResult.value(result))
  return useMemo(() => ({
    requests: (activity?.requests ?? []).map((r) => ({
      id: r.id,
      method: r.method as ApiRequest["method"],
      path: r.path,
      status: r.status,
      ms: r.ms,
      at: iso(r.at),
      ip: r.ip ?? ""
    })),
    usage: (activity?.usage ?? []).map((u) => ({ day: iso(u.day), count: u.count, errors: u.errors }))
  }), [activity])
}

export function useConsoleDeveloperSource(
  keys: ReadonlyArray<ApiKeyView>,
  roles: Roles,
  endpoints: { readonly mcp: string | null },
  webhooks?: { readonly count: number; readonly failing: number }
): DeveloperSource {
  const write = {
    create: useAtomSet(keyWrites.create, { mode: "promiseExit" }),
    update: useAtomSet(keyWrites.update, { mode: "promiseExit" }),
    rotate: useAtomSet(keyWrites.rotate, { mode: "promiseExit" }),
    endGrace: useAtomSet(keyWrites.endGrace, { mode: "promiseExit" }),
    revoke: useAtomSet(keyWrites.revoke, { mode: "promiseExit" }),
    restore: useAtomSet(keyWrites.restore, { mode: "promiseExit" })
  }
  const roleDefs = useMemo(() => roles.roles.map(roleOf), [roles.roles])
  const mine = roleDefs.find((r) => r.id === roles.myRoleId)
  const people = roles.roles.flatMap((r) => r.holders.members)
  const k = { reactivityKeys: KEYS }

  return {
    keys: keys.map(asKey),
    roles: roleDefs,
    stores: [],
    can: {
      manage: mine !== undefined && canRole(mine, "integrations", 3)
        ? { ok: true, reason: "" }
        : {
          ok: false,
          reason: `Je rol ${mine?.label ?? "in deze werkruimte"} mist ${permissionName("integrations", 3)}`
        }
    },
    me: roles.me,
    mcpUrl: endpoints.mcp ?? "",
    ...(webhooks === undefined ? {} : { webhooks: { count: webhooks.count, failing: webhooks.failing } }),
    personName: (id) => people.find((p) => p.id === id)?.name ?? "Iemand uit het team",
    useActivity: useKeyActivity,
    create: async (input) => {
      const days = input.expires_at === null
        ? null
        : Math.round((Date.parse(input.expires_at) - Date.now()) / 86_400_000)
      const made = await run(write.create({
        payload: {
          label: input.label,
          access: input.access.kind === "role"
            ? { kind: "role", roleId: input.access.roleId }
            : { kind: "custom", scopes: { ...input.access.scopes } as Record<string, 0 | 1 | 2> },
          stores: input.stores === "all" ? "all" : [...input.stores],
          expiresInDays: days,
          ips: [...input.ips],
          agent: input.agent === true
        },
        ...k
      }))
      return made === undefined ? undefined : { key: asKey(made.key), secret: made.secret }
    },
    update: async (id, patch) =>
      took(
        await run(write.update({
          payload: {
            id,
            ...(patch.label === undefined ? {} : { label: patch.label }),
            ...(patch.ips === undefined ? {} : { ips: [...patch.ips] })
          },
          ...k
        }))
      ),
    rotate: async (id, graceMs) => (await run(write.rotate({ payload: { id, graceMs }, ...k })))?.secret,
    endGrace: async (id) => took(await run(write.endGrace({ payload: { id }, ...k }))),
    revoke: async (id) => took(await run(write.revoke({ payload: { id }, ...k }))),
    restore: async (id) => took(await run(write.restore({ payload: { id }, ...k })))
  }
}
