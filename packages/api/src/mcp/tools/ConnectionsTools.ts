import { Tool, Toolkit } from "effect/ai"
import { ScopeMissingV1 } from "../../http/Errors.ts"
import { ConnectionsHealthV1 } from "../../http/groups/ConnectionsGroup.ts"
import { asKey } from "../Shared.ts"

/* Sync health (M17 step 6): every store's connection, its state and its incidents with what Insyte tried. */

export const GetConnectionHealth = Tool.make("get_connection_health", {
  description:
    "Sync health of the workspace's Shopify stores: per store its state (ok, warning while Insyte handles an incident, broken when the store must be connected again, importing), when it last synced, the newest order webhook, and its open incidents and those resolved in the last seven days, each with what Insyte already tried. Checked every 15 minutes. Needs data.read.",
  success: ConnectionsHealthV1,
  failure: ScopeMissingV1,
  dependencies: asKey()
}).annotate(Tool.Readonly, true)

export const ConnectionsTools = Toolkit.make(GetConnectionHealth)
