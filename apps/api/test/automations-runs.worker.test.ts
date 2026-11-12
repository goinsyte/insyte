import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { actionStep, planOf } from "../src/workflows/AutomationRun.ts"
import { failure, join, ok, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * A flow's runs (steps 14.4 and 14.5, M12 steps 4 and 5). The tracking sweep delays #1003 and every active flow on
 * "Verzending vertraagd" runs for it, once. "Goedkeuring vragen" waits: approved, the run goes on, on the version it
 * started on even though a new one was published meanwhile; unanswered within its time, it stops. A run can be stopped
 * while it waits. A failed run goes again with "Opnieuw" under the same key: what the first run did is not done twice.
 * A right switched off fails the step that needs it, for each action that runs through a slice (the service account's
 * row of the authorisation matrix). Runs read the same through `/v1` and MCP, and a key starts one by hand. "Test met
 * voorbeeld" walks the draft against an order and writes nothing.
 *
 * After the review: a run acts as the flow is when it wakes (paused, removed or narrowed meanwhile, it does nothing
 * more); the approver is a teammate's id, not a name; a retried action does not act twice; a run by hand keeps the
 * hour's limit and asks the caller to hold the flow's rights; and automations rights alone show no customer.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const sweep = (workspace: string) =>
  call(`http://api.test/api/__dev/tracking/sweep?workspace=${workspace}`, { method: "POST" })

const step = (id: string, variantId: string, config: Record<string, unknown> = {}) => ({
  id,
  variantId,
  config: { ...STEPS_BY_ID[variantId]?.defaultConfig, ...config }
})

const TRIGGER = step("t", "trigger.shipping_delay")

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

/** Starts a run by hand over `/v1`, as a key. */
const startBy = (key: string, automationId: string, orderId: string) =>
  call(`${HOST}/v1/automations/${automationId}/runs`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ order_id: orderId })
  })

/** Asks again until `check` holds, as a run moves on in its own Workflow. */
const until = async <A>(read: () => Promise<A>, check: (a: A) => boolean): Promise<A> => {
  for (let i = 0; i < 150; i++) {
    const value = await read()
    if (check(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error("the run did not get there")
}

describe("a flow's runs", () => {
  it("waits for approval, stops, goes again under its key, and reads the same everywhere", async () => {
    const store = await importedStore("runs")
    const me = ok(await sessionMe(store.cookie)).principals[0]!.id
    const flow = async (name: string, nodes: ReadonlyArray<Json>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
      return id
    }

    const approved = await flow("Na goedkeuring een ticket", [
      TRIGGER,
      step("a", "action.require_approval", { approver: me }),
      step("k", "action.create_ticket", { title: "Versie 1: {{order.number}}", assignee: "" })
    ])
    const lapsed = await flow("Goedkeuring verloopt", [
      TRIGGER,
      step("b", "action.require_approval", { approver: me }),
      step("k", "action.create_ticket", { title: "Nooit gemaakt", assignee: "" })
    ])
    const stopped = await flow("Wordt gestopt", [
      TRIGGER,
      step("c", "action.require_approval", { approver: me }),
      step("k", "action.create_ticket", { title: "Ook nooit", assignee: "" })
    ])
    const again = await flow("Opnieuw zonder dubbel werk", [
      TRIGGER,
      step("l", "action.tag_customer", { tag: "vertraagd-opnieuw" }),
      step("k", "action.create_ticket", { title: "Tweede poging: {{order.number}}", assignee: "" })
    ])
    ok(await rpc("Automations.updateSettings", { id: again, scopesOff: ["tickets.write"] }, store.cookie))
    // The service account's row of the matrix: each action through a slice, without the right it needs.
    const noTag = await flow("Label zonder recht", [TRIGGER, step("l", "action.tag_customer", { tag: "nee" })])
    ok(await rpc("Automations.updateSettings", { id: noTag, scopesOff: ["customers.write"] }, store.cookie))
    const noAlert = await flow("Waarschuwen zonder recht", [TRIGGER, step("w", "action.alert_team")])
    ok(await rpc("Automations.updateSettings", { id: noAlert, scopesOff: ["team.notify"] }, store.cookie))

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    await workflows.modifyAll(async (m) => {
      await m.disableSleeps()
      await m.forceEventTimeout({ name: "b:answer" })
    })
    expect((await sweep(store.workspace)).status).toBe(200)
    await relay(store.workspace)

    const runOf = async (automationId: string) => ok(await rpc("Runs.list", { automationId }, store.cookie)).rows[0]!
    const waiting = await until(() => runOf(approved), (r) => r.status === "waiting")
    expect(waiting).toMatchObject({
      version: 1,
      record: { kind: "order", number: "#1003" },
      manual: false,
      waiting: "approval"
    })

    // A new version while it waits: the run keeps the one it started on.
    ok(
      await rpc("Automations.saveDraft", {
        id: approved,
        name: "Na goedkeuring een ticket",
        nodes: [
          TRIGGER,
          step("a", "action.require_approval", { approver: me }),
          step("k", "action.create_ticket", { title: "Versie 2: {{order.number}}", assignee: "" })
        ] as Json
      }, store.cookie)
    )
    ok(await rpc("Automations.publish", { id: approved, note: "Andere titel" }, store.cookie))

    const detail = ok(await rpc("Runs.get", { id: waiting.id }, store.cookie))
    expect(detail.waitingOn).toMatchObject({ nodeId: "a", kind: "approval" })
    expect(detail.steps.map((s) => [s.nodeId, s.status])).toEqual([["t", "ok"], ["a", "waiting"], ["k", "pending"]])
    expect(detail.input).toMatchObject({ Bestelling: "#1003" })
    expect(failure(await rpc("Runs.approve", { id: waiting.id, stepId: "k" }, store.cookie))).toMatchObject({
      _tag: "Conflict",
      reason: "not_waiting"
    })
    ok(await rpc("Runs.approve", { id: waiting.id, stepId: "a" }, store.cookie))
    const done = await until(() => runOf(approved), (r) => r.status === "succeeded")
    expect(done.version).toBe(1)
    const titles = ok(await rpc("Tickets.list", { view: "all" }, store.cookie)).rows.map((t) => t.title)
    expect(titles).toContain("Versie 1: #1003")
    expect(titles).not.toContain("Versie 2: #1003")

    // Nobody answered within its time: it stops, and makes nothing.
    expect(await until(() => runOf(lapsed), (r) => r.status === "stopped")).toMatchObject({
      reason: "Geen goedkeuring binnen zeven dagen."
    })
    expect(titles).not.toContain("Nooit gemaakt")

    // Stopped while it waits: the Workflow ends, the run says so.
    const toStop = await until(() => runOf(stopped), (r) => r.status === "waiting")
    const cancelled = ok(await rpc("Runs.cancel", { id: toStop.id }, store.cookie))
    expect(cancelled.run).toMatchObject({ status: "stopped", reason: "Gestopt in het tabblad Runs." })
    expect(failure(await rpc("Runs.cancel", { id: toStop.id }, store.cookie))).toMatchObject({ _tag: "Conflict" })
    expect((ok(await rpc("Runs.get", { id: toStop.id }, store.cookie))).steps.find((s) => s.nodeId === "c")?.status)
      .toBe("stopped")

    // The right switched off fails the step, for each action through a slice.
    for (const id of [again, noTag, noAlert]) {
      const failed = await until(() => runOf(id), (r) => r.status === "failed")
      expect(failed.reason).toContain("De flow mist het recht")
    }

    // "Opnieuw" with the right back on: the label is not put on twice, the ticket is made now.
    const first = await runOf(again)
    ok(await rpc("Automations.updateSettings", { id: again, scopesOff: [] }, store.cookie))
    const rerun = ok(await rpc("Runs.rerun", { id: first.id }, store.cookie)).run
    expect(rerun).toMatchObject({ key: first.id, manual: true, cause: "Opnieuw gestart" })
    await until(() => rpc("Runs.get", { id: rerun.id }, store.cookie).then(ok), (d) => d.run.status === "succeeded")
    const second = ok(await rpc("Runs.get", { id: rerun.id }, store.cookie))
    expect(second.steps.find((s) => s.nodeId === "l")?.explanation).toContain("Al gedaan")
    expect(ok(await rpc("Tickets.list", { view: "all" }, store.cookie)).rows.map((t) => t.title)).toContain(
      "Tweede poging: #1003"
    )

    // The figures and the records it ran for.
    const stats = ok(await rpc("Runs.stats", { automationId: again, days: 7 }, store.cookie))
    expect(stats.days).toHaveLength(7)
    expect(stats.totals).toMatchObject({ all: 2, failed: 1, succeeded: 1 })
    expect(ok(await rpc("Runs.records", { automationId: again }, store.cookie))).toMatchObject([
      { record: { number: "#1003" }, runs: 2, lastStatus: "succeeded" }
    ])
    const all = ok(await rpc("Runs.list", {}, store.cookie))
    expect(all.counts.all).toBe(all.rows.length)

    // "Test met voorbeeld": the draft against an order, nothing written.
    const before = ok(await rpc("Tickets.list", { view: "all" }, store.cookie)).rows.length
    const runsBefore = all.counts.all
    const { automation: draft } = ok(await rpc("Automations.create", { name: "Proef" }, store.cookie))
    ok(
      await rpc("Automations.saveDraft", {
        id: draft!.automation.id,
        name: "Proef",
        nodes: [
          TRIGGER,
          {
            ...step("s", "condition.branch", { expression: "{{order.total}} > 100000" }),
            branches: {
              yes: [step("y", "action.tag_customer", { tag: "groot" })],
              no: [step("n", "action.track_event")]
            }
          },
          step("k", "action.create_ticket", { title: "Proef: {{order.number}}", assignee: "" }),
          step("m", "action.send_email")
        ] as Json
      }, store.cookie)
    )
    const tried = ok(await rpc("Automations.test", { id: draft!.automation.id, recordRef: "#1003" }, store.cookie))
    expect(tried).toMatchObject({ ok: true, sample: { number: "#1003" }, stoppedAt: null })
    expect(tried.steps.map((s) => [s.nodeId, s.lane, s.status])).toEqual([
      ["t", null, "ok"],
      ["s", null, "ok"],
      ["y", "yes", "skipped"],
      ["n", "no", "ok"],
      ["k", null, "ok"],
      ["m", null, "skipped"]
    ])
    expect(tried.steps.find((s) => s.nodeId === "k")?.explanation).toBe("Zou het ticket “Proef: #1003” maken.")
    ok(
      await rpc("Automations.updateSettings", { id: draft!.automation.id, scopesOff: ["tickets.write"] }, store.cookie)
    )
    const refused = ok(await rpc("Automations.test", { id: draft!.automation.id }, store.cookie))
    expect(refused).toMatchObject({ ok: false, stoppedAt: "k" })
    expect(refused.reason).toContain("Ticket aanmaken: De flow mag niet: Tickets maken")
    expect(ok(await rpc("Tickets.list", { view: "all" }, store.cookie)).rows.length).toBe(before)
    expect(ok(await rpc("Runs.list", {}, store.cookie)).counts.all).toBe(runsBefore)

    // `/v1` and MCP: the runs read the same; a key starts one by hand, once per Idempotency-Key.
    const key = ok(
      await rpc("ApiKeys.create", {
        label: `Runs ${run}`,
        access: { kind: "role", roleId: "admin" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const headers = { authorization: `Bearer ${key}` }
    const page = await (await call(`${HOST}/v1/automations/${again}/runs`, { headers })).json() as Json
    expect(page.data.map((r: Json) => r.status)).toEqual(["succeeded", "failed"])
    expect(page.data[0]).toMatchObject({ manual: true, record: { type: "order", number: "#1003" } })
    const orderId = page.data[0].record.id
    const post = () =>
      call(`${HOST}/v1/automations/${again}/runs`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json", "idempotency-key": `runs-${run}` },
        body: JSON.stringify({ order_id: orderId })
      })
    const startedV1 = await post()
    expect(startedV1.status).toBe(200)
    const made = await startedV1.json() as Json
    expect(made).toMatchObject({ automation_id: again, status: "running", manual: true })
    expect((await (await post()).json() as Json).id).toBe(made.id)
    await until(() => rpc("Runs.get", { id: made.id }, store.cookie).then(ok), (d) => d.run.status === "succeeded")
    const listed = await mcpCall(key, "list_automation_runs", { automation_id: again })
    expect(listed.isError).toBe(false)
    expect(listed.value.data.map((r: Json) => r.id)).toContain(made.id)
    const viaMcp = await mcpCall(key, "trigger_automation", { automation_id: lapsed, order_id: orderId })
    expect(viaMcp.value).toMatchObject({ automation_id: lapsed, status: "running" })
    expect((await (await call(`${HOST}/v1/automations/auto_none/runs`, { headers })).json() as Json).error.code).toBe(
      "NotFoundV1"
    )
  }, 240_000)

  it("acts as the flow is when it wakes, asks the teammate it names, and keeps the hour's limit", async () => {
    const store = await importedStore("runs-live")
    // Kijker: Automatiseringen · Bekijken only. Flowbouwer: Bewerken, Publiceren and Klanten, no Support or orders.
    const roleWith = async (
      label: string,
      levels: Record<string, 0 | 1 | 2 | 3>,
      specials: Record<string, boolean>
    ) => {
      const created = ok(await rpc("Roles.create", { label, from: null }, store.cookie))
      const role = created.roles.roles.find((r) => r.id === created.id)!
      ok(
        await rpc("Roles.update", {
          id: created.id,
          levels: { ...role.levels, ...levels },
          specials: { ...role.specials, ...specials },
          refundLimit: null,
          stores: "all"
        }, store.cookie)
      )
      return created.id
    }
    const viewer = await roleWith("Kijker", { automations: 1 }, {})
    const builder = await roleWith("Flowbouwer", { automations: 2, customers: 2 }, { "automations.publish": true })
    const invited = [
      { email: `runs-${run}-elena@invited.test`, roleId: viewer },
      { email: `runs-${run}-kijker@invited.test`, roleId: viewer },
      { email: `runs-${run}-bouwer@invited.test`, roleId: builder }
    ]
    ok(
      await rpc("Invitations.send", {
        rows: invited.map((i) => ({ email: i.email, roleId: i.roleId, stores: "all" as const }))
      }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [elena, onlooker, maker] = await Promise.all(invited.map((i) => join(i.email)))
    const elenaId = ok(await sessionMe(elena!)).principals[0]!.id

    const flow = async (name: string, nodes: ReadonlyArray<Json>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
      return id
    }
    const gated = (title: string) => [
      TRIGGER,
      step("a", "action.require_approval", { approver: elenaId }),
      step("k", "action.create_ticket", { title, assignee: "" })
    ]
    const paused = await flow("Gepauzeerd terwijl hij wacht", gated("Na pauze"))
    const removed = await flow("Verwijderd terwijl hij wacht", gated("Na verwijderen"))
    const narrowed = await flow("Recht uit terwijl hij wacht", gated("Na recht uit"))
    const named = await flow("Elena keurt goed", gated("Door Elena"))
    const once = await flow("Eén keer", gated("Precies één keer"))
    const limited = await flow("Met limiet", [TRIGGER, step("e", "action.track_event")])
    ok(await rpc("Automations.updateSettings", { id: limited, rateLimit: 30 }, store.cookie))

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    await workflows.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    expect((await sweep(store.workspace)).status).toBe(200)
    await relay(store.workspace)
    const runOf = async (automationId: string) => ok(await rpc("Runs.list", { automationId }, store.cookie)).rows[0]!
    const waitingOf = (id: string) => until(() => runOf(id), (r) => r.status === "waiting")
    const [p, r, n, e, o] = await Promise.all([paused, removed, narrowed, named, once].map(waitingOf))

    // Paused, removed, narrowed while it waits: approved after, the run does nothing more.
    ok(await rpc("Automations.setStatus", { id: paused, status: "paused" }, store.cookie))
    ok(await rpc("Automations.remove", { id: removed }, store.cookie))
    await pastUndo(store.workspace)
    ok(await rpc("Automations.updateSettings", { id: narrowed, scopesOff: ["tickets.write"] }, store.cookie))
    for (const w of [p!, r!, n!]) ok(await rpc("Runs.approve", { id: w.id, stepId: "a" }, store.cookie))
    const settled = (id: string) =>
      until(
        () => rpc("Runs.get", { id }, store.cookie).then(ok),
        (d) => d.run.status !== "waiting" && d.run.status !== "running"
      )
    expect((await settled(p!.id)).run).toMatchObject({
      status: "stopped",
      reason: "De flow staat uit; de rest van de run is niet gedaan."
    })
    // A removed flow's run still reads, and was stoppable.
    expect((await settled(r!.id)).run).toMatchObject({
      status: "stopped",
      reason: "De flow is verwijderd; de rest van de run is niet gedaan."
    })
    expect((await settled(n!.id)).run.status).toBe("failed")
    expect((await settled(n!.id)).run.reason).toContain("De flow mist het recht")

    // Only the teammate the step names (by id), or someone who may publish, answers it.
    const asked = ok(await rpc("Runs.get", { id: e!.id }, store.cookie))
    expect(asked.waitingOn).toMatchObject({ kind: "approval", approver: `runs-${run}-elena` })
    expect(failure(await rpc("Runs.approve", { id: e!.id, stepId: "a" }, onlooker!))).toMatchObject({
      _tag: "Forbidden"
    })
    ok(await rpc("Runs.approve", { id: e!.id, stepId: "a" }, elena!))
    expect((await settled(e!.id)).run.status).toBe("succeeded")

    // Automatiseringen alone shows the run, not the order or the customer.
    const seen = ok(await rpc("Runs.list", { automationId: named }, onlooker!)).rows[0]!
    expect(seen.record).toMatchObject({ number: "", name: "" })
    expect(ok(await rpc("Runs.get", { id: e!.id }, onlooker!)).input).toEqual({})
    expect(failure(await rpc("Automations.test", { id: named }, maker!))).toMatchObject({ _tag: "Forbidden" })

    // An attempt Workflows retries finds the first one's row and does not act again.
    const plan = JSON.parse(await planOf(store.workspace, o!.id))
    const ticketStep = plan.nodes.find((x: Json) => x.id === "k")
    for (const attempt of [1, 2]) await actionStep(store.workspace, plan, ticketStep, attempt)
    const titles = ok(await rpc("Tickets.list", { view: "all" }, store.cookie)).rows.map((t) => t.title)
    expect(titles.filter((t) => t === "Precies één keer")).toHaveLength(1)
    expect(titles).not.toContain("Na pauze")
    expect(titles).not.toContain("Na verwijderen")
    expect(titles).not.toContain("Na recht uit")
    ok(await rpc("Runs.cancel", { id: o!.id }, store.cookie))

    // By hand, the hour's limit holds: the trigger's run and 29 more fill it, the next is skipped with why.
    const keyFor = async (label: string, roleId: string) =>
      ok(
        await rpc("ApiKeys.create", {
          label: `${label} ${run}`,
          access: { kind: "role", roleId } as never,
          stores: "all",
          expiresInDays: 30,
          ips: [],
          agent: false
        }, store.cookie)
      ).secret
    const admin = await keyFor("Beheer", "admin")
    const orderId = (await runOf(limited)).record!.id
    for (let i = 0; i < 29; i++) expect((await startBy(admin, limited, orderId)).status).toBe(200)
    const over = await (await startBy(admin, limited, orderId)).json() as Json
    expect(over).toMatchObject({ status: "skipped", reason: "De limiet van 30 runs per uur is bereikt." })

    // A key holds less than the flow does: it cannot have the flow make a ticket for it.
    const refused = await startBy(await keyFor("Bouwer", builder), named, orderId)
    expect(refused.status).toBe(403)
    expect((await refused.json() as Json).error.scope).toBe("support.write")
  }, 300_000)
})
