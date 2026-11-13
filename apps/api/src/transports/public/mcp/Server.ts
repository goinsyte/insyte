import { McpProtocol } from "effect/ai"

/*
 * The MCP server (M19.3) at `/mcp`: Streamable HTTP, one server per request (a Worker keeps nothing between them), the
 * sessionless protocol 2026-07-28. A client logs in as an API key does, with `Authorization: Bearer ins_live_…`, and
 * acts with the key's scopes; each call lands in the key's request log. An agent's key (M15 step 6) writes only within
 * the workspace's autonomy rules (`Governance.ts`). `McpLive.ts` gives it the slices' tools.
 */
export const McpServerOptions = {
  name: "Insyte",
  version: "1.0.0",
  instructions:
    "Insyte for dropshipping operators. Read the workspace's team and roles, and its orders, products, customers and suppliers; tag orders, note them, change their address, cancel and refund them; forward paid orders to their suppliers and move them to another supplier; start, approve, reject, label, receive, inspect and settle returns; write, change, move, assign and comment on tickets; read chargebacks with their evidence and timeline; read the costs and the months' net profit, with the key's scopes. Cancelling, refunding, forwarding and settling a return with a refund cannot be undone: confirm them with the person first.",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28]
} as const
