import type { CurrentViewer } from "@insyte/domain/Session"
import { RpcMiddleware } from "effect/rpc"

/**
 * The session cookie, if any → `CurrentViewer` (16 §4): for public RPCs that still answer the signed-in person
 * differently. Never fails: no session, an expired or a revoked one is nobody.
 */
export class Viewer extends RpcMiddleware.Service<Viewer, { provides: CurrentViewer }>()("api/Viewer") {}
