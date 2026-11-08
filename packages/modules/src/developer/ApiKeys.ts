import type { Db } from "@insyte/database/Db"
import type { Conflict, Forbidden, Invalid, NotFound } from "@insyte/domain/Errors"
import type { WorkspaceId } from "@insyte/domain/Ids"
import type { CurrentPrincipal } from "@insyte/domain/Principal"
import { Context, Effect, Layer } from "effect"
import { SqlError } from "effect/sql"
import type { ApiKeyView, CreateKey, KeyActivity, KeyRefused, UpdateKey, WithSecret } from "./domain/ApiKey.ts"
import { KeyHasher } from "./domain/Ports.ts"
import * as Auth from "./use-cases/authenticate.ts"
import * as Keys from "./use-cases/keys.ts"

type R = Db | CurrentPrincipal
type List = ReadonlyArray<ApiKeyView>

/**
 * The developer slice's keys (M19.1): Instellingen → API-sleutels, as the request's principal. The hasher is a port,
 * taken when the layer is built. The public API authenticates through it and logs each call it serves.
 *
 * @effect-expect-leaking Db CurrentPrincipal
 */
export class ApiKeys extends Context.Service<ApiKeys, {
  readonly list: Effect.Effect<List, Forbidden, R>
  readonly activity: (id: string) => Effect.Effect<KeyActivity, Forbidden, R>
  readonly create: (input: CreateKey) => Effect.Effect<WithSecret, Forbidden | Invalid | NotFound, R>
  readonly update: (input: UpdateKey) => Effect.Effect<List, Forbidden | Invalid | NotFound, R>
  readonly rotate: (id: string, graceMs: number) => Effect.Effect<WithSecret, Forbidden | NotFound | Conflict, R>
  readonly endGrace: (id: string) => Effect.Effect<List, Forbidden | NotFound, R>
  readonly revoke: (id: string) => Effect.Effect<List, Forbidden | NotFound, R>
  readonly restore: (id: string) => Effect.Effect<List, Forbidden | NotFound, R>
  /** The public API's door (M19.2): a bearer token and the caller's address → the key's principal, before any. */
  readonly authenticate: (
    token: string,
    ip: string | null
  ) => Effect.Effect<Auth.Authenticated, KeyRefused, Db>
  readonly logRequest: (workspaceId: WorkspaceId, entry: Auth.RequestEntry) => Effect.Effect<void, never, Db>
}>()("modules/ApiKeys") {
  // A database that does not answer is a defect, as everywhere.
  static readonly layer = Layer.effect(
    ApiKeys,
    Effect.map(Effect.service(KeyHasher), (hasher) => {
      const run = <A, E, Req>(effect: Effect.Effect<A, E | SqlError.SqlError, Req>) =>
        effect.pipe(Effect.provideService(KeyHasher, hasher), Effect.catchIf(SqlError.isSqlError, Effect.die))
      return {
        list: run(Keys.list()),
        activity: (id) => run(Keys.activity(id)),
        create: (input) => run(Keys.create(input)),
        update: (input) => run(Keys.update(input)),
        rotate: (id, graceMs) => run(Keys.rotate(id, graceMs)),
        endGrace: (id) => run(Keys.endGrace(id)),
        revoke: (id) => run(Keys.revoke(id)),
        restore: (id) => run(Keys.restore(id)),
        authenticate: (token, ip) => run(Auth.authenticate(token, ip)),
        logRequest: (workspaceId, entry) => run(Auth.logRequest(workspaceId, entry))
      }
    })
  )
}
