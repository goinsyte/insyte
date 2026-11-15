import { describe, expect, it } from "vitest"
import { ok } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Every MCP write tool, for an agent's key (ADR-0027, M15 step 6): it goes through the workspace's autonomy rules
 * (`governed`: here every action is at Eerst vragen, so it answers a proposal) or is refused as outside what an agent
 * may do (`notForAgents`). Nothing an agent's key calls changes a record by itself. The walk is over the catalogue
 * `tools/list` gives, so a write tool added later without either fails here until it has its case below.
 */

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"
const VERSION = "2026-07-28"

let id = 0

const mcp = async (token: string, method: string, params: Record<string, unknown> = {}): Promise<Json> => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": method,
      ...(typeof params["name"] === "string" ? { "Mcp-Name": params["name"] } : {}),
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++id,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": VERSION,
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  // The walk calls more than a key's 10 a second: wait as the door says, then ask again.
  if (response.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, Number(response.headers.get("retry-after") ?? "1") * 1000))
    return mcp(token, method, params)
  }
  const text = await response.text()
  const message = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return message as Json
}

const tool = async (token: string, name: string, args: Record<string, unknown>) => {
  const message = await mcp(token, "tools/call", { name, arguments: args })
  if (message.result === undefined) return { isError: true, value: message }
  const text = message.result.content[0].text as string
  // A defect answers plain text, not a V1 envelope: kept as it is, so the failure below names it.
  const value = (() => {
    try {
      return JSON.parse(text) as Json
    } catch {
      return text
    }
  })()
  return { isError: message.result.isError as boolean, value }
}

describe("an agent's key and the MCP write tools", () => {
  it("goes through the autonomy rules, or is refused, on every write tool", async () => {
    const store = await importedStore("agent-mcp-writes")
    const make = async (label: string, agent: boolean) =>
      ok(
        await rpc("ApiKeys.create", {
          label,
          access: { kind: "role", roleId: "admin" },
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent
        }, store.cookie)
      ).secret
    // The same role for both: what differs is only that one is an agent's.
    const person = await make("Script", false)
    const agent = await make("Claude", true)

    // Records to act on, made by the script's key.
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1002")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    const started = await tool(person, "start_return", {
      order_id: order.id,
      lines: [{ line_id: line.id, quantity: 1 }],
      reason_id: "too_big",
      requested_resolution: "refund"
    })
    expect(started.isError).toBe(false)
    const ticket = await tool(person, "create_ticket", { title: "Voor de agent" })
    expect(ticket.isError).toBe(false)
    const members = await tool(person, "list_members", {})
    const member = members.value.data[0].id as string
    // A proposal of the agent's own, to file.
    const asked = await tool(agent, "tag_order", { order_id: order.id, add: ["Agent"] })
    expect(asked.value).toMatchObject({ object: "agent_proposal" })
    const proposal = asked.value.proposal_id as string

    const before = {
      order: (await tool(person, "get_order", { order_id: order.id })).value,
      ret: (await tool(person, "get_return", { return_id: started.value.id })).value,
      ticket: (await tool(person, "get_ticket", { ticket_id: ticket.value.id })).value
    }

    const o = { order_id: order.id }
    const r = { return_id: started.value.id }
    const t = { ticket_id: ticket.value.id }
    /** Each write tool with arguments a person's key could run it with. */
    const CASES: Record<string, Record<string, unknown>> = {
      tag_order: { ...o, add: ["Agent"] },
      set_order_note: { ...o, body: "Van de agent" },
      update_shipping_address: { ...o, line1: "Elders 1", city: "Ergens", postcode: "1234 AB", country: "NL" },
      flag_order_delayed: o,
      clear_order_delay: o,
      email_order_customer: { ...o, subject: "Hallo", body: "Van de agent" },
      cancel_order: { ...o, restock: true, notify_customer: false },
      refund_order: { ...o, amount_minor: 100 },
      forward_orders: { leg_ids: ["leg_agent"] },
      reroute_leg: { leg_id: "leg_agent", supplier_id: "sup_agent" },
      file_proposal: { proposal_id: proposal },
      trigger_automation: { automation_id: "aut_agent", ...o },
      start_return: {
        ...o,
        lines: [{ line_id: line.id, quantity: 1 }],
        reason_id: "too_big",
        requested_resolution: "refund"
      },
      approve_return: r,
      reject_return: { ...r, reason: "Niet in de termijn" },
      add_return_tracking: { ...r, carrier: "PostNL", tracking: "3SAGENT" },
      send_return_label: r,
      receive_return: r,
      inspect_return: r,
      resolve_return: { ...r, resolution: "refund" },
      create_ticket: { title: "Door de agent" },
      update_ticket: { ...t, title: "Door de agent" },
      set_ticket_status: { ...t, status: "done" },
      assign_ticket: { ...t, member_id: member },
      comment_on_ticket: { ...t, body: "Door de agent" }
    }

    const listed = await mcp(person, "tools/list")
    const writes = (listed.result.tools as Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>)
      .filter((x) => x.annotations?.readOnlyHint !== true)
      .map((x) => x.name)
      .toSorted()
    // A new write tool gets its case here, and with it the check below.
    expect(writes).toEqual(Object.keys(CASES).toSorted())

    for (const name of writes) {
      const answer = await tool(agent, name, CASES[name]!)
      const governed = !answer.isError && answer.value?.object === "agent_proposal"
      const refused = answer.isError && answer.value?.error?.code === "ActionNotAllowedV1"
      expect(governed || refused, `${name}: ${JSON.stringify(answer)}`).toBe(true)
    }

    // And nothing moved: the order, the return and the ticket are as they were.
    expect((await tool(person, "get_order", { order_id: order.id })).value).toEqual(before.order)
    expect((await tool(person, "get_return", { return_id: started.value.id })).value).toEqual(before.ret)
    expect((await tool(person, "get_ticket", { ticket_id: ticket.value.id })).value).toEqual(before.ticket)
  })
})
