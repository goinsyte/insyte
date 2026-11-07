import type { Db } from "@insyte/database/Db"
import { RpcMiddleware } from "effect/rpc"

/**
 * `Db` over a connection opened for this request only (16 §4). The tag lives with the contracts so a group can name
 * it (`.middleware(WithDb)`); the server provides it (`apps/api/src/transports/rpc/WithDbLive.ts`).
 */
export class WithDb extends RpcMiddleware.Service<WithDb, { provides: Db }>()("api/WithDb") {}
