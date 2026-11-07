import { Unauthenticated } from "@insyte/domain/Errors"
import type { CurrentUser } from "@insyte/domain/Session"
import { RpcMiddleware } from "effect/rpc"

/**
 * The session cookie → the signed-in user (16 §4). The tag lives with the contracts so a group can name it; the API
 * Worker provides it (`AuthenticatedLive.ts`). A missing, expired or revoked session fails with `Unauthenticated`.
 */
export class Authenticated extends RpcMiddleware.Service<Authenticated, { provides: CurrentUser }>()(
  "api/Authenticated",
  { error: Unauthenticated }
) {}
