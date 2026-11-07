import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { WithDb } from "./WithDb.ts"

/** What is running, where, and whether its database answers: the walking skeleton's proof (15, step 0). */
export class Health extends Schema.Class<Health>("api/Health")({
  version: Schema.String,
  environment: Schema.String,
  database: Schema.Literals(["ok", "down"]),
  /** The last migration key the database recorded, or `""` when it did not answer. */
  migratedTo: Schema.String
}) {}

export class SystemRpcs extends RpcGroup.make(
  Rpc.make("System.health", { success: Health })
).middleware(WithDb) {}
