import { CurrentApiKey } from "@insyte/api/http/Security"
import { scopesOf } from "@insyte/domain/Permissions"
import { CurrentPrincipal } from "@insyte/domain/Principal"
import { ApiKeys } from "@insyte/modules/developer/ApiKeys"
import { Context, Effect, Layer } from "effect"
import { workspaceV1 } from "./present.ts"

/*
 * The key making the call (M19.2, M19.3), for `/v1/me` and MCP's `whoami`: read from what the key door provides. Its
 * workspace with the stores it reaches, for MCP's `insyte://workspace`, from the developer slice.
 */

const make = Effect.map(Effect.service(ApiKeys), (keys) => ({
  workspace: Effect.map(keys.workspace, workspaceV1),
  me: Effect.gen(function*() {
    const key = yield* CurrentApiKey
    const { role } = yield* CurrentPrincipal
    return {
      key: { id: key.id, label: key.label, scopes: scopesOf(role.levels as Record<string, 0 | 1 | 2>) },
      workspace: { id: key.workspaceId, name: key.workspaceName }
    }
  })
}))

/**
 * The key, as the key door let it in.
 *
 * @effect-expect-leaking CurrentPrincipal CurrentApiKey Db
 */
export class KeyV1 extends Context.Service<KeyV1, Effect.Success<typeof make>>()("api-worker/KeyV1") {
  static readonly layer = Layer.effect(this, make).pipe(Layer.provide(ApiKeys.layer))
}
