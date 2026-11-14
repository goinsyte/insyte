import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { actionStep, planOf } from "../src/workflows/AutomationRun.ts"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Automations that act (M12 step 3, W2.1). A flow's actions run through the slices that own them, as the flow's own
 * service account: "Leverdatum herberekenen" says when the order should come and on whose word, "Leverancier
 * berichten" writes in the supplier's shared channel, "Terugbetalen" refunds within the flow's limit and is audited as
 * the account, "Leverancier toewijzen" moves a leg not yet sent. A refund over the limit fails the run with why, and no
 * money moves: flows together refund at most € 100 an order, however many steps, runs or flows ask, and never more than
 * the flow's owner, its version's publisher or the run's starter may refund themselves, nor in a store one of them
 * cannot reach, also when two flows refund one order at once. "Op een vast moment" starts a run per order that
 * reached its day, once. "E-mail versturen" mails the shopper of the run's order once, as the account, only from a
 * flow whose trigger is about an order and from a version published under the mail rules, only as its owner, publisher
 * and starter may themselves, and at most 100 runs an hour; a mail whose order was cancelled before it left is called
 * off, and one after a refund only goes when the flow made it. An agent's key never starts a run, over MCP or `/v1`.
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

const startBy = async (key: string, automationId: string, orderId: string): Promise<Response> => {
  const response = await call(`${HOST}/v1/automations/${automationId}/runs`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "idempotency-key": `act-${crypto.randomUUID()}`
    },
    body: JSON.stringify({ order_id: orderId })
  })
  if (response.status !== 429) return response
  await new Promise((resolve) => setTimeout(resolve, Number(response.headers.get("retry-after") ?? 1) * 1000))
  return startBy(key, automationId, orderId)
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
    const thirty = await roleWith("Dertig", {}, { "refunds.write": true }, 30)
    const invited = [
      { email: `act-${run}-klein@invited.test`, roleId: small },
      { email: `act-${run}-zonder@invited.test`, roleId: none },
      { email: `act-${run}-elders@invited.test`, roleId: elsewhere },
      { email: `act-${run}-dertig@invited.test`, roleId: thirty }
    ]
    ok(
      await rpc("Invitations.send", {
        rows: invited.map((i) => ({ email: i.email, roleId: i.roleId, stores: "all" as const }))
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [klein, zonder, elders, dertig] = await Promise.all(invited.map((i) => join(i.email)))
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
    let activity = ok(await rpc("Home.activity", { source: "integration" }, store.cookie))
    expect(activity.rows.filter((r) => r.action === "order.refunded")).toHaveLength(0)

    // Two flows of an owner held to € 30, each refunding € 20, started at once on one order: one refunds, the other
    // sees that refund though it waited for the order's lock, and is refused.
    const pair = await Promise.all([
      flow("Tegelijk A", dertig!, store.cookie),
      flow("Tegelijk B", dertig!, store.cookie)
    ])
    const runs = await Promise.all(pair.map(async (id) => {
      const response = await startBy(admin, id, orderId)
      expect(response.status).toBe(200)
      const runId = (await response.json() as Json).id as string
      return await until(() => rpc("Runs.get", { id: runId }, store.cookie).then(ok), (d) => d.run.finishedAt !== null)
    }))
    expect(runs.map((d) => d.run.status).toSorted()).toEqual(["failed", "succeeded"])
    expect(runs.find((d) => d.run.status === "failed")!.run.reason).toBe(
      "“Terugbetalen”: Flows betaalden op deze bestelling al € 20,00 terug; met € 20,00 erbij is het meer dan flows per bestelling mogen (€ 30,00). Doe het zelf, of vraag eerst goedkeuring."
    )
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    await relay(store.workspace)
    activity = ok(await rpc("Home.activity", { source: "integration" }, store.cookie))
    expect(activity.rows.filter((r) => r.action === "order.refunded")).toHaveLength(1)
  }, 300_000)

  it("mails the shopper of the run's order once, as the flow's account, and not one cancelled meanwhile", async () => {
    const store = await importedStore("act-mail")
    const flow = async (name: string, nodes: ReadonlyArray<Json>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      return { id, published: await rpc("Automations.publish", { id, note: "" }, store.cookie) }
    }
    // The template, tested: on an open order it says who would be mailed; on the newest, cancelled one (no delivery
    // day to fill in, no address) the mail is skipped and the test still passes. Nothing is sent either way.
    const template = ok(await rpc("Automations.create", { templateId: "tpl_eta_update" }, store.cookie))
    const testOn = (recordRef?: string) =>
      rpc("Automations.test", { id: template.automation!.automation.id, recordRef }, store.cookie).then(ok)
    // #1002's delivery day may have gone by: then the mail would not go, for want of a day still ahead.
    const open = await testOn("#1002")
    expect(open).toMatchObject({ ok: true, stoppedAt: null })
    expect(open.steps.at(-1)?.explanation).toMatch(
      /^Zou .* mailen: “Je bestelling #1002 is onderweg”\.$|expected_delivery/
    )
    const newest = await testOn()
    expect(newest).toMatchObject({ ok: true, sample: { number: "#1005" }, stoppedAt: null })
    expect(newest.steps.at(-1)).toMatchObject({ status: "skipped" })
    const subject = `Je bestelling {{order.number}} · ${run}`
    const mail = step("m", "action.send_email", {
      subject,
      body: "Hoi {{customer.first_name}},\n\nHet duurt wat langer."
    })
    // Only an order's shopper: a dispute's flow, or one to another address, does not publish.
    const disputed = await flow("Geschil → mail", [step("t", "trigger.chargeback"), mail])
    expect(failure(disputed.published)).toMatchObject({ _tag: "InvalidFlow", issues: [{ code: "mail_needs_order" }] })
    const elsewhere = await flow("Mail naar het team", [
      step("t", "trigger.shipping_delay"),
      { ...mail, config: { ...mail.config, to: "team@winkel.example" } }
    ])
    expect(failure(elsewhere.published)).toMatchObject({ _tag: "InvalidFlow", issues: [{ code: "mail_to_customer" }] })
    const mailing = await flow("Vertraagd → klant mailen", [step("t", "trigger.shipping_delay"), mail])
    ok(mailing.published)

    const orders = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows
    const numbered = (n: string) => orders.find((o) => o.number === n)!
    // #1005 was cancelled in Shopify already; #1001 is cancelled here while its mail waits out the undo window.
    const [told, cancelled, closed] = [numbered("#1002"), numbered("#1001"), numbered("#1005")]
    const key = await keyOf(store.cookie, "Mail", false)
    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const started = await Promise.all([told, cancelled, closed].map(async (o) => {
      const response = await startBy(key, mailing.id, o.id)
      expect(response.status).toBe(200)
      return (await response.json() as Json).id as string
    }))
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    const [toldRun, cancelledRun, closedRun] = await Promise.all(
      started.map((id) => until(() => rpc("Runs.get", { id }, store.cookie).then(ok), (d) => d.run.finishedAt !== null))
    )
    const said = (d: Json) => d.steps.find((x: Json) => x.nodeId === "m")
    const to = told.customerEmail!
    expect(toldRun!.run.status).toBe("succeeded")
    expect(said(toldRun).explanation).toBe(
      `Mail “Je bestelling #1002 · ${run}” aan ${to} ingepland; hij gaat over enkele seconden weg.`
    )
    expect(cancelledRun!.run.status).toBe("succeeded")
    expect(closedRun!.run.status).toBe("succeeded")
    expect(said(closedRun)).toMatchObject({
      status: "skipped",
      explanation: "De bestelling is geannuleerd; de klant is niet gemaild."
    })

    // Cancelled before its window passed: the flow's mail is called off, as nobody looked at it; the other goes once.
    ok(await rpc("Orders.cancel", { ids: [cancelled.id], restock: true, notify: false }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const captured = async (address: string) =>
      ((await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(address)}`)).json()) as {
        mails: Array<{ kind: string; subject: string | null; bodyText: string | null }>
      }).mails.filter((m) => m.subject?.startsWith("Je bestelling ") === true && m.subject.endsWith(` · ${run}`))
    const sent = await captured(to)
    expect(sent).toMatchObject([{ kind: "order.message", subject: `Je bestelling #1002 · ${run}` }])
    expect((await captured(cancelled.customerEmail!)).filter((m) => m.subject?.includes("#1001"))).toEqual([])
    const activity = ok(await rpc("Home.activity", { source: "integration" }, store.cookie))
    expect(activity.rows.filter((r) => r.action === "order.customer_mail_scheduled")).toMatchObject([
      { actorKind: "service_account", actorName: "Workflow: Vertraagd → klant mailen" },
      { actorKind: "service_account" }
    ])
  }, 240_000)

  it(
    "mails only as the people behind the flow may, from a checked version, once, at most 100 runs an hour",
    async () => {
      const store = await importedStore("act-mail-rights")
      const me = ok(await sessionMe(store.cookie)).principals[0]!.id
      const roleWith = async (label: string, levels: Record<string, 0 | 1 | 2 | 3>, stores: "all" | Array<string>) => {
        const created = ok(await rpc("Roles.create", { label: `${label} ${run}`, from: "admin" }, store.cookie))
        const role = created.roles.roles.find((r) => r.id === created.id)!
        const update = (more: Record<string, 0 | 1 | 2 | 3>) =>
          rpc("Roles.update", {
            id: created.id,
            levels: { ...role.levels, ...more },
            specials: role.specials,
            refundLimit: null,
            stores
          }, store.cookie).then(ok)
        await update(levels)
        return { id: created.id, update }
      }
      // Klantenservice · Bekijken only; every right in another store; the right now, taken away later.
      const noMail = await roleWith("Geen mail", { support: 1 }, "all")
      const elsewhere = await roleWith("Elders", {}, ["sto_elsewhere"])
      const publishing = await roleWith("Publiceert", {}, "all")
      const starting = await roleWith("Start", {}, "all")
      const invited = [
        { email: `act-${run}-geen-mail@invited.test`, roleId: noMail.id },
        { email: `act-${run}-elders-mail@invited.test`, roleId: elsewhere.id },
        { email: `act-${run}-publiceert@invited.test`, roleId: publishing.id }
      ]
      ok(
        await rpc("Invitations.send", {
          rows: invited.map((i) => ({ email: i.email, roleId: i.roleId, stores: "all" as const }))
        }, store.cookie)
      )
      await pastUndo(store.workspace)
      await relay(store.workspace)
      const [zonder, elders, publisher] = await Promise.all(invited.map((i) => join(i.email)))
      const mailTo = (tag: string) =>
        step("m", "action.send_email", {
          subject: `${tag} {{order.number}} · ${run}`,
          body: "Hoi {{customer.first_name}}."
        })
      const delayed = step("t", "trigger.shipping_delay")
      /** A flow `owner` makes and `by` saves and publishes. */
      const flow = async (name: string, owner: string, by: string, nodes: ReadonlyArray<Json>) => {
        const { automation } = ok(await rpc("Automations.create", { name }, owner))
        const id = automation!.automation.id
        ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, by))
        ok(await rpc("Automations.publish", { id, note: "" }, by))
        return id
      }
      const ownerWithout = await flow("Eigenaar zonder mailrecht", zonder!, store.cookie, [delayed, mailTo("Zonder")])
      const ownerElsewhere = await flow("Eigenaar elders", elders!, store.cookie, [delayed, mailTo("Elders")])
      const published = await flow("Gepubliceerd en teruggezet", store.cookie, publisher!, [
        delayed,
        mailTo("Teruggezet")
      ])
      const approved = await flow("Na goedkeuring mailen", store.cookie, store.cookie, [
        delayed,
        step("a", "action.require_approval", { approver: me }),
        mailTo("Goedgekeurd")
      ])
      const older = await flow("Van vóór de mailregels", store.cookie, store.cookie, [delayed, mailTo("Ouder")])
      const unread = await flow("Zonder Bestellingen lezen", store.cookie, store.cookie, [
        delayed,
        step("e", "action.check_eta"),
        mailTo("Ongelezen")
      ])
      const capped = await flow("Honderd per uur", store.cookie, store.cookie, [
        delayed,
        step("f", "condition.filter", { expression: "{{order.total}} > 99999999" }),
        mailTo("Nooit")
      ])
      const orders = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows
      const order = orders.find((o) => o.number === "#1002")!
      const admin = await keyOf(store.cookie, "Mailrechten", false)
      const starterKey = ok(
        await rpc("ApiKeys.create", {
          label: `Start ${run}`,
          access: { kind: "role", roleId: starting.id } as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent: false
        }, store.cookie)
      ).secret

      await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
      const runGet = (id: string) => rpc("Runs.get", { id }, store.cookie).then(ok)
      const finished = (id: string) => until(() => runGet(id), (d) => d.run.finishedAt !== null)
      const started = async (token: string, id: string) => {
        const response = await startBy(token, id, order.id)
        expect(response.status).toBe(200)
        return (await response.json() as Json).id as string
      }
      const reasonOf = async (token: string, id: string) => {
        const detail = await finished(await started(token, id))
        expect(detail.run.status).toBe("failed")
        return detail.run.reason as string
      }
      const mailOf = (d: Json) => d.steps.find((x: Json) => x.nodeId === "m")

      // The owner and the publisher, as they are now, must each be able to mail this shopper themselves.
      expect(await reasonOf(admin, ownerWithout)).toBe(
        "“E-mail versturen”: De eigenaar van de flow mag zelf geen klanten mailen, dus de flow ook niet; er is niets verstuurd."
      )
      expect(await reasonOf(admin, ownerElsewhere)).toBe(
        "“E-mail versturen”: De eigenaar van de flow kan niet bij de winkel van deze bestelling; er is niets verstuurd."
      )
      await publishing.update({ support: 1 })
      expect(await reasonOf(admin, published)).toBe(
        "“E-mail versturen”: Wie deze versie publiceerde, mag zelf geen klanten mailen, dus de flow ook niet; er is niets verstuurd."
      )

      // Bestellingen lezen switched off: "Leverdatum herberekenen" no longer reads the order ("Klanten mailen" does not
      // grant it), and the mail after it is not reached.
      ok(await rpc("Automations.updateSettings", { id: unread, scopesOff: ["orders.read"] }, store.cookie))
      expect(await reasonOf(admin, unread)).toBe(
        "“Leverdatum herberekenen”: De flow mist het recht “Bestellingen lezen”. Zet het aan bij Instellingen."
      )

      // A key's role taken down while its run waits for approval: the mail is not sent when the run goes on.
      const waiting = await started(starterKey, approved)
      await until(() => runGet(waiting), (d) => d.run.status === "waiting")
      await starting.update({ support: 1 })
      ok(await rpc("Runs.approve", { id: waiting, stepId: "a" }, store.cookie))
      expect((await finished(waiting)).run).toMatchObject({
        status: "failed",
        reason: "“E-mail versturen”: Wie deze run startte, mag zelf (nu) geen klanten mailen; er is niets verstuurd."
      })

      // A second attempt of the step finds the first's mail and sends nothing more.
      const again = await started(admin, approved)
      await until(() => runGet(again), (d) => d.run.status === "waiting")
      const plan = JSON.parse(await planOf(store.workspace, again))
      const mailNode = plan.nodes.find((n: Json) => n.id === "m")
      const attempts = []
      for (const attempt of [1, 2]) attempts.push(await actionStep(store.workspace, plan, mailNode, attempt))
      expect(attempts.map((a) => (a as Json).value?.output?.mailId)).toEqual([
        expect.stringMatching(/^oml_/),
        (attempts[0] as Json).value?.output?.mailId
      ])
      ok(await rpc("Runs.cancel", { id: again }, store.cookie))

      // Started again by a member once the owner may mail: it mails; started again after that, it does not mail twice.
      await noMail.update({ support: 2 })
      const first = ok(await rpc("Runs.list", { automationId: ownerWithout }, store.cookie)).rows[0]!
      const rerun = ok(await rpc("Runs.rerun", { id: first.id }, store.cookie)).run
      const mailed = await finished(rerun.id)
      expect(mailed.run.status).toBe("succeeded")
      expect(mailOf(mailed).explanation).toBe(
        `Mail “Zonder #1002 · ${run}” aan ${order.customerEmail} ingepland; hij gaat over enkele seconden weg.`
      )
      const twice = await finished(ok(await rpc("Runs.rerun", { id: first.id }, store.cookie)).run.id)
      expect(twice.run.status).toBe("succeeded")
      expect(mailOf(twice).explanation).toContain("Al gedaan")

      // A version published before the mail rules skips its mail, tells the owner once, and mails once published again.
      const marked = await call(
        `http://api.test/api/__dev/automations/unchecked?workspace=${store.workspace}&automation=${older}`,
        { method: "POST" }
      )
      expect(((await marked.json()) as { version: number }).version).toBe(2)
      for (let i = 0; i < 2; i++) {
        const skipped = await finished(await started(admin, older))
        expect(skipped.run.status).toBe("succeeded")
        expect(mailOf(skipped)).toMatchObject({
          status: "skipped",
          explanation:
            "Deze versie is gepubliceerd voordat Insyte e-mails uit flows controleerde; de klant is niet gemaild. Publiceer de flow opnieuw."
        })
      }
      await relay(store.workspace)
      const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
      expect(notes.filter((n) => JSON.stringify(n).includes("gepubliceerd voordat Insyte e-mails"))).toHaveLength(1)
      ok(await rpc("Automations.publish", { id: older, note: "Opnieuw" }, store.cookie))
      const republished = await finished(await started(admin, older))
      expect(mailOf(republished)).toMatchObject({
        status: "ok",
        explanation: expect.stringMatching(/^Mail “Ouder #1002/)
      })

      // Every Workflow done; the one stopped in Runs ends terminated.
      for (const instance of await workflows.get()) await instance.waitForStatus("complete").catch(() => undefined)
      await pastUndo(store.workspace)
      await relay(store.workspace)
      const captured = ((await (await call(
        `http://api.test/api/__dev/mail?to=${encodeURIComponent(order.customerEmail!)}`
      )).json()) as { mails: Array<{ subject: string | null }> }).mails
        .map((m) => m.subject ?? "")
        // The recorded shop's shoppers are every test's: this test's mails by their words.
        .filter((subject) =>
          /^(Zonder|Elders|Teruggezet|Goedgekeurd|Ouder|Ongelezen|Nooit) /.test(subject) &&
          subject.endsWith(` · ${run}`)
        )
        .toSorted()
      expect(captured).toEqual([`Goedgekeurd #1002 · ${run}`, `Ouder #1002 · ${run}`, `Zonder #1002 · ${run}`])

      // A flow that mails runs at most 100 times an hour, whatever its setting: the 101st start is skipped with why.
      for (let i = 0; i < 100; i++) expect((await startBy(admin, capped, order.id)).status).toBe(200)
      const over = await (await startBy(admin, capped, order.id)).json() as Json
      expect(over).toMatchObject({ status: "skipped", reason: "De limiet van 100 runs per uur is bereikt." })
    },
    420_000
  )

  it("mails after the flow's own refund, and not after a refund it did not make", async () => {
    const store = await importedStore("act-mail-refund")
    const me = ok(await sessionMe(store.cookie)).principals[0]!.id
    const flow = async (name: string, nodes: ReadonlyArray<Json>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
      return id
    }
    const mailTo = (tag: string) =>
      step("m", "action.send_email", {
        subject: `${tag} {{order.number}} · ${run}`,
        body: "Hoi {{customer.first_name}}."
      })
    const delayed = step("t", "trigger.shipping_delay")
    // Refund, wait for a yes (Shopify takes the refund meanwhile), then mail: "terugbetalen en dan mailen".
    const refundsThenMails = await flow("Terugbetalen en mailen", [
      delayed,
      step("r", "action.refund", { amount: "volledig", reason: "" }),
      step("a", "action.require_approval", { approver: me }),
      mailTo("Terugbetaald")
    ])
    const mailsOnly = await flow("Alleen mailen", [delayed, mailTo("Andermans")])
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1001")!
    const key = await keyOf(store.cookie, "Terugbetalen", false)
    await using writes = await introspectWorkflow(env.SHOPIFY_WRITE)
    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const runGet = (id: string) => rpc("Runs.get", { id }, store.cookie).then(ok)
    const startedOn = async (id: string) => {
      const response = await startBy(key, id, order.id)
      expect(response.status).toBe(200)
      return (await response.json() as Json).id as string
    }
    const mailOf = (d: Json) => d.steps.find((x: Json) => x.nodeId === "m")

    const waiting = await startedOn(refundsThenMails)
    await until(() => runGet(waiting), (d) => d.run.status === "waiting")
    await relay(store.workspace)
    for (const instance of await writes.get()) await instance.waitForStatus("complete")
    expect(ok(await rpc("Orders.get", { id: order.id }, store.cookie)).order.status).toBe("refunded")
    ok(await rpc("Runs.approve", { id: waiting, stepId: "a" }, store.cookie))
    const done = await until(() => runGet(waiting), (d) => d.run.finishedAt !== null)
    expect(done.run.status).toBe("succeeded")
    expect(mailOf(done).explanation).toMatch(/^Mail “Terugbetaald #1001 · .*” aan .* ingepland/)

    // Another flow on the order refunded by the first: its mail is skipped.
    const other = await startedOn(mailsOnly)
    const skipped = await until(() => runGet(other), (d) => d.run.finishedAt !== null)
    expect(mailOf(skipped)).toMatchObject({
      status: "skipped",
      explanation: "De bestelling is terugbetaald; de klant is niet gemaild."
    })

    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const captured = ((await (await call(
      `http://api.test/api/__dev/mail?to=${encodeURIComponent(order.customerEmail!)}`
    )).json()) as { mails: Array<{ subject: string | null }> }).mails
      .map((m) => m.subject ?? "")
      .filter((subject) => /^(Terugbetaald|Andermans) /.test(subject) && subject.endsWith(` · ${run}`))
    expect(captured).toEqual([`Terugbetaald #1001 · ${run}`])
  }, 240_000)

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
