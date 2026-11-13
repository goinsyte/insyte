import { CurrentApiKey } from "@insyte/api/http/Security"
import { scopesOf } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"

/*
 * The key making the call (M19.2, M19.3), for `/v1/me` and MCP's `whoami`: read from what the key door provides, so
 * it needs no module service.
 */

const make = Effect.succeed({
  me: Effect.gen(function*() {
    const key = yield* CurrentApiKey
    const { role } = yield* CurrentPrincipal
    return {
      key: { id: key.id, label: key.label, scopes: scopesOf(role.levels as Record<string, 0 | 1 | 2>) },
      workspace: { id: key.workspaceId, name: key.workspaceName }
    }
  })
})

/**
 * The key, as the key door let it in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey
 */
export class KeyV1 extends Context.Service<KeyV1, Effect.Success<typeof make>>()("api-worker/KeyV1") {
  static readonly layer = Layer.effect(this, make)
}
