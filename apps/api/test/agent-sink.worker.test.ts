import type { AgentTask } from "@insyte/modules/agent/domain/Triggers"
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { beforeAll, describe, expect, it } from "vitest"
import worker from "../src/Local.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"
import { mailsAbout, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * The agent acting on its own (M15 step 6; ADR-0027 "started by an event"), on the fake model: a mail asking where an
 * order is and an order delayed reach the outbox sink `agent`, which puts a task on the events queue; the workspace's
 * agent then does what the autonomy rules let it. Eerst vragen leaves the draft (or the plate) for the team, Zelf doen
 * sends with five minutes to take it back from the log, Nooit and a store it does not reach do nothing, and the
 * opening hours, a spent budget and a draft that promises money hand it to the team. Every trigger is logged once,
 * however often it is delivered.
 */

type Action = {
  id: string
  action: string
  principalKind: string
  trigger: string
  decision: string
  outcome: string
  refuseReason: string | null
  subjectType: string | null
  subjectId: string | null
  storeId: string | null
  model: string | null
  undoable: boolean
}

const actionsOf = async (workspace: string) =>
  ((await (await call(`http://api.test/api/__dev/agent/actions?workspace=${workspace}`)).json()) as {
    actions: Array<Action>
  }).actions

/** The agent's rows about one record, once the queue has run its task: up to ten seconds. */
const actedOn = async (workspace: string, subjectId: string) => {
  for (let i = 0; i < 100; i++) {
    const rows = (await actionsOf(workspace)).filter((a) => a.subjectId === subjectId)
    if (rows.length > 0) return rows
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return []
}

const setup = (workspace: string, body: Record<string, unknown>) =>
  call(`http://api.test/api/__dev/agent/setup?workspace=${workspace}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  })

const level = async (cookie: string, SendReply: "auto" | "ask" | "never") => {
  const { version } = ok(await rpc("Autonomy.get", {}, cookie))
  ok(await rpc("Autonomy.set", { levels: { SendReply }, baseVersion: version }, cookie))
}

const plan = (open: boolean) => ({
  window: "evening",
  levels: { SendReply: "auto" },
  hours: Array.from({ length: 7 }, () => ({ open, from: "00:00", to: "24:00" })),
  // Agreed after every save these tests make: the plan's Zelf doen is the level that holds.
  version: 10_000,
  at: Date.now()
})

/** The agent's task, as the queue hands it over (again). */
const deliverTask = async (task: AgentTask) => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch<EventsMessage>("insyte-events", [
    { id: `m-${Math.random()}`, timestamp: new Date(), attempts: 2, body: { agent: task } }
  ])
  await worker.queue(batch, env, ctx)
  return getQueueResult(batch, ctx)
}

const mime = (lines: Record<string, string>, body: string) =>
  [...Object.entries(lines).map(([k, v]) => `${k}: ${v}`), "MIME-Version: 1.0", "", body].join("\r\n")

const captured = async (to: string) =>
  (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}`)).json() as {
    mails: Array<{ kind: string; subject: string | null; bodyText: string | null }>
  }).mails.filter((m) => m.kind === "support.message")

describe("the agent on a mail asking where an order is", () => {
  let store = { cookie: "", workspace: "", storeId: "" }
  let forwarding = ""
  let n = 0

  /** A mail in, from `from`, and the relay run: the agent sink has heard it when this returns. */
  const mail = async (from: string, subject: string, text: string, headers: Record<string, string> = {}) => {
    const raw = mime({
      From: from,
      To: "support@agent-bv.nl",
      Subject: subject,
      "Message-ID": `<agent-${run}-${++n}@voorbeeld.nl>`,
      ...headers
    }, text)
    const response = await call("http://api.test/api/__dev/mail/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: forwarding, raw })
    })
    const { threadId } = await response.json() as { threadId: string }
    await relay(store.workspace)
    return threadId
  }
  const shopper = () => `klant-${run}-${n + 1}@voorbeeld.nl`
  const messagesOf = async (threadId: string) => ok(await rpc("Threads.get", { id: threadId }, store.cookie)).messages

  beforeAll(async () => {
    store = await importedStore("agent-mail")
    forwarding = ok(
      await rpc("Mailboxes.connect", {
        provider: "forward",
        address: `agent-${run}@agent-bv.nl`,
        label: "Support"
      }, store.cookie)
    ).forwardingAddress!
  }, 120_000)

  it("asks first by default: the draft waits in the thread, and nothing is sent", async () => {
    const thread = await mail(`Sanne <${shopper()}>`, "Waar is mijn pakket?", "Hoi, mijn pakket is er nog niet.")
    const [row, ...more] = await actedOn(store.workspace, thread)
    expect(more).toEqual([])
    expect(row).toMatchObject({
      action: "SendReply",
      principalKind: "agent",
      trigger: "event:thread.received",
      decision: "propose",
      outcome: "proposed",
      refuseReason: "policy",
      subjectType: "thread",
      model: "fake",
      undoable: false
    })
    const draft = ok(await rpc("Drafts.forSubject", { subject: { type: "thread", id: thread } }, store.cookie))
    expect(draft.draft?.text).toMatch(/^Hoi Sanne,/)
    expect((await messagesOf(thread)).map((m) => m.direction)).toEqual(["inbound"])
    // Asked, not done: the activity log lists what ran.
    expect(ok(await rpc("AgentLog.list", {}, store.cookie)).rows).toEqual([])
  })

  it("leaves a mail that asks something else, and a system's, alone", async () => {
    const other = await mail(`Bram <${shopper()}>`, "Vraag over de maat", "Valt de jas klein?")
    const system = await mail(`noreply@pakket.example`, "Je pakket is onderweg", "Track je zending.")
    // A mail that is the agent's, after both: by then the sink has passed the two by.
    const asked = await mail(`Eva <${shopper()}>`, "Bestelling", "Waar is mijn bestelling?")
    expect(await actedOn(store.workspace, asked)).toHaveLength(1)
    const rows = await actionsOf(store.workspace)
    expect(rows.filter((a) => a.subjectId === other || a.subjectId === system)).toEqual([])
  })

  it("does nothing on Nooit", async () => {
    await level(store.cookie, "never")
    const thread = await mail(`Ilse <${shopper()}>`, "Waar is mijn pakket?", "Nog niets ontvangen.")
    expect(await actedOn(store.workspace, thread)).toMatchObject([
      { decision: "refuse", outcome: "refused", refuseReason: "policy", model: null }
    ])
    expect(ok(await rpc("Drafts.forSubject", { subject: { type: "thread", id: thread } }, store.cookie)).draft)
      .toBeNull()
  })

  let task: AgentTask | undefined
  let ran = ""

  it("answers on Zelf doen, held five minutes, and the activity log takes it back", async () => {
    await level(store.cookie, "auto")
    const thread = await mail(`Noor <${shopper()}>`, "Waar is mijn pakket?", "Wanneer komt mijn pakket?")
    const [row] = await actedOn(store.workspace, thread)
    expect(row).toMatchObject({ decision: "run", outcome: "done", refuseReason: null, undoable: true })
    ran = row!.id

    const messages = await messagesOf(thread)
    expect(messages.map((m) => [m.direction, m.sendState])).toEqual([["inbound", null], ["outbound", "scheduled"]])
    expect(messages[1]!.bodyText).toMatch(/^Hoi Noor,/)
    const queued = (await outboxOf(store.workspace)).findLast((e) => e.event === "thread.message_queued")!
    expect(queued).toMatchObject({ due: false, relayedAt: null })

    const logged = ok(await rpc("AgentLog.list", {}, store.cookie)).rows.find((r) => r.id === ran)!
    expect(logged).toMatchObject({ action: "SendReply", status: "done", level: "auto", reversible: true })
    expect(logged.undoUntil).toBeGreaterThan(Date.now() + 4 * 60_000)

    const undone = ok(await rpc("AgentLog.undo", { id: ran }, store.cookie))
    expect(undone.entry.status).toBe("undone")
    expect((await messagesOf(thread)).map((m) => m.direction)).toEqual(["inbound"])
    expect((await outboxOf(store.workspace)).find((e) => e.id === queued.id)?.cancelled).toBe(true)

    const event = (await outboxOf(store.workspace)).find((e) =>
      e.event === "thread.received" && e.payload["threadId"] === thread
    )!
    task = {
      workspaceId: store.workspace,
      eventId: event.id,
      trigger: {
        kind: "thread.received",
        threadId: thread,
        messageId: messages[0]!.id,
        reply: false
      }
    }
  })

  it("acts once on a trigger delivered again", async () => {
    const results = [await deliverTask(task!), await deliverTask(task!)]
    expect(results.every((r) => r.explicitAcks.length + (r.ackAll ? 1 : 0) > 0)).toBe(true)
    const thread = task!.trigger.kind === "thread.received" ? task!.trigger.threadId : ""
    const rows = (await actionsOf(store.workspace)).filter((a) => a.subjectId === thread)
    expect(rows.map((r) => r.id)).toEqual([ran])
    expect((await messagesOf(thread)).map((m) => m.direction)).toEqual(["inbound"])
  })

  it("sends the answer once the five minutes have passed", async () => {
    const to = shopper()
    const thread = await mail(`Lotte <${to}>`, "Waar blijft mijn bestelling", "Ik wacht al een week.")
    const asked = `<agent-${run}-${n}@voorbeeld.nl>`
    expect(await actedOn(store.workspace, thread)).toMatchObject([{ outcome: "done" }])
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const [sent, ...more] = await captured(to)
    expect(more).toEqual([])
    expect(sent).toMatchObject({ subject: "Re: Waar blijft mijn bestelling" })
    expect(sent!.bodyText).toMatch(/^Hoi Lotte,/)
    // Her thanks is hers to the team: the agent answered this thread once.
    const thanks = await mail(`Lotte <${to}>`, "Re: Waar blijft mijn bestelling", "Bedankt, waar is hij nu?", {
      "In-Reply-To": asked,
      References: asked
    })
    expect(thanks).toBe(thread)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    expect(await actionsOf(store.workspace).then((rows) => rows.filter((a) => a.subjectId === thread)))
      .toHaveLength(1)
  })

  it("leaves a draft that would promise money for the team", async () => {
    const thread = await mail(`Joost <${shopper()}>`, "Waar is mijn pakket, krijg ik korting?", "Het duurt lang.")
    expect(await actedOn(store.workspace, thread)).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "guard", model: "fake" }
    ])
    expect((await messagesOf(thread)).map((m) => m.direction)).toEqual(["inbound"])
  })

  it("keeps to the offline plan: in opening hours the team answers, outside them the agent", async () => {
    expect((await setup(store.workspace, { offline: plan(true) })).status).toBe(200)
    const open = await mail(`Fleur <${shopper()}>`, "Waar is mijn pakket?", "Nog niet binnen.")
    expect(await actedOn(store.workspace, open)).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "hours" }
    ])
    await setup(store.workspace, { offline: plan(false) })
    const closed = await mail(`Daan <${shopper()}>`, "Waar is mijn pakket?", "Nog niet binnen.")
    expect(await actedOn(store.workspace, closed)).toMatchObject([{ decision: "run", outcome: "done" }])
    await setup(store.workspace, { offline: null })
  })

  it("refuses a customer of a store it does not reach", async () => {
    const customer = ok(await rpc("Customers.list", { limit: 50 }, store.cookie)).rows.find((c) => c.email !== null)!
    await setup(store.workspace, { stores: ["sto_elsewhere"] })
    const thread = await mail(`Klant <${customer.email}>`, "Waar is mijn pakket?", "Waar blijft het?")
    expect(await actedOn(store.workspace, thread)).toMatchObject([
      { decision: "refuse", outcome: "refused", refuseReason: "scope", storeId: store.storeId, model: null }
    ])
    expect(ok(await rpc("Drafts.forSubject", { subject: { type: "thread", id: thread } }, store.cookie)).draft)
      .toBeNull()
    await setup(store.workspace, { stores: null })
  })

  it("asks a person once the month's AI budget is spent, and calls no model", async () => {
    await call(`http://api.test/api/__dev/ai/spent?workspace=${store.workspace}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: null, cents: 2_100 })
    })
    const thread = await mail(`Mila <${shopper()}>`, "Waar is mijn pakket?", "Nog niets.")
    expect(await actedOn(store.workspace, thread)).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "budget", model: null }
    ])
    const calls = (await (await call(`http://api.test/api/__dev/ai/calls?workspace=${store.workspace}`)).json()) as {
      calls: Array<{ subjectId: string | null }>
    }
    expect(calls.calls.filter((c) => c.subjectId === thread)).toEqual([])
    expect((await messagesOf(thread)).map((m) => m.direction)).toEqual(["inbound"])
  })
})

/** #1003's parcel has not moved since 5 October: the tracking sweep delays it, and the relay tells the sinks. */
const delay = async (workspace: string) => {
  await call(`http://api.test/api/__dev/tracking/sweep?workspace=${workspace}`, { method: "POST" })
  await relay(workspace)
}

describe("the agent on a delayed order", () => {
  let email = ""

  it("asks first by default: the queue's plate on Start is the question", async () => {
    const store = await importedStore("agent-delay-ask")
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1003")!
    await delay(store.workspace)
    expect(await actedOn(store.workspace, order.id)).toMatchObject([
      {
        action: "SendReply",
        trigger: "event:order.delayed",
        decision: "propose",
        refuseReason: "policy",
        subjectType: "order",
        model: null
      }
    ])
    const rows = ok(await rpc("Queue.list", { tab: "all" }, store.cookie)).rows
    const plate = rows.find((r) => r.subjectId === order.id)!
    expect(plate).toMatchObject({ kind: "order_delayed", state: "open" })
    email = /Mail aan (\S+):/.exec(plate.proposal?.plate.after.value ?? "")?.[1] ?? ""
    expect(email).toMatch(/^klant\d+@example\.com$/)
    expect((await outboxOf(store.workspace)).filter((e) => e.event === "order.delay_mail")).toEqual([])
  }, 120_000)

  it("tells the shopper on Zelf doen, once, after the five minutes", async () => {
    const store = await importedStore("agent-delay-auto")
    await level(store.cookie, "auto")
    const order = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1003")!
    await delay(store.workspace)
    const [row] = await actedOn(store.workspace, order.id)
    expect(row).toMatchObject({ decision: "run", outcome: "done", subjectType: "order", undoable: true })
    const mailEvent = (await outboxOf(store.workspace)).findLast((e) => e.event === "order.delay_mail")!
    expect(mailEvent).toMatchObject({ due: false, relayedAt: null })

    // The same event again: told once.
    const event = (await outboxOf(store.workspace)).find((e) => e.event === "order.delayed")!
    await deliverTask({
      workspaceId: store.workspace,
      eventId: event.id,
      trigger: { kind: "order.delayed", orderIds: [order.id] }
    })
    expect((await actionsOf(store.workspace)).filter((a) => a.subjectId === order.id)).toHaveLength(1)

    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await mailsAbout(email, order.id)).toMatchObject([{ kind: "order.delayed" }])
  }, 120_000)
})
