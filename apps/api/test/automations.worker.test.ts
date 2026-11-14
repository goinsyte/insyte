import { UNDO_SECONDS } from "@insyte/modules/shared/domain/Undo"
import { env } from "cloudflare:workers"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { consume, failure, join, ok, outboxOf, pastUndo, person, productEventsOf, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Automations as definitions (step 14.1, M12 step 1): a draft from a template or from nothing, saved as the canvas goes
 * with what is wrong per step, published as immutable versions (refused while it cannot run or has nothing new), paused
 * and turned on, its settings changed, copied and removed, each with its undo; refused to a role without the right;
 * and read through `/v1` and MCP for a key.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const get = async (path: string, token: string) => {
  const response = await call(`${HOST}/v1${path}`, { headers: { authorization: `Bearer ${token}` } })
  return { status: response.status, body: await response.json() as Json }
}

const mcpCall = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": name,
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name,
        arguments: args,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": { name: "insyte-test", version: "1.0.0" }
        }
      }
    })
  })
  const text = await response.text()
  const message = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  if (message.result === undefined) throw new Error(JSON.stringify(message))
  return { isError: message.result.isError as boolean, value: JSON.parse(message.result.content[0].text) as Json }
}

// A flow that asks `approver` before it makes a ticket.
const approvalFlow = (approver: string) => [
  { id: "t", variantId: "trigger.shipping_delay", config: {} },
  { id: "a", variantId: "action.require_approval", config: { approver } },
  { id: "k", variantId: "action.create_ticket", config: { title: "Na goedkeuring", assignee: "" } }
]

const tag = (failed: unknown) => (failed as { _tag?: string } | undefined)?._tag

describe("automations", () => {
  const people = { owner: "", service: "", finance: "" }
  let workspace = ""

  beforeAll(async () => {
    const owner = await person("automations-owner", "Flows B.V.")
    people.owner = owner.cookie
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const colleagues = (["service", "finance"] as const).map((role) => ({
      role,
      email: `automations-${run}-${role}@invited.test`
    }))
    ok(
      await rpc("Invitations.send", {
        rows: colleagues.map((c) => ({ email: c.email, roleId: c.role, stores: "all" as const }))
      }, owner.cookie)
    )
    await pastUndo(workspace)
    await relay(workspace)
    for (const c of colleagues) people[c.role] = await join(c.email)
  }, 120_000)

  it("makes a draft from a template, and Undo takes it away again", async () => {
    const made = ok(await rpc("Automations.create", { templateId: "tpl_shipped" }, people.owner))
    const a = made.automation!.automation
    expect(a).toMatchObject({
      name: "Bestelling verzonden → track & trace-bericht",
      status: "draft",
      liveVersion: 0,
      dirty: true,
      template: "tpl_shipped"
    })
    expect(a.nodes.map((n) => n.variantId)).toEqual(["trigger.order_shipped", "action.klaviyo_send"])
    expect(a.nodes[0]!.config).toEqual({ summary: "Bestelling in Shopify als verzonden gemarkeerd" })
    // Neither Shopify nor Klaviyo is connected: the steps say so, and that does not stop publishing.
    expect(made.automation!.issues.map((i) => [i.code, i.severity])).toEqual([
      ["connection_missing", "warning"],
      ["connection_missing", "warning"]
    ])
    expect(made.automation!.issues[1]!.message).toBe("Koppel Klaviyo")

    const list = ok(await rpc("Automations.list", {}, people.owner))
    expect(list.rows.map((r) => r.id)).toContain(a.id)
    ok(await rpc("Shared.undo", { token: made.undo!.token }, people.owner))
    expect(tag(failure(await rpc("Automations.get", { id: a.id }, people.owner)))).toBe("NotFound")
  })

  it("saves the canvas with what is wrong per step, and keeps the config's own keys", async () => {
    const { automation } = ok(await rpc("Automations.create", {}, people.owner))
    const id = automation!.automation.id
    expect(automation!.automation.name).toBe("Naamloze automatisering")
    expect(automation!.issues.map((i) => i.code)).toEqual(["missing_trigger"])

    const saved = ok(
      await rpc("Automations.saveDraft", {
        id,
        name: "Vertraagd → klant mailen",
        nodes: [
          { id: "n1", variantId: "trigger.shipping_delay", config: { summary: "Twee dagen te laat" } },
          { id: "n2", variantId: "action.tag_customer", config: { tag: "", title_override: "Label zetten" } },
          { id: "n3", variantId: "delay.wait", config: { minutes: 99_999 } }
        ]
      }, people.owner)
    )
    expect(saved.issues.map((i) => [i.nodeId, i.code, i.field])).toEqual([
      ["n2", "missing_field", "tag"],
      ["n3", "out_of_range", "minutes"]
    ])
    expect(saved.automation.name).toBe("Vertraagd → klant mailen")
    const read = ok(await rpc("Automations.get", { id }, people.owner))
    expect(read.automation.nodes[1]!.config).toEqual({ tag: "", title_override: "Label zetten" })

    // It cannot run like this: publishing says per step why.
    const refused = failure(await rpc("Automations.publish", { id, note: "" }, people.owner)) as Json
    expect(refused._tag).toBe("InvalidFlow")
    expect(refused.issues.map((i: Json) => i.nodeId)).toEqual(["n2", "n3"])
  })

  it("publishes immutable versions, refuses nothing new, and Undo goes back to the version before", async () => {
    const { automation } = ok(await rpc("Automations.create", { name: "Label op VIP's" }, people.owner))
    const id = automation!.automation.id
    const nodes = [
      { id: "t", variantId: "trigger.order_placed", config: {} },
      { id: "a", variantId: "action.tag_customer", config: { tag: "vip" } }
    ]
    ok(await rpc("Automations.saveDraft", { id, nodes }, people.owner))
    const first = ok(await rpc("Automations.publish", { id, note: "Eerste publicatie" }, people.owner))
    expect(first.automation!.automation).toMatchObject({ status: "active", liveVersion: 1, dirty: false })
    expect(first.automation!.versions.map((v) => [v.version, v.note, v.scopesRequired])).toEqual([
      [1, "Eerste publicatie", ["customers.write"]]
    ])
    expect(tag(failure(await rpc("Automations.publish", { id, note: "" }, people.owner)))).toBe("NothingToPublish")

    const changed = [...nodes, { id: "w", variantId: "delay.wait", config: { minutes: 60 } }]
    const saved = ok(await rpc("Automations.saveDraft", { id, nodes: changed }, people.owner))
    expect(saved.automation.dirty).toBe(true)
    const second = ok(await rpc("Automations.publish", { id, note: "Wachttijd erbij" }, people.owner))
    expect(second.automation!.automation.liveVersion).toBe(2)
    ok(await rpc("Shared.undo", { token: second.undo!.token }, people.owner))
    const back = ok(await rpc("Automations.get", { id }, people.owner))
    expect(back.automation.liveVersion).toBe(3)
    expect(back.liveNodes).toEqual(nodes)
    expect(back.versions.map((v) => v.version)).toEqual([3, 2, 1])
    expect(back.versions[0]!.note).toBe("Terug naar versie 1")

    // Delivered inside its window, the event is acked and goes back onto the queue for the time it has left: dropped,
    // it would wait for the cron's sweep, and previews run no cron.
    const early = (await outboxOf(workspace)).filter((e) =>
      e.event === "automation.published" && !e.due && !e.cancelled
    )
    expect(early).toHaveLength(1)
    // Mocked: the delayed copy is asserted, not left to land in the test queue later.
    const sendBatch = vi.spyOn(env.EVENTS, "sendBatch").mockResolvedValue(undefined as never)
    expect((await consume(early.map((e) => e.id))).ackAll).toBe(true)
    expect(sendBatch).toHaveBeenCalledTimes(1)
    const [sent] = sendBatch.mock.calls[0]!
    expect([...sent].map((m) => m.body)).toEqual([{ outboxIds: [early[0]!.id] }])
    // What is left of the undo window: more than nothing, no more than the window, and so under Queues' 12 hours.
    const delay = [...sent][0]!.delaySeconds!
    expect(delay).toBeGreaterThanOrEqual(1)
    expect(delay).toBeLessThanOrEqual(Math.min(UNDO_SECONDS, 43_200))
    sendBatch.mockRestore()

    // The first publication's event leaves once the window has passed; the undone one's never does.
    await pastUndo(workspace)
    await relay(workspace)
    const events = (await productEventsOf(workspace)).filter((e) => e.event === "automation_published")
    expect(events.length).toBe(1)
  })

  it("undoes a first publication back to a draft", async () => {
    const { automation } = ok(await rpc("Automations.create", { templateId: "tpl_vip" }, people.owner))
    const id = automation!.automation.id
    const published = ok(await rpc("Automations.publish", { id, note: "" }, people.owner))
    expect(published.automation!.versions[0]!.note).toBe("Gepubliceerd")
    ok(await rpc("Shared.undo", { token: published.undo!.token }, people.owner))
    const back = ok(await rpc("Automations.get", { id }, people.owner))
    expect(back.automation).toMatchObject({ status: "draft", liveVersion: 0 })
    expect(back.versions).toEqual([])
  })

  it("pauses and turns on a published flow, and a draft has nothing to turn on", async () => {
    const { automation } = ok(await rpc("Automations.create", { templateId: "tpl_vip" }, people.owner))
    const id = automation!.automation.id
    expect(tag(failure(await rpc("Automations.setStatus", { id, status: "active" }, people.owner)))).toBe("Conflict")
    ok(await rpc("Automations.publish", { id, note: "" }, people.owner))
    const paused = ok(await rpc("Automations.setStatus", { id, status: "paused" }, people.owner))
    expect(paused.automation!.automation.status).toBe("paused")
    ok(await rpc("Shared.undo", { token: paused.undo!.token }, people.owner))
    expect(ok(await rpc("Automations.get", { id }, people.owner)).automation.status).toBe("active")
  })

  it("changes the settings, and a right switched off stops publishing", async () => {
    const { automation } = ok(await rpc("Automations.create", { templateId: "tpl_vip" }, people.owner))
    const id = automation!.automation.id
    const off = ok(
      await rpc("Automations.updateSettings", { id, scopesOff: ["customers.write"], rateLimit: 60 }, people.owner)
    )
    expect(off.automation!.settings).toMatchObject({ scopesOff: ["customers.write"], rateLimit: 60, notify: null })
    expect(off.automation!.issues.some((i) => i.code === "scope_off")).toBe(true)
    expect(tag(failure(await rpc("Automations.publish", { id, note: "" }, people.owner)))).toBe("InvalidFlow")
    expect(tag(failure(await rpc("Automations.updateSettings", { id, scopesOff: ["geen.recht"] }, people.owner))))
      .toBe("Invalid")
    ok(await rpc("Shared.undo", { token: off.undo!.token }, people.owner))
    const back = ok(await rpc("Automations.get", { id }, people.owner))
    expect(back.settings).toMatchObject({ scopesOff: [], rateLimit: 0 })
  })

  it("keeps who approves as a teammate's id, mapping a name from an older draft, and refuses one nobody answers to", async () => {
    const ownerId = ok(await sessionMe(people.owner)).principals[0]!.id
    const { automation } = ok(await rpc("Automations.create", { name: "Goedkeuring" }, people.owner))
    const id = automation!.automation.id
    // A name, as drafts held before the inspector picked teammates: the one member who goes by it.
    const named = ok(
      await rpc("Automations.saveDraft", { id, nodes: approvalFlow("persoon automations-owner") }, people.owner)
    )
    expect(named.automation.nodes[1]!.config).toEqual({ approver: ownerId, approver_name: "Persoon automations-owner" })
    expect(named.issues.filter((i) => i.nodeId === "a")).toEqual([])
    const byId = ok(await rpc("Automations.saveDraft", { id, nodes: approvalFlow(ownerId) }, people.owner))
    expect(byId.automation.nodes[1]!.config).toMatchObject({ approver: ownerId })
    // Nobody goes by it: emptied, so the step asks for a teammate and the flow cannot be published.
    const nobody = ok(await rpc("Automations.saveDraft", { id, nodes: approvalFlow("Niemand Bekend") }, people.owner))
    expect(nobody.automation.nodes[1]!.config).toEqual({ approver: "" })
    expect(nobody.issues).toContainEqual(
      expect.objectContaining({ nodeId: "a", code: "missing_field", field: "approver" })
    )
    expect(tag(failure(await rpc("Automations.publish", { id, note: "" }, people.owner)))).toBe("InvalidFlow")
  })

  it("copies a flow as a draft and removes one with Undo", async () => {
    const { automation } = ok(await rpc("Automations.create", { templateId: "tpl_late" }, people.owner))
    const id = automation!.automation.id
    const copy = ok(await rpc("Automations.duplicate", { id }, people.owner)).automation!.automation
    expect(copy.name).toBe("Late levering → leverancier, excuses en korting (kopie)")
    expect(copy.status).toBe("draft")
    expect(copy.nodes.map((n) => n.variantId)).toEqual(automation!.automation.nodes.map((n) => n.variantId))
    expect(copy.nodes[0]!.id).not.toBe(automation!.automation.nodes[0]!.id)

    const removed = ok(await rpc("Automations.remove", { id: copy.id }, people.owner))
    expect(removed.automation).toBeNull()
    expect(ok(await rpc("Automations.list", {}, people.owner)).rows.map((r) => r.id)).not.toContain(copy.id)
    ok(await rpc("Shared.undo", { token: removed.undo!.token }, people.owner))
    expect(ok(await rpc("Automations.list", {}, people.owner)).rows.map((r) => r.id)).toContain(copy.id)
    ok(await rpc("Automations.remove", { id: copy.id }, people.owner))
    expect(ok(await rpc("Automations.restore", { id: copy.id }, people.owner)).automation!.automation.id).toBe(copy.id)
  })

  it("offers the fields a trigger carries", async () => {
    const fields = ok(await rpc("Automations.fields", { triggerVariant: "trigger.order_shipped" }, people.owner))
    expect(fields.map((f) => f.path)).toContain("order.tracking_url")
    expect(ok(await rpc("Automations.fields", { triggerVariant: "nope" }, people.owner))).toEqual([])
    expect(ok(await rpc("Automations.recommended", undefined, people.owner))).toEqual([])
  })

  it("lets Klantenservice read but not change, and Financiën not even read", async () => {
    const list = ok(await rpc("Automations.list", {}, people.service))
    expect(list.counts.all).toBeGreaterThan(0)
    const id = list.rows[0]!.id
    expect(tag(failure(await rpc("Automations.saveDraft", { id, nodes: [] }, people.service)))).toBe("Forbidden")
    expect(tag(failure(await rpc("Automations.publish", { id, note: "" }, people.service)))).toBe("Forbidden")
    expect(tag(failure(await rpc("Automations.list", {}, people.finance)))).toBe("Forbidden")
  })

  it("reads the flows through /v1 and MCP", async () => {
    const key = ok(
      await rpc("ApiKeys.create", {
        label: "Flows lezen",
        access: { kind: "role", roleId: "view" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, people.owner)
    ).secret
    const page = await get("/automations?status=active", key)
    expect(page.status).toBe(200)
    expect(page.body.data.length).toBeGreaterThan(0)
    expect(page.body.data.every((a: Json) => a.status === "active")).toBe(true)
    const one = await get(`/automations/${page.body.data[0].id}`, key)
    expect(one.status).toBe(200)
    expect(one.body.live[0].step).toBe("trigger.order_placed")
    expect((await get("/automations/auto_none", key)).status).toBe(404)

    const listed = await mcpCall(key, "list_automations", {})
    expect(listed.isError).toBe(false)
    expect(listed.value.counts.all).toBe(page.body.counts.all)
    const detail = await mcpCall(key, "get_automation", { automation_id: page.body.data[0].id })
    expect(detail.value.versions.length).toBeGreaterThan(0)
  })

  it("gives a flow no right its publisher lacks, at publishing or in Instellingen", async () => {
    // Automatiseringen · Beheren with Publiceren and Klanten · Bewerken, but Support at 0.
    const created = ok(await rpc("Roles.create", { label: "Flowbouwer", from: null }, people.owner))
    const role = created.roles.roles.find((r) => r.id === created.id)!
    ok(
      await rpc("Roles.update", {
        id: created.id,
        levels: { ...role.levels, automations: 3, customers: 2 },
        specials: { ...role.specials, "automations.publish": true },
        refundLimit: null,
        stores: "all"
      }, people.owner)
    )
    const email = `automations-${run}-builder@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: created.id, stores: "all" as const }] }, people.owner))
    await pastUndo(workspace)
    await relay(workspace)
    const builder = await join(email)

    const draft = async (name: string, action: { variantId: string; config: Record<string, unknown> }) => {
      const { automation } = ok(await rpc("Automations.create", { name }, builder))
      const id = automation!.automation.id
      const nodes = [{ id: "t", variantId: "trigger.shipping_delay", config: {} }, { id: "x", ...action }]
      ok(await rpc("Automations.saveDraft", { id, name, nodes }, builder))
      return id
    }
    const ticket = await draft("Ticket", {
      variantId: "action.create_ticket",
      config: { title: "Vertraagd", assignee: "" }
    })
    expect(failure(await rpc("Automations.publish", { id: ticket, note: "" }, builder))).toMatchObject({
      _tag: "Forbidden",
      permission: "support"
    })
    // The owner holds it, so may publish it.
    ok(await rpc("Automations.publish", { id: ticket, note: "" }, people.owner))

    const label = await draft("Label", { variantId: "action.tag_customer", config: { tag: "vertraagd" } })
    ok(await rpc("Automations.publish", { id: label, note: "" }, builder))
    expect(
      failure(await rpc("Automations.updateSettings", { id: label, scopesExtra: ["tickets.write"] }, builder))
    ).toMatchObject({ _tag: "Forbidden", permission: "support" })
    ok(await rpc("Automations.updateSettings", { id: label, scopesExtra: ["tickets.write"] }, people.owner))
  })
})
