import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Exit } from "effect"
import { describe, expect, it, vi } from "vitest"
import { actionStep, planOf } from "../src/workflows/AutomationRun.ts"
import { consume, ok, outboxOf, relay } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The automation engine (steps 14.2 and 14.3, M12 steps 2 and 3). Publishing gives a flow its own service account with
 * the rights its version needs; pausing disables it. The tracking sweep delays an order, and the relay starts a run per
 * active flow on "Verzending vertraagd", once: the Workflow walks the pinned version, a Filter stops the run that does
 * not pass, a Ja/nee-splitsing walks one lane, the actions run through their slices as the account (the ticket's audit
 * says `service_account`), a step Insyte cannot run yet is skipped with why, and a right switched off fails the run and
 * tells the flow's owner. An action reads the flow as it is when it runs (a flow paused while its run waited does
 * nothing more), and an attempt Workflows retries finds the first one's row and does not act twice.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

interface Runs {
  runs: Array<
    { id: string; automationId: string; serviceAccountId: string | null; status: string; reason: string | null }
  >
  steps: Array<
    { runId: string; nodeId: string; variant: string; status: string; output: Json; explanation: string | null }
  >
  accounts: Array<
    { id: string; automationId: string; label: string; scopes: Array<string>; version: number; disabled: boolean }
  >
}

const runsOf = async (workspace: string) =>
  await (await call(`http://api.test/api/__dev/automations/runs?workspace=${workspace}`)).json() as Runs

const sweep = (workspace: string) =>
  call(`http://api.test/api/__dev/tracking/sweep?workspace=${workspace}`, { method: "POST" })

const step = (id: string, variantId: string, config: Record<string, unknown> = {}) => ({
  id,
  variantId,
  config: { ...STEPS_BY_ID[variantId]?.defaultConfig, ...config }
})

const TRIGGER = step("t", "trigger.shipping_delay")

/** A run plan's "Ticket aanmaken" step. */
const ticketStep = (plan: Json) => plan.nodes.find((n: Json) => n.id === "k")

describe("the automation engine", () => {
  it("runs each active flow once per delayed order, as its own service account", async () => {
    const store = await importedStore("engine")
    const flow = async (name: string, nodes: ReadonlyArray<ReturnType<typeof step>>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
      return id
    }

    const main = await flow("Vertraagd → ticket", [
      TRIGGER,
      step("f", "condition.filter", { expression: "{{order.total}} > 0" }),
      {
        ...step("b", "condition.branch", { expression: "{{order.total}} > 100000" }),
        branches: {
          yes: [step("y", "action.tag_customer", { tag: "groot" })],
          no: [step("n", "action.tag_customer", { tag: "vertraagd" })]
        }
      } as Json,
      step("k", "action.create_ticket", { title: "Vertraagd: {{order.number}}", assignee: "", priority: "high" }),
      step("w", "action.alert_team", { team: "Niemand Bestaat" }),
      step("m", "action.split_fulfillment")
    ])
    const filtered = await flow("Alleen negatieve bedragen", [
      TRIGGER,
      step("f", "condition.filter", { expression: "{{order.total}} < 0" }),
      step("k", "action.create_ticket", { title: "Mag niet", assignee: "" })
    ])
    const refused = await flow("Ticket zonder recht", [
      TRIGGER,
      step("k", "action.create_ticket", { title: "Geen recht: {{order.number}}", assignee: "" })
    ])
    ok(await rpc("Automations.updateSettings", { id: refused, scopesOff: ["tickets.write"] }, store.cookie))
    const paused = await flow("Gepauzeerd", [TRIGGER, step("k", "action.create_ticket", { assignee: "" })])
    ok(await rpc("Automations.setStatus", { id: paused, status: "paused" }, store.cookie))

    // One account per published flow, with what its version needs; switched off is taken away, paused is disabled.
    const before = await runsOf(store.workspace)
    const account = (id: string) => before.accounts.find((a) => a.automationId === id)!
    expect(account(main)).toMatchObject({
      label: "Workflow: Vertraagd → ticket",
      disabled: false,
      scopes: expect.arrayContaining(["customers.write", "orders.write", "tickets.write", "team.notify"])
    })
    expect(account(refused).scopes).not.toContain("tickets.write")
    expect(account(paused).disabled).toBe(true)

    // #1003 stops moving: the sweep delays it, the relay starts the runs.
    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    expect((await sweep(store.workspace)).status).toBe(200)
    await relay(store.workspace)
    const instances = await workflows.get()
    expect(instances).toHaveLength(3)
    for (const instance of instances) await instance.waitForStatus("complete")
    await relay(store.workspace)

    // Delivered again, the event starts nothing new.
    const delayed = (await outboxOf(store.workspace)).filter((e) => e.event === "order.delayed").map((e) => e.id)
    await consume(delayed)
    const after = await runsOf(store.workspace)
    const runOf = (id: string) => after.runs.filter((r) => r.automationId === id)
    expect(runOf(paused)).toEqual([])
    expect(runOf(main)).toHaveLength(1)

    const [run] = runOf(main)
    expect(run).toMatchObject({ status: "succeeded", serviceAccountId: account(main).id })
    const steps = after.steps.filter((s) => s.runId === run!.id)
    expect(steps.map((s) => [s.nodeId, s.status])).toEqual([
      ["t", "succeeded"],
      ["f", "succeeded"],
      ["b", "succeeded"],
      ["n", "succeeded"],
      ["k", "succeeded"],
      ["w", "succeeded"],
      ["m", "skipped"]
    ])
    expect(steps.find((s) => s.nodeId === "m")!.explanation).toContain("kan Insyte nog niet uitvoeren")
    expect(runOf(filtered)[0]).toMatchObject({ status: "stopped", reason: "Gestopt bij “Filter”." })
    expect(runOf(refused)[0]).toMatchObject({ status: "failed" })
    expect(runOf(refused)[0]!.reason).toBe(
      "“Ticket aanmaken”: De flow mist het recht “Tickets maken”. Zet het aan bij Instellingen."
    )

    // The ticket, made by the account: the audit names it, the order is on it.
    const ticketId = steps.find((s) => s.nodeId === "k")!.output.ticketIds[0] as string
    const ticket = ok(await rpc("Tickets.get", { id: ticketId }, store.cookie)) as Json
    expect(JSON.stringify(ticket)).toContain("Vertraagd: #1003")
    const activity = ok(await rpc("Home.activity", { source: "integration" }, store.cookie))
    expect(activity.rows.find((r) => r.action === "ticket.created" && r.subjectId === ticketId)).toMatchObject({
      actorKind: "service_account",
      actorName: "Workflow: Vertraagd → ticket"
    })
    expect(JSON.stringify(ok(await rpc("Tickets.list", { view: "all" }, store.cookie)).rows)).not.toContain("Mag niet")

    // Nobody is called "Niemand Bestaat": the flow's owner hears it; and of the failed run.
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, store.cookie)).items
    expect(notes.filter((n) => n.kind === "automation.alert")).toHaveLength(1)
    expect(notes.filter((n) => n.kind === "automation.failed")).toHaveLength(1)
  }, 180_000)

  it("acts once per step, and as the flow is when the step runs", async () => {
    const store = await importedStore("engine-once")
    const me = ok(await sessionMe(store.cookie)).principals[0]!.id
    const flow = async (name: string, title: string) => {
      const { automation } = ok(await rpc("Automations.create", { name }, store.cookie))
      const id = automation!.automation.id
      const nodes = [
        TRIGGER,
        step("a", "action.require_approval", { approver: me }),
        step("k", "action.create_ticket", { title, assignee: "" })
      ]
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, store.cookie))
      ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
      return id
    }
    const once = await flow("Eén keer", "Precies één ticket")
    const paused = await flow("Gepauzeerd terwijl hij wacht", "Nooit na pauze")

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    await workflows.modifyAll(async (m) => {
      await m.disableSleeps()
    })
    expect((await sweep(store.workspace)).status).toBe(200)
    await relay(store.workspace)
    const waiting = async () => {
      for (let i = 0; i < 150; i++) {
        const runs = (await runsOf(store.workspace)).runs
        if (runs.filter((r) => r.status === "waiting").length === 2) return runs
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      throw new Error("the runs did not wait")
    }
    const runs = await waiting()
    const runOf = (automationId: string) => runs.find((r) => r.automationId === automationId)!.id

    // A retried attempt finds the first one's row: one ticket.
    const plan = JSON.parse(await planOf(store.workspace, runOf(once)))
    for (const attempt of [1, 2]) {
      const exit = await actionStep(store.workspace, plan, ticketStep(plan), attempt)
      expect(Exit.isSuccess(exit) && exit.value.kind).toBe("done")
    }
    // Paused while it waited: the step does nothing and says why.
    ok(await rpc("Automations.setStatus", { id: paused, status: "paused" }, store.cookie))
    const later = JSON.parse(await planOf(store.workspace, runOf(paused)))
    const stopped = await actionStep(store.workspace, later, ticketStep(later), 1)
    expect(Exit.isSuccess(stopped) && stopped.value).toEqual({
      kind: "stop",
      reason: "De flow staat uit; de rest van de run is niet gedaan."
    })
    const titles = ok(await rpc("Tickets.list", { view: "all" }, store.cookie)).rows.map((t) => t.title)
    expect(titles.filter((t) => t === "Precies één ticket")).toHaveLength(1)
    expect(titles).not.toContain("Nooit na pauze")
  }, 180_000)

  it("tells the tabs of each change to a run, and kicks what its actions wrote", async () => {
    const store = await importedStore("engine-live")
    const { automation } = ok(await rpc("Automations.create", { name: "Live runs" }, store.cookie))
    const id = automation!.automation.id
    const nodes = [TRIGGER, step("k", "action.create_ticket", { title: "Live: {{order.number}}", assignee: "" })]
    ok(await rpc("Automations.saveDraft", { id, name: "Live runs", nodes: nodes as Json }, store.cookie))
    ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))

    // A tab on the Runs tab: its socket, and every frame it hears.
    const opened = await call("http://api.test/api/realtime", {
      headers: { upgrade: "websocket", cookie: store.cookie }
    })
    expect(opened.status).toBe(101)
    const socket = opened.webSocket!
    const frames: Array<{ type: string; [field: string]: unknown }> = []
    socket.addEventListener("message", (e) => frames.push(JSON.parse(String(e.data))))
    socket.accept()

    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const before = new Set((await outboxOf(store.workspace)).map((e) => e.id))
    const kicked = vi.spyOn(env.EVENTS, "send")
    expect((await sweep(store.workspace)).status).toBe(200)
    await relay(store.workspace)
    const [instance] = await workflows.get()
    await instance!.waitForStatus("complete")
    const run = (await runsOf(store.workspace)).runs.find((r) => r.automationId === id)!
    expect(run.status).toBe("succeeded")

    // The run's frames, its id only: one as it is in, one per step written, one as it finished. Never its contents.
    const runFramesOf = () => frames.filter((f) => f.type === "records.changed" && f["kind"] === "automation_run")
    for (let i = 0; i < 50 && runFramesOf().length < 4; i++) await new Promise((resolve) => setTimeout(resolve, 50))
    const runFrames = runFramesOf()
    // In, the trigger's step, the ticket's step, finished.
    expect(runFrames.length).toBeGreaterThanOrEqual(4)
    for (const f of runFrames) {
      expect(f).toEqual({ v: 1, type: "records.changed", kind: "automation_run", ids: [run.id] })
    }
    expect(JSON.stringify(runFrames)).not.toContain("Live: #")

    // The ticket its action made is a recorded change: kicked as the step ended, not left for the cron's sweep.
    const ticketChanged = (await outboxOf(store.workspace)).filter((e) =>
      !before.has(e.id) && e.event === "records.changed" && e.payload["kind"] === "ticket"
    ).map((e) => e.id)
    expect(ticketChanged.length).toBeGreaterThan(0)
    const sentIds = kicked.mock.calls.flatMap(([body]) => (body as { outboxIds?: Array<string> }).outboxIds ?? [])
    for (const outboxId of ticketChanged) expect(sentIds).toContain(outboxId)
    kicked.mockRestore()
    socket.close(1000, "done")
  }, 180_000)

  it("tells the tabs of a run skipped past the hour's limit, which starts no Workflow to tell them", async () => {
    const store = await importedStore("engine-skipped")
    const { automation } = ok(await rpc("Automations.create", { name: "Vol uur" }, store.cookie))
    const id = automation!.automation.id
    const nodes = [
      TRIGGER,
      step("f", "condition.filter", { expression: "{{order.total}} < 0" }),
      step("k", "action.tag_customer", { tag: "nooit" })
    ]
    ok(await rpc("Automations.saveDraft", { id, name: "Vol uur", nodes: nodes as Json }, store.cookie))
    ok(await rpc("Automations.publish", { id, note: "" }, store.cookie))
    ok(await rpc("Automations.updateSettings", { id, rateLimit: 30 }, store.cookie))

    // The hour filled by hand: 30 runs on an order.
    const key = ok(
      await rpc("ApiKeys.create", {
        label: "Beheer",
        access: { kind: "role", roleId: "admin" } as never,
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, store.cookie)
    ).secret
    const orderId = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows[0]!.id
    await using workflows = await introspectWorkflow(env.AUTOMATION_RUN)
    const startByHand = async (i: number): Promise<Response> => {
      const started = await call(`http://api.public.test/v1/automations/${id}/runs`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "idempotency-key": `full-${i}-${crypto.randomUUID()}`
        },
        body: JSON.stringify({ order_id: orderId })
      })
      // More than a key's 10 a second: wait as the door says, then ask again.
      if (started.status !== 429) return started
      await new Promise((resolve) => setTimeout(resolve, Number(started.headers.get("retry-after") ?? "1") * 1000))
      return startByHand(i)
    }
    for (let i = 0; i < 30; i++) expect((await startByHand(i)).status).toBe(200)

    // The sweep delays #1003: its run is written skipped, and one frame-to-be says so, with its id.
    const before = new Set((await outboxOf(store.workspace)).map((e) => e.id))
    expect((await sweep(store.workspace)).status).toBe(200)
    await relay(store.workspace)
    const skipped = (await runsOf(store.workspace)).runs.filter((r) => r.automationId === id && r.status === "skipped")
    expect(skipped.map((r) => r.reason)).toEqual(["De limiet van 30 runs per uur is bereikt."])
    const told = (await outboxOf(store.workspace)).filter((e) =>
      !before.has(e.id) && e.event === "records.changed" && e.payload["kind"] === "automation_run" &&
      (e.payload["ids"] as Array<string>).includes(skipped[0]!.id)
    )
    expect(told).toHaveLength(1)
    for (const instance of await workflows.get()) await instance.waitForStatus("complete")
  }, 240_000)
})
