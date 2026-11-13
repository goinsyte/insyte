import { Toolkit } from "effect/ai"
import { AnalyticsTools } from "./tools/AnalyticsTools.ts"
import { AutomationsTools } from "./tools/AutomationsTools.ts"
import { ChargebacksTools } from "./tools/ChargebacksTools.ts"
import { CommerceTools } from "./tools/CommerceTools.ts"
import { CostsTools } from "./tools/CostsTools.ts"
import { ForwardingTools } from "./tools/ForwardingTools.ts"
import { KeyTools } from "./tools/KeyTools.ts"
import { OrdersTools } from "./tools/OrdersTools.ts"
import { ProposalsTools } from "./tools/ProposalsTools.ts"
import { QueueTools } from "./tools/QueueTools.ts"
import { ReturnsTools } from "./tools/ReturnsTools.ts"
import { SheetsTools } from "./tools/SheetsTools.ts"
import { TeamTools } from "./tools/TeamTools.ts"
import { TicketsTools } from "./tools/TicketsTools.ts"

/*
 * The MCP server's tools (M19.3): what an agent with an API key may read, in the public API's shapes, and the order
 * commands (M7), forwarding (M8), returns (M9) and tickets (M11) as `/v1` has them, and the chargebacks to read (M13). The same key, the same scopes, the same request log; inviting, removing and
 * changing roles stay with people.
 *
 * One toolkit per slice in `tools/`, merged here in the order `tools/list` names them
 * (docs/adr/0041-transports-are-per-slice-layers-and-the-api-runs-as-three-workers.md).
 */

export const InsyteTools = Toolkit.merge(
  KeyTools,
  TeamTools,
  CommerceTools,
  OrdersTools,
  ForwardingTools,
  AnalyticsTools,
  SheetsTools,
  QueueTools,
  ProposalsTools,
  ReturnsTools,
  TicketsTools,
  AutomationsTools,
  ChargebacksTools,
  CostsTools
)
