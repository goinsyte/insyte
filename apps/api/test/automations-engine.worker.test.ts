import { STEPS_BY_ID } from "@insyte/domain/automations/Steps"
import { introspectWorkflow } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { consume, failure, join, ok, outboxOf, pastUndo, person, relay, run as testRun } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The automation engine (steps 14.2 and 14.3, M12 steps 2 and 3). Publishing gives a flow its own service account with
 * the rights its version needs; pausing disables it. The tracking sweep delays an order, and the relay starts a run per
 * active flow on "Verzending vertraagd", once: the Workflow walks the pinned version, a Filter stops the run that does
 * not pass, a Ja/nee-splitsing walks one lane, the actions run through their slices as the account (the ticket's audit
 * says `service_account`), a step Insyte cannot run yet is skipped with why, and a right switched off fails the run and
 * tells the flow's owner. A flow holds no right its publisher lacks.
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
      step("m", "action.send_email")
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
      scopes: expect.arrayContaining(["customers.write", "customers.email", "tickets.write", "team.notify"])
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

  it("gives a flow no right its publisher lacks, at publishing or in Instellingen", async () => {
    const owner = await person("engine-rights", "Rechten B.V.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    // Automatiseringen · Bewerken with Publiceren and Klanten · Bewerken, but Support at 0 and no refunds.
    const created = ok(await rpc("Roles.create", { label: "Flowbouwer", from: null }, owner.cookie))
    const role = created.roles.roles.find((r) => r.id === created.id)!
    ok(
      await rpc("Roles.update", {
        id: created.id,
        levels: { ...role.levels, automations: 2, customers: 2 },
        specials: { ...role.specials, "automations.publish": true },
        refundLimit: null,
        stores: "all"
      }, owner.cookie)
    )
    const email = `engine-rights-${testRun}@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: created.id, stores: "all" as const }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    const builder = await join(email)

    const draft = async (name: string, nodes: ReadonlyArray<ReturnType<typeof step>>) => {
      const { automation } = ok(await rpc("Automations.create", { name }, builder))
      const id = automation!.automation.id
      ok(await rpc("Automations.saveDraft", { id, name, nodes: nodes as Json }, builder))
      return id
    }
    const ticket = await draft("Ticket", [TRIGGER, step("k", "action.create_ticket", { assignee: "" })])
    expect(failure(await rpc("Automations.publish", { id: ticket, note: "" }, builder))).toMatchObject({
      _tag: "Forbidden",
      permission: "support"
    })
    // The owner holds it, so may publish it.
    ok(await rpc("Automations.publish", { id: ticket, note: "" }, owner.cookie))

    const label = await draft("Label", [TRIGGER, step("l", "action.tag_customer", { tag: "vertraagd" })])
    ok(await rpc("Automations.publish", { id: label, note: "" }, builder))
    expect(
      failure(await rpc("Automations.updateSettings", { id: label, scopesExtra: ["tickets.write"] }, builder))
    ).toMatchObject({ _tag: "Forbidden", permission: "support" })
    ok(await rpc("Automations.updateSettings", { id: label, scopesExtra: ["tickets.write"] }, owner.cookie))
  }, 180_000)
})
