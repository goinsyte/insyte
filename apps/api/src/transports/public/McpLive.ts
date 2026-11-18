import { InsyteTools } from "@insyte/api/mcp/McpTools"
import { Effect, Layer } from "effect"
import { McpServer } from "effect/ai"
import { AnalyticsMcp } from "./analytics/mcp.ts"
import { AskMcp } from "./ask/mcp.ts"
import { AutomationsMcp } from "./automations/mcp.ts"
import { ChargebacksMcp } from "./chargebacks/mcp.ts"
import { CommerceMcp } from "./commerce/mcp.ts"
import { ConnectionsMcp } from "./connections/mcp.ts"
import { CostsMcp } from "./costs/mcp.ts"
import { CustomerAgentMcp } from "./customer-agent/mcp.ts"
import { DataMcp } from "./data/mcp.ts"
import { ForwardingMcp } from "./forwarding/mcp.ts"
import { KeyMcp } from "./key/mcp.ts"
import { WorkspaceResource } from "./key/resources.ts"
import { KnowledgeMcp } from "./knowledge/mcp.ts"
import { McpAuth } from "./mcp/KeyAuth.ts"
import { ToolReach } from "./mcp/Reach.ts"
import { McpServerOptions } from "./mcp/Server.ts"
import { OrdersMcp } from "./orders/mcp.ts"
import { OrderResource } from "./orders/resources.ts"
import { ProposalsMcp } from "./proposals/mcp.ts"
import { QueueMcp } from "./queue/mcp.ts"
import { ReturnsMcp } from "./returns/mcp.ts"
import { SheetsMcp } from "./sheets/mcp.ts"
import { TeamMcp } from "./team/mcp.ts"
import { TicketsMcp } from "./tickets/mcp.ts"

/*
 * The MCP server (M19.3, `mcp/Server.ts`) behind the key door, with every slice's tools: each slice's handlers are its
 * folder's `mcp.ts`, over the same `<Slice>V1` as `/v1`. The assembly only
 * (docs/adr/0041-transports-are-per-slice-layers-and-the-api-runs-as-three-workers.md): a new slice adds one line here.
 */

// Each key is shown the tools it can call (`mcp/Reach.ts`).
const Tools = McpServer.toolkit(InsyteTools).pipe(
  Layer.provide(ToolReach.layer),
  Layer.provide(
    Layer.mergeAll(
      KeyMcp,
      TeamMcp,
      CommerceMcp,
      OrdersMcp,
      ForwardingMcp,
      AnalyticsMcp,
      SheetsMcp,
      KnowledgeMcp,
      CustomerAgentMcp,
      QueueMcp,
      ProposalsMcp,
      ReturnsMcp,
      TicketsMcp,
      AutomationsMcp,
      ChargebacksMcp,
      CostsMcp,
      ConnectionsMcp,
      DataMcp,
      AskMcp
    )
  )
)

// The records a client reads by address (M19.3): one line per slice.
const Resources = Layer.mergeAll(WorkspaceResource, OrderResource)

// What the Worker's start has no room for, registered once its module is in, with the first request (ADR-0041 §3):
// the inbox's tools and its `insyte://threads/{id}`, each key shown its tools by their own reach.
const Later = Layer.unwrap(Effect.promise(() => import("./inbox/mcp.ts")).pipe(Effect.map((m) => m.InboxRegistrations)))

export const McpLive = McpServer.layerHttpRequestScoped({
  ...McpServerOptions,
  registrations: Layer.mergeAll(Tools, Resources, Later)
}).pipe(
  Layer.provide(McpAuth.layer)
)
