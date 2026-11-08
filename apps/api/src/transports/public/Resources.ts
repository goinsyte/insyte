import { CurrentApiKey, type ScopeMissingV1 } from "@insyte/api/http/PublicApi"
import type { Forbidden } from "@insyte/domain/Errors"
import { scopesOf } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Members } from "@insyte/modules/members/Members"
import { RolesService } from "@insyte/modules/roles/RolesService"
import { Context, Effect, Layer } from "effect"

/*
 * What a key reads (M19.2, M19.3), in the public shape: `/v1` answers with these and the MCP tools return them, over
 * the same use cases the console calls, so a key and a person see the same team.
 */

const ACCESS = ["none", "read", "write", "manage"] as const

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString())

/** The use case's refusal as the scope the key misses, in the V1 envelope. */
const scopeMissing = (e: Forbidden) =>
  Effect.flatMap(CurrentApiKey, (key) => {
    const scope = `${e.permission}.${e.level >= 2 ? "write" : "read"}`
    return Effect.fail<ScopeMissingV1>({
      error: { code: "ScopeMissingV1", message: `This key lacks ${scope}.`, request_id: key.requestId, scope }
    })
  })

const make = Effect.gen(function*() {
  const members = yield* Members
  const roles = yield* RolesService
  return {
    me: Effect.gen(function*() {
      const key = yield* CurrentApiKey
      const { role } = yield* CurrentPrincipal
      return {
        key: { id: key.id, label: key.label, scopes: scopesOf(role.levels as Record<string, 0 | 1 | 2>) },
        workspace: { id: key.workspaceId, name: key.workspaceName }
      }
    }),
    members: members.get.pipe(
      Effect.map((team) => ({
        data: team.members.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          role: { id: m.roleId, label: m.roleLabel },
          status: m.deactivated ? "deactivated" as const : "active" as const,
          joined_at: iso(m.joinedAt)!,
          last_active_at: iso(m.lastActiveAt)
        }))
      })),
      Effect.catchTag("Forbidden", scopeMissing)
    ),
    roles: roles.list.pipe(
      Effect.map((list) => ({
        data: list.roles.map((r) => ({
          id: r.id,
          label: r.label,
          system: r.system,
          access: Object.fromEntries(Object.entries(r.levels).map(([area, level]) => [area, ACCESS[level]!]))
        }))
      })),
      Effect.catchTag("Forbidden", scopeMissing)
    )
  }
})

/**
 * The three reads, as the key the door let in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class Resources extends Context.Service<Resources, Effect.Success<typeof make>>()("api-worker/Resources") {
  static readonly layer = Layer.effect(this, make).pipe(
    Layer.provide(Layer.mergeAll(Members.layer, RolesService.layer))
  )
}
