import { AGENT_ACTION_IDS } from "@insyte/domain/AgentActions"
import { API_AREAS } from "@insyte/domain/Permissions"
import { describe, expect, it } from "vitest"
import { ok } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Per-key `tools/list` (M19.3): each key is named the tools it can call. Its role's levels and specials as the use cases
 * ask for them; for an agent's key also the agents' rule (a tool refused to agents is not named, nor one whose every
 * action the workspace sets to Nooit). A tool the list leaves out is still answered by name, refused as before
 * (`ScopeMissingV1`, `ActionNotAllowedV1`), and one it names is not refused for its scope. Walked over the whole
 * catalogue, for keys of every kind.
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
  return response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
}

const names = async (token: string) =>
  ((await mcp(token, "tools/list")).result.tools as Array<{ name: string }>).map((t) => t.name).toSorted()

/** A call's refusal code, if it was refused for the key (its scope or the agents' rule). */
const refusal = async (token: string, name: string, args: Record<string, unknown>) => {
  const message = await mcp(token, "tools/call", { name, arguments: args })
  if (message.result === undefined) return `jsonrpc:${JSON.stringify(message.error)}`
  if (!message.result.isError) return null
  const text = message.result.content[0].text as string
  const code = (() => {
    try {
      return (JSON.parse(text) as Json).error?.code as string | undefined
    } catch {
      return `text:${text}`
    }
  })()
  return code === "ScopeMissingV1" || code === "ActionNotAllowedV1" ? code : null
}

/** Arguments for every tool: real records (`real`) or ids of none (`none`), so a named write finds nothing to change. */
const argsFor = (r: { order: string; line: string; ret: string; ticket: string; member: string; proposal: string }) => {
  const o = { order_id: r.order }
  const ret = { return_id: r.ret }
  const t = { ticket_id: r.ticket }
  return {
    whoami: {},
    // On a conversation that is not there: answered NotFound before any model call, never refused for its scope.
    ask_insyte: { question: "Wat wacht er op mij?", thread_id: "ath_none" },
    list_members: {},
    list_roles: {},
    list_orders: {},
    list_products: {},
    list_low_stock: {},
    list_customers: {},
    get_order: o,
    tag_order: { ...o, add: ["Bereik"] },
    set_order_note: { ...o, body: "Bereik" },
    update_shipping_address: { ...o, line1: "Elders 1", city: "Ergens", postcode: "1234 AB", country: "NL" },
    flag_order_delayed: o,
    clear_order_delay: o,
    email_order_customer: { ...o, subject: "Hallo", body: "Bereik" },
    cancel_order: { ...o, restock: true, notify_customer: false },
    refund_order: { ...o, amount_minor: 100 },
    get_order_tracking: o,
    list_suppliers: {},
    list_supplier_statements: { supplier_id: "sup_none" },
    list_forwarding: {},
    forward_orders: { leg_ids: ["leg_none"] },
    reroute_leg: { leg_id: "leg_none", supplier_id: "sup_none" },
    get_analytics_overview: { a: "2026-02", b: "2026-01" },
    get_figures: { metrics: "omzet" },
    list_sheets: {},
    get_sheet: { sheet_id: "sht_none" },
    list_queue: {},
    list_knowledge: {},
    search_knowledge: { query: "retourneren" },
    get_proposal: { proposal_id: r.proposal },
    file_proposal: { proposal_id: r.proposal },
    list_returns: {},
    get_return: ret,
    start_return: {
      ...o,
      lines: [{ line_id: r.line, quantity: 1 }],
      reason_id: "too_big",
      requested_resolution: "refund"
    },
    approve_return: ret,
    reject_return: { ...ret, reason: "Bereik" },
    send_return_label: ret,
    add_return_tracking: { ...ret, carrier: "PostNL", tracking: "3SBEREIK" },
    receive_return: ret,
    inspect_return: ret,
    // Settling without money: a refund also needs refunds.write.
    resolve_return: { ...ret, resolution: "exchange" },
    list_tickets: {},
    get_ticket: t,
    create_ticket: { title: "Bereik" },
    update_ticket: { ...t, title: "Bereik" },
    set_ticket_status: { ...t, status: "done" },
    assign_ticket: { ...t, member_id: r.member },
    comment_on_ticket: { ...t, body: "Bereik" },
    list_automations: {},
    get_automation: { automation_id: "aut_none" },
    list_automation_runs: { automation_id: "aut_none" },
    trigger_automation: { automation_id: "aut_none", ...o },
    list_chargebacks: {},
    get_chargeback: { chargeback_id: "cb_none" },
    get_costs: {},
    get_cost_figures: { months: "2026-01" },
    get_connection_health: {},
    list_imports: {},
    list_exports: {},
    get_export: { export_id: "exp_none" }
  } as Record<string, Record<string, unknown>>
}

const NONE = {
  order: "ord_none",
  line: "lin_none",
  ret: "ret_none",
  ticket: "tkt_none",
  member: "mem_none",
  proposal: "prp_none"
}

describe("per-key tools/list", () => {
  let store = { cookie: "", workspace: "" }
  let full = ""
  let records = NONE
  const make = async (label: string, access: unknown, agent: boolean) =>
    ok(
      await rpc("ApiKeys.create", {
        label,
        access: access as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent
      }, store.cookie)
    ).secret

  it("names each key the tools it can call, and refuses a call of any other as before", async () => {
    store = await importedStore("mcp-reach")
    full = await make("Alles", { kind: "role", roleId: "admin" }, false)
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1002")!
    const line = ok(await rpc("Orders.get", { id: order.id }, store.cookie)).lines[0]!
    const call1 = async (name: string, args: Record<string, unknown>) =>
      JSON.parse((await mcp(full, "tools/call", { name, arguments: args })).result.content[0].text) as Json
    const started = await call1("start_return", {
      order_id: order.id,
      lines: [{ line_id: line.id, quantity: 1 }],
      reason_id: "too_big",
      requested_resolution: "refund"
    })
    const ticket = await call1("create_ticket", { title: "Voor het bereik" })
    const member = (await call1("list_members", {})).data[0].id as string
    // A plate of an agent's own, to read and file.
    const asker = await make("Vrager", { kind: "role", roleId: "admin" }, true)
    const asked = JSON.parse(
      (await mcp(asker, "tools/call", { name: "tag_order", arguments: { order_id: order.id, add: ["Vraag"] } }))
        .result.content[0].text
    ) as Json
    expect(asked).toMatchObject({ object: "agent_proposal" })
    records = {
      order: order.id,
      line: line.id,
      ret: started.id,
      ticket: ticket.id,
      member,
      proposal: asked.proposal_id
    }

    const catalogue = await names(full)
    expect(catalogue).toHaveLength(61)
    const real = argsFor(records)
    const none = argsFor(NONE)
    expect(Object.keys(real).toSorted()).toEqual(catalogue)

    const kinds = {
      view: await make("Alleen kijken", { kind: "role", roleId: "view" }, false),
      orders: await make("Alleen bestellingen", { kind: "custom", scopes: { orders: 1 } }, false),
      ordersWrite: await make("Bestellingen bewerken", { kind: "custom", scopes: { orders: 2, returns: 2 } }, false),
      // Every area the API allows at its most, and no special: what a tool needs beyond the areas shows here.
      areas: await make("Alle gebieden", {
        kind: "custom",
        scopes: Object.fromEntries(API_AREAS.map((a) => [a.id, a.apiMax ?? 2]))
      }, false),
      service: await make("Klantenservice", { kind: "role", roleId: "service" }, false),
      agentView: await make("Agent kijkt", { kind: "role", roleId: "view" }, true),
      agentService: await make("Agent klantenservice", { kind: "role", roleId: "service" }, true),
      agentAdmin: await make("Agent alles", { kind: "role", roleId: "admin" }, true)
    }
    const lists = Object.fromEntries(
      await Promise.all(Object.entries(kinds).map(async ([kind, token]) => [kind, await names(token)] as const))
    )

    // What each kind is named, by the catalogue's own words.
    expect(lists["view"]).not.toContain("tag_order")
    expect(lists["view"]).toContain("list_orders")
    // Vraag Insyte needs no scope of its own: each read it makes needs its own.
    expect(lists["orders"]).toEqual([
      "ask_insyte",
      "file_proposal",
      "get_order",
      "get_order_tracking",
      "get_proposal",
      "list_forwarding",
      "list_orders",
      "list_queue",
      "whoami"
    ])
    // Its own scopes carry no special: no refund, no approving a return.
    expect(lists["ordersWrite"]).toContain("cancel_order")
    expect(lists["ordersWrite"]).not.toContain("refund_order")
    expect(lists["ordersWrite"]).not.toContain("approve_return")
    expect(lists["service"]).toContain("refund_order")
    expect(lists["service"]).toContain("update_shipping_address")
    expect(lists["service"]).not.toContain("get_figures")
    // An agent's key: the governed writes, not the ones refused to agents.
    expect(lists["agentService"]).toContain("cancel_order")
    expect(lists["agentService"]).toContain("set_ticket_status")
    for (const refused of ["update_shipping_address", "email_order_customer", "start_return", "trigger_automation"]) {
      expect(lists["agentAdmin"]).not.toContain(refused)
    }
    // An agent that only reads asks first (a proposal a person files): named the governed writes as well.
    expect(lists["agentView"]).toEqual(expect.arrayContaining([...lists["view"]!, "cancel_order", "set_ticket_status"]))
    expect(lists["agentView"]).not.toContain("start_return")

    // The walk: every tool the list leaves out is refused by name (on real records, so a slip would show), and none it
    // names is refused for its scope (on records that do not exist, so nothing changes).
    const walked = await Promise.all(
      Object.entries(kinds).map(async ([kind, token]) => {
        const out: Array<string> = []
        for (const name of catalogue) {
          const listed = lists[kind]!.includes(name)
          const code = await refusal(token, name, listed ? none[name]! : real[name]!)
          if (listed && code !== null) out.push(`${kind}: ${name} is named, but answers ${code}`)
          if (!listed && code === null) out.push(`${kind}: ${name} is left out, but is not refused`)
        }
        return out
      })
    )
    expect(walked.flat()).toEqual([])
  }, 300_000)

  it(
    "leaves out of an agent's list a tool whose every action the workspace sets to Nooit, and refuses its call",
    async () => {
      const agent = await make("Agent Nooit", { kind: "role", roleId: "admin" }, true)
      const script = await make("Script Nooit", { kind: "role", roleId: "admin" }, false)
      const real = argsFor(records)
      /** The governed tools with the actions they go through. */
      const GOVERNED: Record<string, ReadonlyArray<string>> = {
        tag_order: ["ApplyLabel"],
        set_order_note: ["AddNote"],
        cancel_order: ["CancelOrder"],
        refund_order: ["RefundOrder"],
        forward_orders: ["ForwardOrder"],
        approve_return: ["ApproveReturn"],
        send_return_label: ["SendReturnLabel"],
        resolve_return: ["RefundOrder", "ApproveReturn"],
        create_ticket: ["CreateTicket"],
        update_ticket: ["SetPriority", "ApplyLabel"],
        set_ticket_status: ["SetTicketStatus"],
        assign_ticket: ["AssignTicket"],
        comment_on_ticket: ["AddNote"]
      }
      let version = ok(await rpc("Autonomy.get", {}, store.cookie)).version
      const misses: Array<string> = []
      for (const [name, actions] of Object.entries(GOVERNED)) {
        const levels = Object.fromEntries(AGENT_ACTION_IDS.map((a) => [a, actions.includes(a) ? "never" : "ask"]))
        version = ok(await rpc("Autonomy.set", { levels: levels as never, baseVersion: version }, store.cookie)).policy
          .version
        const listed = await names(agent)
        if (listed.includes(name)) misses.push(`${name} is named with ${actions.join(", ")} at Nooit`)
        const code = await refusal(agent, name, real[name]!)
        if (code !== "ActionNotAllowedV1") misses.push(`${name} answers ${code} with ${actions.join(", ")} at Nooit`)
        // A key that is no agent's is not held to the rules: it is named every tool still.
        if (!(await names(script)).includes(name)) misses.push(`${name} is left out for a script's key`)
      }
      expect(misses).toEqual([])

      // Eerst vragen files a proposal, which only reads the record: an agent that only reads is named the tool. Zelf doen
      // runs it as the agent, with its own scopes: then it is not, and its call is refused for the scope.
      const reader = await make("Agent leest", { kind: "role", roleId: "view" }, true)
      const auto = Object.fromEntries(AGENT_ACTION_IDS.map((a) => [a, a === "SetTicketStatus" ? "auto" : "ask"]))
      version =
        ok(await rpc("Autonomy.set", { levels: auto as never, baseVersion: version }, store.cookie)).policy.version
      const reading = await names(reader)
      expect(reading).toContain("assign_ticket")
      expect(reading).not.toContain("set_ticket_status")
      expect(await refusal(reader, "set_ticket_status", real["set_ticket_status"]!)).toBe("ScopeMissingV1")
      expect(await refusal(reader, "assign_ticket", real["assign_ticket"]!)).toBeNull()

      // Back to Eerst vragen: the tools are named again.
      ok(await rpc("Autonomy.resetDefaults", { baseVersion: version }, store.cookie))
      expect(await names(agent)).toEqual(expect.arrayContaining(Object.keys(GOVERNED)))
    },
    300_000
  )
})
