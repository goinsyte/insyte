import type { Need } from "@insyte/api/mcp/Shared"
import { canRole } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Effect } from "effect"
import { McpServer } from "effect/ai"

/*
 * The MCP server's resources (M19.3): records a client reads by address, `insyte://…`, in the public API's shapes and
 * through the same `<Slice>V1` as `/v1` and the tools, so they are fenced the same way (the key's scopes, its stores).
 * Each slice registers its own in its folder's `resources.ts`; `McpLive.ts` assembles them.
 */

/** A V1 answer as the resource's JSON at `uri`; a refusal as the error the client reads (`ScopeMissingV1: …`). */
export const json = <A, E, R>(uri: string, effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.map((value) => ({ contents: [{ uri, mimeType: "application/json", text: JSON.stringify(value) }] })),
    Effect.mapError((e) => {
      const error = (e as { readonly error?: { readonly code?: string; readonly message?: string } }).error
      return new Error(
        error?.code === undefined ? "The resource could not be read." : `${error.code}: ${error.message}`
      )
    })
  )

/**
 * A resource named in `resources/list` (or its template in `resources/templates/list`) only to a key that has what
 * reading it needs, as a tool is (`Reach.ts`). A read by address is answered as before, refused by the use case.
 */
export const listedTo = (...needs: ReadonlyArray<Need>) =>
  McpServer.visibility(({ method }) =>
    method === "resources/list" || method === "resources/templates/list"
      ? Effect.map(CurrentPrincipal, ({ role }) => {
        const permissions = { ...role, stores: role.stores === "all" ? "all" as const : [...role.stores] }
        return needs.every((need) =>
          "special" in need ? canRole(permissions, need.special) : canRole(permissions, need.area, need.level)
        )
      })
      : Effect.succeed(true)
  )
