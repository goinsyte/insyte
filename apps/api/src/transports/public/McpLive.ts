import { InsyteTools } from "@insyte/api/mcp/McpTools"
import { Layer } from "effect"
import { McpServer } from "effect/ai"
import { AnalyticsMcp } from "./analytics/mcp.ts"
import { AutomationsMcp } from "./automations/mcp.ts"
import { ChargebacksMcp } from "./chargebacks/mcp.ts"
import { CommerceMcp } from "./commerce/mcp.ts"
import { CostsMcp } from "./costs/mcp.ts"
import { DataMcp } from "./data/mcp.ts"
import { ForwardingMcp } from "./forwarding/mcp.ts"
import { KeyMcp } from "./key/mcp.ts"
import { McpAuth } from "./mcp/KeyAuth.ts"
import { McpServerOptions } from "./mcp/Server.ts"
import { OrdersMcp } from "./orders/mcp.ts"
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

const Tools = McpServer.toolkit(InsyteTools).pipe(
  Layer.provide(
    Layer.mergeAll(
      KeyMcp,
      TeamMcp,
      CommerceMcp,
      OrdersMcp,
      ForwardingMcp,
      AnalyticsMcp,
      SheetsMcp,
      QueueMcp,
      ProposalsMcp,
      ReturnsMcp,
      TicketsMcp,
      AutomationsMcp,
      ChargebacksMcp,
      CostsMcp,
      DataMcp
    )
  )
)

export const McpLive = McpServer.layerHttpRequestScoped({ ...McpServerOptions, registrations: Tools }).pipe(
  Layer.provide(McpAuth.layer)
)
