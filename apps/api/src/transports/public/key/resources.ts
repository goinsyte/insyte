import { Effect, Layer } from "effect"
import { McpServer } from "effect/ai"
import { json } from "../mcp/Resources.ts"
import { KeyV1 } from "./KeyV1.ts"

/* `insyte://workspace` (M19.3): the key's workspace, its plan and the stores the key reaches. Any key reads it. */

export const WorkspaceResource = Layer.unwrap(Effect.map(Effect.service(KeyV1), (read) =>
  McpServer.resource({
    uri: "insyte://workspace",
    name: "workspace",
    description:
      "The Insyte workspace this key belongs to: its name, its plan, and the stores the key reaches (id, name, Shopify domain, status, currency).",
    mimeType: "application/json",
    content: json("insyte://workspace", read.workspace)
  }))).pipe(Layer.provide(KeyV1.layer))
