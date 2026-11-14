import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Automations that act (M12 step 3, W2.1). A flow's actions run through the slices that own them, as the flow's own
 * service account: "Leverdatum herberekenen" says when the order should come and on whose word, "Leverancier
 * berichten" writes in the supplier's shared channel, "Terugbetalen" refunds within the flow's limit and is audited as
 * the account, "Leverancier toewijzen" moves a leg not yet sent. A refund over the limit fails the run with why, and no
 * money moves: flows together refund at most € 100 an order, however many steps, runs or flows ask, and never more than
 * the flow's owner, its version's publisher or the run's starter may refund themselves, nor in a store one of them
 * cannot reach. "Op een vast moment" starts a run per order that reached its day, once. An agent's key never starts a
 * run, over MCP or `/v1`.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const step = (id: string, variantId: string, config: Record<string, unknown> = {}) => ({
  id,
  variantId,
  config: { ...STEPS_BY_ID[variantId]?.defaultConfig, ...config }
})

/** Asks again until `check` holds, as a run moves on in its own Workflow. */
const until = async <A>(read: () => Promise<A>, check: (a: A) => boolean): Promise<A> => {
  for (let i = 0; i < 200; i++) {
    const value = await read()
    if (check(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the run did not get there")
}

const keyOf = async (cookie: string, label: string, agent: boolean) =>
  ok(
    await rpc("ApiKeys.create", {
      label: `${label} ${run}`,
      access: { kind: "role", roleId: "admin" } as never,
      stores: "all",
      expiresInDays: 30,
      ips: [],
      agent
    }, cookie)
  ).secret

const startBy = (key: string, automationId: string, orderId: string) =>
  call(`${HOST}/v1/automations/${automationId}/runs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "idempotency-key": `act-${crypto.randomUUID()}`
    },
    body: JSON.stringify({ order_id: orderId })
  })

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

describe("automations that act", () => {
  it("messages the supplier, refunds within the flow's limit and moves the order, as the flow's account", async () => {
    const store = await importedStore("act")
    const flow = async (name: string, nodes: ReadonlyArray<Json>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
      return id
    }
    const suppliers = ok(await rpc("Suppliers.list", {}, store.cookie)).rows
    const atelier = suppliers.find((s) => s.name === "Atelier Noord")!
    const channel = ok(await rpc("Chats.openSupplierChannel", { supplierId: atelier.id }, store.cookie))
    ok(
      await rpc("Suppliers.create", {
        name: "Tassen & Co",
        contactEmail: `tassen-act-${run}@supplier.example`,
        contactPhone: "",
        description: ""
      }, store.cookie)
    )
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!

    const acts = await flow("Vertraagd → leverancier en excuses", [
      step("t", "trigger.shipping_delay"),
      step("e", "action.check_eta"),
      step("s", "action.notify_supplier", { supplier: "Atelier Noord", message: "Wanneer gaat {{order.number}} weg?" }),
      step("r", "action.refund", { amount: "5,00", reason: "Excuses voor de vertraging" }),
      step("a", "action.assign_supplier", { supplier: "Tassen & Co" })
    ])
    const greedy = await flow("Te veel terug", [
      step("t", "trigger.shipping_delay"),
      step("r", "action.refund", { amount: "150,00", reason: "" })
    ])

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const key = await keyOf(store.cookie, "Act", false)
    const started = await Promise.all([acts, greedy].map(async (id) => {
      const response = await startBy(key, id, leg.orderId)
      expect(response.status).toBe(200)
      return (await response.json() as Json).id as string
    }))
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    await relay(store.workspace)
    const [done, refused] = await Promise.all(
      started.map((id) => until(() => rpc("Runs.get", { id }, store.cookie).then(ok), (d) => d.run.finishedAt !== null))
    )

    expect(done!.run.status).toBe("succeeded")
    const said = (d: Json, nodeId: string) => d.steps.find((s: Json) => s.nodeId === nodeId)
    expect(said(done, "e")).toMatchObject({ status: "ok" })
    expect(said(done, "e").explanation).toMatch(/^(Verwacht op|Bezorgd op)/)
    expect(said(done, "s").explanation).toBe("Bericht gestuurd aan Atelier Noord.")
    expect(said(done, "r").explanation).toBe("€ 5,00 terugbetaald; Shopify verwerkt het.")
    expect(said(done, "a").explanation).toBe("Doorsturen gaat nu naar Tassen & Co.")

    // Over the flow's limit: the run fails with why, and nothing was refunded for it.
    expect(refused!.run.status).toBe("failed")
    expect(refused!.run.reason).toBe(
      "“Terugbetalen”: € 150,00 is meer dan de flow per bestelling mag terugbetalen (€ 100,00). Doe het zelf, of vraag eerst goedkeuring."
    )

    // The supplier reads it in the shared channel; the leg is with the other supplier; the refund is the account's.
    const page = ok(await rpc("Chats.messages", { conversationId: channel.id }, store.cookie))
    expect(page.messages.map((m) => m.body).join("\n")).toContain(`Wanneer gaat ${leg.orderNumber} weg?`)
    const moved = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows.find((l) =>
      l.id === leg.id
    )
    expect(moved).toMatchObject({ supplier: { name: "Tassen & Co" }, fromSupplier: { name: "Atelier Noord" } })
    const activity = ok(await rpc("Home.activity", { source: "integration" }, store.cookie))
    expect(activity.rows.find((r) => r.action === "order.refunded")).toMatchObject({
      actorKind: "service_account",
      actorName: "Workflow: Vertraagd → leverancier en excuses"
    })
    expect(activity.rows.filter((r) => r.action === "order.refunded")).toHaveLength(1)
  }, 240_000)

  it("holds the flows' refunds on one order to € 100 together, over steps, runs and flows", async () => {
    const store = await importedStore("act-cap")
    const flow = async (name: string, nodes: ReadonlyArray<Json>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      return { id, published: await rpc("Automations.publish", { id, note: "" }, store.cookie) }
    }
    // Two refunds in one flow do not publish.
    const twice = await flow("Twee keer terug", [
      step("t", "trigger.shipping_delay"),
      step("r1", "action.refund", { amount: "10,00", reason: "" }),
      step("r2", "action.refund", { amount: "10,00", reason: "" })
    ])
    expect(failure(twice.published)).toMatchObject({ _tag: "InvalidFlow", issues: [{ code: "one_refund" }] })
    const refunding = (amount: string) => [
      step("t", "trigger.shipping_delay"),
      step("r", "action.refund", { amount, reason: "" })
    ]
    const first = (await flow("Excuses A", refunding("20,00"))).id
    const second = (await flow("Excuses B", refunding("85,00"))).id
    const orderId = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!.orderId
    const key = await keyOf(store.cookie, "Cap", false)

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const runOn = async (id: string) => {
      const response = await startBy(key, id, orderId)
      expect(response.status).toBe(200)
      const runId = (await response.json() as Json).id as string
      return await until(() => rpc("Runs.get", { id: runId }, store.cookie).then(ok), (d) => d.run.finishedAt !== null)
    }
    // One after the other: one flow refunds € 20 in each of two runs; another flow's € 85 would then pass € 100.
    for (let i = 0; i < 2; i++) expect((await runOn(first)).run.status).toBe("succeeded")
    const other = await runOn(second)
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    expect(other.run).toMatchObject({
      status: "failed",
      reason:
        "“Terugbetalen”: Flows betaalden op deze bestelling al € 40,00 terug; met € 85,00 erbij is het meer dan flows per bestelling mogen (€ 100,00). Doe het zelf, of vraag eerst goedkeuring."
    })
    await relay(store.workspace)
    const activity = ok(await rpc("Home.activity", { source: "integration" }, store.cookie))
    expect(activity.rows.filter((r) => r.action === "order.refunded")).toHaveLength(2)
  }, 240_000)

  it("refunds no more than the flow's owner, its publisher or its starter may, and only in their stores", async () => {
    const store = await importedStore("act-rights")
    const roleWith = async (
      label: string,
      levels: Record<string, 0 | 1 | 2 | 3>,
      specials: Record<string, boolean>,
      refundLimit: number | null,
      stores: "all" | Array<string> = "all"
    ) => {
      const created = ok(await rpc("Roles.create", { label: `${label} ${run}`, from: "admin" }, store.cookie))
      const role = created.roles.roles.find((r) => r.id === created.id)!
      ok(
        await rpc("Roles.update", {
          id: created.id,
          levels: { ...role.levels, ...levels },
          specials: { ...role.specials, ...specials },
          refundLimit,
          stores
        }, store.cookie)
      )
      return created.id
    }
    // € 5 at most; no Terugbetalen at all; every right, in another store only.
    const small = await roleWith("Klein", {}, { "refunds.write": true }, 5)
    const none = await roleWith("Zonder", {}, { "refunds.write": false }, null)
    const elsewhere = await roleWith("Elders", {}, {}, null, ["sto_elsewhere"])
    const invited = [
      { email: `act-${run}-klein@invited.test`, roleId: small },
      { email: `act-${run}-zonder@invited.test`, roleId: none },
      { email: `act-${run}-elders@invited.test`, roleId: elsewhere }
    ]
    ok(
      await rpc("Invitations.send", {
        rows: invited.map((i) => ({ email: i.email, roleId: i.roleId, stores: "all" as const }))
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [klein, zonder, elders] = await Promise.all(invited.map((i) => join(i.email)))
    const nodes = [step("t", "trigger.shipping_delay"), step("r", "action.refund", { amount: "20,00", reason: "" })]
    /** A flow `owner` makes and `publisher` publishes. */
    const flow = async (name: string, owner: string, publisher: string) => {
      const { automation } = ok(await rpc("Automations.create", { name }, owner))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, publisher))
      ok(await rpc("Automations.publish", { id, note: "" }, publisher))
      return id
    }
    const byPublisher = await flow("Klein gepubliceerd", store.cookie, klein!)
    const byOwner = await flow("Eigenaar zonder recht", zonder!, store.cookie)
    const byElsewhere = await flow("Eigenaar elders", elders!, store.cookie)
    const plain = await flow("Gewoon", store.cookie, store.cookie)
    const orderId = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!.orderId
    const admin = await keyOf(store.cookie, "Rights", false)
    const smallKey = ok(
      await rpc("ApiKeys.create", {
        label: `Klein ${run}`,
        access: { kind: "role", roleId: small } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const reasonOf = async (token: string, id: string) => {
      const response = await startBy(token, id, orderId)
      expect(response.status).toBe(200)
      const runId = (await response.json() as Json).id as string
      const detail = await until(
        () => rpc("Runs.get", { id: runId }, store.cookie).then(ok),
        (d) => d.run.finishedAt !== null
      )
      expect(detail.run.status).toBe("failed")
      return detail.run.reason as string
    }
    const limited =
      "“Terugbetalen”: € 20,00 is meer dan de flow per bestelling mag terugbetalen (€ 5,00). Doe het zelf, of vraag eerst goedkeuring."
    expect(await reasonOf(admin, byPublisher)).toBe(limited)
    expect(await reasonOf(admin, byOwner)).toBe(
      "“Terugbetalen”: De eigenaar van de flow mag zelf niet terugbetalen, dus de flow ook niet. Geef de flow een eigenaar met het recht Terugbetalen."
    )
    expect(await reasonOf(admin, byElsewhere)).toBe(
      "“Terugbetalen”: De eigenaar van de flow kan niet bij de winkel van deze bestelling, dus de flow betaalt hier niet terug."
    )
    // Started by hand with a key held to € 5: the run refunds no more than that.
    expect(await reasonOf(smallKey, plain)).toBe(limited)
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    const activity = ok(await rpc("Home.activity", { source: "integration" }, store.cookie))
    expect(activity.rows.filter((r) => r.action === "order.refunded")).toHaveLength(0)
  }, 300_000)

  it("starts a scheduled flow once per order that reached its day", async () => {
    const store = await importedStore("act-schedule")
    const { automation } = ok(await rpc("Automations.create", { name: "Dag N onderweg" }, store.cookie))
    const id = automation!.automation.id
    // #1001 was placed on 1 October: the flow picks it the day it has been on its way this many days.
    const placed = Date.parse("2026-10-01T10:00:00Z")
    const days = Math.ceil((Date.now() - placed) / 86_400_000) + 1
    let at = placed + days * 86_400_000
    const hour = (t: number) =>
      Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "numeric", hourCycle: "h23" })
        .format(t))
    while (hour(at) !== 9) at += 3_600_000
    const nodes = [
      step("t", "trigger.schedule", { every: "day", hour: 9, records: "orders_open", days }),
      step("e", "action.check_eta")
    ]
    ok(await rpc("Automations.saveDraft", { id, name: "Dag N onderweg", nodes: nodes as Json }, store.cookie))
    ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const tick = async (when: number) =>
      await (await call(
        `http://api.test/api/__dev/automations/schedule?workspace=${store.workspace}&at=${
          new Date(when).toISOString()
        }`,
        { method: "POST", headers: { cookie: store.cookie } }
      )).json() as { runs: Array<string> }
    // Not its hour: nothing; its hour: a run; the same moment again: nothing more.
    expect((await tick(at - 3_600_000)).runs).toEqual([])
    const first = await tick(at)
    expect(first.runs.length).toBeGreaterThan(0)
    expect((await tick(at)).runs).toEqual([])
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    const detail = await until(
      () => rpc("Runs.get", { id: first.runs[0]! }, store.cookie).then(ok),
      (d) => d.run.finishedAt !== null
    )
    expect(detail.run).toMatchObject({ status: "succeeded", triggerVariant: "trigger.schedule" })
    expect(detail.steps.find((s: Json) => s.nodeId === "e")?.explanation).toMatch(/^(Verwacht op|Bezorgd op)/)
  }, 180_000)

  it("never lets an agent's key start a run", async () => {
    const store = await importedStore("act-agent")
    const { automation } = ok(await rpc("Automations.create", { name: "Ticket bij vertraging" }, store.cookie))
    const id = automation!.automation.id
    const nodes = [step("t", "trigger.shipping_delay"), step("k", "action.create_ticket", { assignee: "" })]
    ok(await rpc("Automations.saveDraft", { id, name: "Ticket bij vertraging", nodes: nodes as Json }, store.cookie))
    ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
    const orderId = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!.orderId
    const agent = await keyOf(store.cookie, "Agent", true)

    const viaMcp = await mcpCall(agent, "trigger_automation", { automation_id: id, order_id: orderId })
    expect(viaMcp).toMatchObject({ isError: true, value: { error: { code: "ActionNotAllowedV1" } } })
    const viaV1 = await startBy(agent, id, orderId)
    expect(viaV1.status).toBe(403)
    expect(ok(await rpc("Runs.list", { automationId: id }, store.cookie)).counts.all).toBe(0)
  }, 120_000)
})
