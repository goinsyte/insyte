import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

/** What is running, and where. Gains `database` and `migratedTo` with the connection (M1.2). */
export class Health extends Schema.Class<Health>("api/Health")({
  version: Schema.String,
  environment: Schema.String
}) {}

export class SystemRpcs extends RpcGroup.make(
  Rpc.make("System.health", { success: Health })
) {}
