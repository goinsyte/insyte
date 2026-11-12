import { AGENT_ACTIONS } from "@insyte/domain/AgentActions"
import { Exit } from "effect"
import { describe, expect, it } from "vitest"
import { ageUndo, failure, ok, person } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Autonomy and the agent log (M15 step 6; ADR-0027): an agent's key writes only within the workspace's rules. Eerst
 * vragen (the default) turns its call into a proposal a person files; Zelf doen runs it and logs it with five minutes
 * to take it back; Nooit refuses it. An integration's key acts as before. Saving the rules names the version it was
 * made on, a locked action never becomes Zelf doen, and a save has an undo that writes the previous version again.
 */

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"
const VERSION = "2026-07-28"
const meta = {
  "io.modelcontextprotocol/protocolVersion": VERSION,
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
}
let id = 0

const tool = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": VERSION,
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++id,
      method: "tools/call",
      params: { name, arguments: args, _meta: meta }
    })
  })
  const text = await response.text()
  const message: Json = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return { isError: message.result.isError as boolean, body: JSON.parse(message.result.content[0].text) as Json }
}

const key = async (cookie: string, label: string, agent: boolean) =>
  ok(
    await rpc("ApiKeys.create", {
      label,
      access: { kind: "role", roleId: "service" },
      stores: "all",
      expiresInDays: 30,
      ips: [],
      agent
    }, cookie)
  ).secret

describe("autonomy and the agent log", () => {
  let owner = { email: "", cookie: "" }
  let workspace = ""
  let agent = ""
  let ticket = ""

  const statusOf = async (ticketId: string) =>
    ok(await rpc("Tickets.get", { id: ticketId }, owner.cookie)).ticket.status

  it("starts every action at Eerst vragen, version 1", async () => {
    owner = await person("agent-owner", "Agent Regels B.V.")
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    agent = await key(owner.cookie, "Claude", true)
    ticket = ok(await rpc("Tickets.create", { title: "Pakket kwijt" }, owner.cookie)).tickets[0]!.id

    const policy = ok(await rpc("Autonomy.get", {}, owner.cookie))
    expect(policy.version).toBe(1)
    expect(Object.keys(policy.levels).toSorted()).toEqual(AGENT_ACTIONS.map((a) => a.id).toSorted())
    expect(Object.values(policy.levels).every((l) => l === "ask")).toBe(true)
  }, 120_000)

  it("turns an agent's call into a proposal while the action asks first, and a person files it", async () => {
    const asked = await tool(agent, "set_ticket_status", { ticket_id: ticket, status: "in_progress" })
    expect(asked.isError).toBe(false)
    expect(asked.body).toMatchObject({ object: "agent_proposal", reason: "policy" })
    expect(await statusOf(ticket)).toBe("intake")

    // The same call again (same key) answers the same proposal, recorded once.
    const again = await tool(agent, "set_ticket_status", {
      ticket_id: ticket,
      status: "in_progress",
      idempotency_key: "k-1"
    })
    const twice = await tool(agent, "set_ticket_status", {
      ticket_id: ticket,
      status: "in_progress",
      idempotency_key: "k-1"
    })
    expect(twice.body.agent_action_id).toBe(again.body.agent_action_id)

    const filed = ok(await rpc("Proposals.file", { id: asked.body.proposal_id }, owner.cookie))
    expect(filed.proposal.state).toMatch(/filed|executed/)
    expect(await statusOf(ticket)).toBe("in_progress")
  })

  it("refuses a save made on an older version, a locked action at Zelf doen, and an action outside the catalogue", async () => {
    const saved = ok(
      await rpc(
        "Autonomy.set",
        { levels: { SetTicketStatus: "auto", AssignTicket: "never" }, baseVersion: 1 },
        owner.cookie
      )
    )
    expect(saved.policy.version).toBe(2)
    expect(saved.policy.levels.SetTicketStatus).toBe("auto")
    expect(saved.policy.history[0]).toMatchObject({
      version: 2,
      changes: expect.arrayContaining([{ id: "SetTicketStatus", from: "ask", to: "auto" }])
    })
    expect(saved.undo).not.toBeNull()

    expect(failure(await rpc("Autonomy.set", { levels: { AddNote: "auto" }, baseVersion: 1 }, owner.cookie)))
      .toMatchObject({ _tag: "AutonomyStale", version: 2 })
    expect(failure(await rpc("Autonomy.set", { levels: { CancelOrder: "auto" }, baseVersion: 2 }, owner.cookie)))
      .toMatchObject({ _tag: "AutonomyLocked", id: "CancelOrder" })
    expect(failure(await rpc("Autonomy.set", { levels: { DeleteEverything: "auto" }, baseVersion: 2 }, owner.cookie)))
      .toMatchObject({ _tag: "Invalid" })
  })

  it("runs a Zelf doen action as the agent, logs it, and lets a person take it back and put it back", async () => {
    const ran = await tool(agent, "set_ticket_status", { ticket_id: ticket, status: "awaiting_reply" })
    expect(ran.isError).toBe(false)
    expect(ran.body).toMatchObject({ id: ticket, status: "awaiting_reply" })

    const page = ok(await rpc("AgentLog.list", {}, owner.cookie))
    const row = page.rows.find((r) => r.action === "SetTicketStatus" && r.status === "done")!
    expect(row).toMatchObject({
      level: "auto",
      trigger: "Via MCP · Claude",
      triggerKind: "mcp",
      policyVersion: 2,
      before: "Bezig",
      after: "Wacht op antwoord",
      reversible: true,
      compensation: "Status terugzetten"
    })
    expect(row.undoUntil).toBeGreaterThan(Date.now() + 60_000)
    expect(page.counts.undoable).toBe(1)

    const undone = ok(await rpc("AgentLog.undo", { id: row.id }, owner.cookie))
    expect(undone.entry.status).toBe("undone")
    expect(undone.entry.undoneBy).not.toBeNull()
    expect(await statusOf(ticket)).toBe("in_progress")
    expect(failure(await rpc("AgentLog.undo", { id: row.id }, owner.cookie))).toMatchObject({
      _tag: "AgentActionFixed",
      reason: "state"
    })

    const redone = ok(await rpc("AgentLog.redo", { id: row.id }, owner.cookie))
    expect(redone.entry.status).toBe("done")
    expect(await statusOf(ticket)).toBe("awaiting_reply")
  })

  it("after the five minutes, offers the compensation as the person's own command", async () => {
    await tool(agent, "set_ticket_status", { ticket_id: ticket, status: "done" })
    const row = ok(await rpc("AgentLog.list", { action: "SetTicketStatus" }, owner.cookie)).rows[0]!
    await ageUndo(workspace, 6 * 60)
    expect(failure(await rpc("AgentLog.undo", { id: row.id }, owner.cookie))).toMatchObject({
      _tag: "AgentActionFixed",
      reason: "window"
    })
    const compensated = ok(await rpc("AgentLog.compensate", { id: row.id }, owner.cookie))
    expect(compensated.entry.status).toBe("undone")
    expect(await statusOf(ticket)).toBe("awaiting_reply")
  })

  it("refuses a Nooit action, and leaves an integration's key as it was", async () => {
    const memberId = ok(await rpc("Team.get", undefined, owner.cookie)).me
    const refused = await tool(agent, "assign_ticket", { ticket_id: ticket, member_id: memberId })
    expect(refused.isError).toBe(true)
    expect(JSON.stringify(refused.body)).toContain("ActionNotAllowedV1")

    // Not an agent's key: no rules, no log, as before.
    const integration = await key(owner.cookie, "Koppeling", false)
    const assigned = await tool(integration, "assign_ticket", { ticket_id: ticket, member_id: memberId })
    expect(assigned.isError).toBe(false)
    expect(assigned.body.assignees).toEqual(expect.arrayContaining([expect.objectContaining({ id: memberId })]))
  })

  it("takes back a save of the rules by writing the previous version as a new one", async () => {
    const now = ok(await rpc("Autonomy.get", {}, owner.cookie))
    const saved = ok(await rpc("Autonomy.resetDefaults", { baseVersion: now.version }, owner.cookie))
    expect(Object.values(saved.policy.levels).every((l) => l === "ask")).toBe(true)
    ok(await rpc("Shared.undo", { token: saved.undo!.token }, owner.cookie))
    const after = ok(await rpc("Autonomy.get", {}, owner.cookie))
    expect(after.version).toBe(now.version + 2)
    expect(after.levels).toEqual(now.levels)
  })

  it("keeps the AI budgets per month, refusing a person not in the team", async () => {
    const budgets = ok(await rpc("AiBudget.get", undefined, owner.cookie))
    expect(budgets).toMatchObject({ metered: false, workspace: { limit: null, used: 0 } })
    const saved = ok(await rpc("AiBudget.setMany", { entries: [{ scope: "workspace", limit: 50 }] }, owner.cookie))
    expect(saved.budgets.workspace.limit).toBe(50)
    expect(failure(await rpc("AiBudget.setMany", { entries: [{ scope: "mem_none", limit: 5 }] }, owner.cookie)))
      .toMatchObject({ _tag: "BudgetInvalid", reason: "member_not_found" })
    expect(Exit.isSuccess(await rpc("Shared.undo", { token: saved.undo!.token }, owner.cookie))).toBe(true)
    expect(ok(await rpc("AiBudget.get", undefined, owner.cookie)).workspace.limit).toBeNull()
  })
})
