import type { AgentTask } from "@insyte/modules/agent/domain/Triggers"
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { beforeAll, describe, expect, it } from "vitest"
import worker from "../src/Local.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"
import { failure, mailsAbout, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The agent acting on its own (M15 step 6; ADR-0027 "started by an event"), on the fake model: a mail asking where an
 * order is and an order delayed reach the outbox sink `agent`, which puts a task on the events queue; the workspace's
 * agent then does what the autonomy rules let it. Eerst vragen leaves the draft (or the plate) for the team, Zelf doen
 * sends with five minutes to take it back from the log, Nooit and a store it does not reach do nothing, and the
 * opening hours, a spent budget and a draft that promises money, or states a figure or link it was not given, hand it
 * to the team. It answers only the thread's own customer, a person, once per thread and once a day per address, and
 * never a thread the team has. Every trigger is logged once, however often and however simultaneously it comes.
 *
 * A test that something did not happen runs the agent's task itself and waits for it (`deliverTask`), under an event
 * id of its own, so the queue's own delivery of the same mail cannot have taken it first.
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

const about = async (workspace: string, subjectId: string) =>
  (await actionsOf(workspace)).filter((a) => a.subjectId === subjectId)

/** The agent's rows about one record, once the queue has run its task: up to ten seconds. */
const actedOn = async (workspace: string, subjectId: string) => {
  for (let i = 0; i < 100; i++) {
    const rows = await about(workspace, subjectId)
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
  return ok(await rpc("Autonomy.set", { levels: { SendReply }, baseVersion: version }, cookie)).policy.version
}

/** The offline plan as the offline step agrees it: Klant beantwoorden on Zelf doen while nobody is online. */
const plan = (open: boolean, version: number | null) => ({
  window: "evening",
  levels: { SendReply: "auto" },
  hours: Array.from({ length: 7 }, () => ({ open, from: "00:00", to: "24:00" })),
  version,
  at: Date.now()
})

/** The agent's task, as the queue hands it over; answers once the task has run. */
const deliverTask = async (task: AgentTask) => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch<EventsMessage>("insyte-events", [
    { id: `m-${Math.random()}`, timestamp: new Date(), attempts: 1, body: { agent: task } }
  ])
  await worker.queue(batch, env, ctx)
  return getQueueResult(batch, ctx)
}

const mime = (lines: Record<string, string>, body: string) =>
  [...Object.entries(lines).map(([k, v]) => `${k}: ${v}`), "MIME-Version: 1.0", "", body].join("\r\n")

const supportMails = async (to: string) =>
  (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}`)).json() as {
    mails: Array<{ kind: string; subject: string | null; bodyText: string | null; autoSubmitted?: string | null }>
  }).mails.filter((m) => m.kind === "support.message")

/** A store with a forwarding mailbox, and the ways the tests write to it. */
const mailStore = async (tag: string) => {
  const store = await importedStore(tag)
  const forwarding = ok(
    await rpc(
      "Mailboxes.connect",
      { provider: "forward", address: `${tag}-${run}@agent-bv.nl`, label: "Support" },
      store.cookie
    )
  ).forwardingAddress!
  let n = 0
  /** A customer of the store, with an address of their own: the agent answers a thread's own customer only. */
  const customer = async (name: string) => {
    const email = `${name.toLowerCase()}-${tag}-${run}-${++n}@voorbeeld.nl`
    ok(await rpc("Customers.create", { name: `${name} Klant`, email, phone: "", country: "", tags: [] }, store.cookie))
    return email
  }
  /** A mail in, and the relay run: the agent sink has heard it when this returns. */
  const mail = async (from: string, subject: string, text: string, headers: Record<string, string> = {}) => {
    const header = `<${tag}-${run}-${++n}@voorbeeld.nl>`
    const raw = mime(
      { From: from, To: "support@agent-bv.nl", Subject: subject, "Message-ID": header, ...headers },
      text
    )
    const response = await call("http://api.test/api/__dev/mail/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: forwarding, raw })
    })
    const { threadId, messageId } = await response.json() as { threadId: string; messageId: string }
    await relay(store.workspace)
    return { threadId, messageId, header }
  }
  /** The agent's task for a mail, under an event id of the test's own (or the outbox event's). */
  const taskFor = async (m: { threadId: string; messageId: string }, eventId?: string): Promise<AgentTask> => ({
    workspaceId: store.workspace,
    eventId: eventId ??
      (await outboxOf(store.workspace)).find((e) =>
        e.event === "thread.received" && e.payload["messageId"] === m.messageId
      )!.id,
    trigger: { kind: "thread.received", threadId: m.threadId, messageId: m.messageId, reply: false }
  })
  const messagesOf = async (threadId: string) => ok(await rpc("Threads.get", { id: threadId }, store.cookie)).messages
  const outbound = async (threadId: string) => (await messagesOf(threadId)).filter((m) => m.direction === "outbound")
  return { ...store, forwarding, customer, mail, taskFor, messagesOf, outbound }
}

type MailStore = Awaited<ReturnType<typeof mailStore>>

describe("the agent on a mail asking where an order is", () => {
  let s: MailStore

  beforeAll(async () => {
    s = await mailStore("agent-mail")
  }, 120_000)

  /** The agent ran its task for this mail and did nothing: no row, no reply. */
  const leftAlone = async (m: { threadId: string; messageId: string }) => {
    await deliverTask(await s.taskFor(m, `evt_probe_${m.messageId}`))
    expect(await about(s.workspace, m.threadId)).toEqual([])
    expect(await s.outbound(m.threadId)).toEqual([])
  }

  it("asks first by default: the draft waits in the thread, and nothing is sent", async () => {
    const m = await s.mail(`Sanne <${await s.customer("Sanne")}>`, "Waar is mijn pakket?", "Het is er nog niet.")
    const [row, ...more] = await actedOn(s.workspace, m.threadId)
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
    const draft = ok(await rpc("Drafts.forSubject", { subject: { type: "thread", id: m.threadId } }, s.cookie))
    expect(draft.draft?.text).toMatch(/^Hoi Sanne,/)
    expect(await s.outbound(m.threadId)).toEqual([])
    // Asked, not done: the activity log lists what ran.
    expect(ok(await rpc("AgentLog.list", {}, s.cookie)).rows).toEqual([])
  })

  it("leaves what does not ask where an order is, or asks it with something the team must answer", async () => {
    const asked = [
      ["Vraag over mijn bestelling", "Valt de jas klein?"],
      ["Waar is mijn pakket?", "Het vorige pakket kwam kapot aan."],
      ["Bestelling annuleren", "Waar is mijn bestelling? Ik wil hem annuleren."],
      ["Adres wijzigen", "Waar is mijn pakket? Kan het naar een ander adres?"],
      ["Retour", "Waar is mijn retour gebleven?"],
      ["Klacht", "Waar blijft mijn bestelling, ik heb een klacht."]
    ]
    // One customer for them all, and for the mail that is the agent's after them: what it leaves, it leaves for the words.
    const bram = await s.customer("Bram")
    const ignored = []
    for (const [subject, text] of asked) ignored.push(await s.mail(`Bram <${bram}>`, subject!, text!))
    // The sink passed the others by before it heard this one.
    const sentinel = await s.mail(`Bram <${bram}>`, "Waar is mijn bestelling?", "Nog niets.")
    expect(await actedOn(s.workspace, sentinel.threadId)).toHaveLength(1)
    for (const m of ignored) expect(await about(s.workspace, m.threadId)).toEqual([])
  })

  it("never answers a machine: a system's address, a carrier's, an auto-reply, a list, a bounce", async () => {
    await level(s.cookie, "auto")
    const wismo = ["Waar is mijn pakket?", "Mijn pakket is nog niet ontvangen."] as const
    // One customer, whose "Auto-Submitted: no" the agent answers at the end: what it leaves, it leaves for the headers.
    const iris = await s.customer("Iris")
    const fromCustomer = (headers: Record<string, string>) => s.mail(`Iris <${iris}>`, ...wismo, headers)
    const machines = [
      await s.mail(`noreply@winkel-${run}.nl`, ...wismo),
      await s.mail(`track@mail.postnl.nl`, ...wismo),
      await fromCustomer({ "Auto-Submitted": "auto-replied" }),
      await fromCustomer({ Precedence: "bulk" }),
      await fromCustomer({ "List-Id": "<klanten.voorbeeld.nl>" }),
      await fromCustomer({ "X-Autoreply": "yes" }),
      await fromCustomer({ "Return-Path": "<>" })
    ]
    for (const m of machines) await leftAlone(m)
    // A person's "Auto-Submitted: no" is a person's.
    const person = await fromCustomer({ "Auto-Submitted": "no" })
    expect(await actedOn(s.workspace, person.threadId)).toMatchObject([{ outcome: "done" }])
  })

  it("does nothing on Nooit", async () => {
    await level(s.cookie, "never")
    const m = await s.mail(`Ilse <${await s.customer("Ilse")}>`, "Waar is mijn pakket?", "Nog niets ontvangen.")
    expect(await actedOn(s.workspace, m.threadId)).toMatchObject([
      { decision: "refuse", outcome: "refused", refuseReason: "policy", model: null }
    ])
    expect(ok(await rpc("Drafts.forSubject", { subject: { type: "thread", id: m.threadId } }, s.cookie)).draft)
      .toBeNull()
  })

  it("answers on Zelf doen, held five minutes, and the activity log takes it back", async () => {
    await level(s.cookie, "auto")
    const m = await s.mail(`Noor <${await s.customer("Noor")}>`, "Waar is mijn pakket?", "Wanneer komt mijn pakket?")
    const [row] = await actedOn(s.workspace, m.threadId)
    expect(row).toMatchObject({ decision: "run", outcome: "done", refuseReason: null, undoable: true })

    const [reply] = await s.outbound(m.threadId)
    expect(reply).toMatchObject({ sendState: "scheduled" })
    expect(reply!.bodyText).toMatch(/^Hoi Noor,/)
    const queued = (await outboxOf(s.workspace)).findLast((e) => e.event === "thread.message_queued")!
    expect(queued).toMatchObject({ due: false, relayedAt: null })

    const logged = ok(await rpc("AgentLog.list", {}, s.cookie)).rows.find((r) => r.id === row!.id)!
    expect(logged).toMatchObject({ action: "SendReply", status: "done", level: "auto", reversible: true })
    // The log closes before the token does, so the last click still finds it.
    expect(logged.undoUntil).toBeGreaterThan(Date.now() + 4 * 60_000)
    expect(logged.undoUntil).toBeLessThan(Date.now() + 300_000 - 4_000)

    const undone = ok(await rpc("AgentLog.undo", { id: row!.id }, s.cookie))
    expect(undone.entry.status).toBe("undone")
    expect(await s.outbound(m.threadId)).toEqual([])
    expect((await outboxOf(s.workspace)).find((e) => e.id === queued.id)?.cancelled).toBe(true)
  })

  it("acts once on one trigger delivered twice at the same time", async () => {
    const m = await s.mail(`Saar <${await s.customer("Saar")}>`, "Waar is mijn pakket?", "Nog niet binnen.")
    const task = await s.taskFor(m)
    await Promise.all([deliverTask(task), deliverTask(task)])
    expect(await actedOn(s.workspace, m.threadId)).toHaveLength(1)
    expect(await s.outbound(m.threadId)).toHaveLength(1)
  })

  it("answers a thread once when two triggers for it run at the same time", async () => {
    const m = await s.mail(`Tess <${await s.customer("Tess")}>`, "Waar is mijn pakket?", "Nog niet binnen.")
    // Two events for the same mail (a relay that wrote it twice): each claims its own, the thread is answered once.
    await Promise.all([
      deliverTask(await s.taskFor(m, `evt_twice_a_${m.messageId}`)),
      deliverTask(await s.taskFor(m, `evt_twice_b_${m.messageId}`))
    ])
    expect(await s.outbound(m.threadId)).toHaveLength(1)
    const rows = await actedOn(s.workspace, m.threadId)
    expect(rows.filter((r) => r.outcome === "done")).toHaveLength(1)
    // The other stood down at the send (`taken`), or found the draft being written by the first and left it.
    expect(rows.filter((r) => r.outcome !== "done").every((r) => r.decision !== "run")).toBe(true)
  })

  it("stands down when the team answers while the reply is being written", async () => {
    // The team's reply and the agent's task at once, a few times over: whoever is first, the thread gets the team's
    // answer or the agent's, never the agent's after the team's.
    for (let i = 0; i < 3; i++) {
      const m = await s.mail(`Lieke <${await s.customer("Lieke")}>`, "Waar is mijn pakket?", "Nog niet binnen.")
      await Promise.all([
        deliverTask(await s.taskFor(m, `evt_race_${m.messageId}`)),
        rpc("Threads.reply", { threadId: m.threadId, body: "We kijken het voor je na." }, s.cookie)
      ])
      await actedOn(s.workspace, m.threadId)
      const out = await s.outbound(m.threadId)
      const team = out.findIndex((x) => x.bodyText.startsWith("We kijken het voor je na."))
      const agent = out.findIndex((x) => x.bodyText.startsWith("Hoi Lieke,"))
      expect(team).toBeGreaterThanOrEqual(0)
      expect(agent === -1 || agent < team).toBe(true)
    }
  })

  it("sends the answer once the five minutes have passed, marked as sent by a machine", async () => {
    const to = await s.customer("Lotte")
    const m = await s.mail(`Lotte <${to}>`, "Waar blijft mijn bestelling", "Ik wacht al een week.")
    const [row] = await actedOn(s.workspace, m.threadId)
    expect(row).toMatchObject({ outcome: "done" })
    await pastUndo(s.workspace)
    await relay(s.workspace)
    const [sent, ...more] = await supportMails(to)
    expect(more).toEqual([])
    expect(sent).toMatchObject({ subject: "Re: Waar blijft mijn bestelling", autoSubmitted: "auto-replied" })
    expect(sent!.bodyText).toMatch(/^Hoi Lotte,/)
    // Gone is gone: the log does not claim to take back a mail that left.
    expect(failure(await rpc("AgentLog.undo", { id: row!.id }, s.cookie))).toMatchObject({
      _tag: "AgentActionFixed",
      reason: "state"
    })
    // Her answer is the team's: the agent answered this thread once.
    const again = await s.mail(`Lotte <${to}>`, "Re: Waar blijft mijn bestelling", "Waar is hij nu dan?", {
      "In-Reply-To": m.header,
      References: m.header
    })
    expect(again.threadId).toBe(m.threadId)
    await deliverTask(await s.taskFor(again, `evt_probe_${again.messageId}`))
    expect(await about(s.workspace, m.threadId)).toHaveLength(1)
    expect(await s.outbound(m.threadId)).toHaveLength(1)
  })

  it("leaves a thread the team has: taken, answered, or written in by someone other than its customer", async () => {
    const me = ok(await sessionMe(s.cookie)).principals[0]!.id
    const follow = async (name: string, before: (threadId: string) => Promise<void>, from?: string) => {
      const email = await s.customer(name)
      const first = await s.mail(`${name} <${email}>`, "Vraag over de maat", "Valt de jas klein?")
      await before(first.threadId)
      return s.mail(from ?? `${name} <${email}>`, "Re: Vraag over de maat", "En waar is mijn pakket eigenlijk?", {
        "In-Reply-To": first.header,
        References: first.header
      })
    }
    const assigned = await follow("Anouk", async (id) => {
      ok(await rpc("Threads.assign", { id, memberId: me }, s.cookie))
    })
    await deliverTask(await s.taskFor(assigned, `evt_probe_${assigned.messageId}`))
    expect(await about(s.workspace, assigned.threadId)).toEqual([])

    const answered = await follow("Bas", async (threadId) => {
      ok(await rpc("Threads.reply", { threadId, body: "Hij valt normaal." }, s.cookie))
    })
    await deliverTask(await s.taskFor(answered, `evt_probe_${answered.messageId}`))
    expect(await about(s.workspace, answered.threadId)).toEqual([])
    expect(await s.outbound(answered.threadId)).toHaveLength(1)

    // Someone on copy asks: the customer's orders are not theirs to hear about.
    const copied = await follow("Cas", () => Promise.resolve(), `Buurman <buurman-${run}@voorbeeld.nl>`)
    await leftAlone(copied)
  })

  it.each([
    ["a figure the shopper wrote", "Waar is mijn bestelling van 49,95?", "Ik betaalde 49,95 euro."],
    ["a voucher", "Waar is mijn pakket? Graag een waardebon", "Nog niets."],
    ["money back", "Waar is mijn pakket? Bevestig de terugstorting", "Nog niets."],
    ["a new parcel", "Waar blijft mijn pakket? Stuur anders een nieuw pakket", "Nog niets."],
    ["a link", "Waar is mijn pakket? Volg het via https://pakket-check.example/t", "Nog niets."],
    ["an address", "Waar is mijn pakket? Mail het naar hulp@pakket-check.example", "Nog niets."]
  ])("leaves a draft for the team that states %s", async (_what, subject, text) => {
    // The fake writes the subject into its reply, as a model told to by the shopper might.
    const m = await s.mail(`Joost <${await s.customer("Joost")}>`, subject, text)
    expect(await actedOn(s.workspace, m.threadId)).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "guard", model: "fake" }
    ])
    expect(await s.outbound(m.threadId)).toEqual([])
  })

  it("keeps to the offline plan: in opening hours the team answers, until Zelfstandigheid says otherwise", async () => {
    const at = async () => s.mail(`Fleur <${await s.customer("Fleur")}>`, "Waar is mijn pakket?", "Nog niet binnen.")
    const agreed = ok(await rpc("Autonomy.get", {}, s.cookie)).version
    // The plan wrote the policy's current version: in opening hours, the team answers.
    expect((await setup(s.workspace, { offline: plan(true, agreed) })).status).toBe(200)
    expect(await actedOn(s.workspace, (await at()).threadId)).toMatchObject([{ refuseReason: "hours" }])
    // Outside them, the agent.
    await setup(s.workspace, { offline: plan(false, agreed) })
    expect(await actedOn(s.workspace, (await at()).threadId)).toMatchObject([{ outcome: "done" }])
    // Someone sets Klant beantwoorden on Zelfstandigheid after the plan: that holds at any hour.
    await setup(s.workspace, { offline: plan(true, agreed) })
    await level(s.cookie, "ask")
    await level(s.cookie, "auto")
    expect(await actedOn(s.workspace, (await at()).threadId)).toMatchObject([{ outcome: "done" }])
    // A plan that wrote no version, agreed after the last change: the team answers, until the next change.
    await setup(s.workspace, { offline: plan(true, null) })
    expect(await actedOn(s.workspace, (await at()).threadId)).toMatchObject([{ refuseReason: "hours" }])
    await level(s.cookie, "ask")
    await level(s.cookie, "auto")
    expect(await actedOn(s.workspace, (await at()).threadId)).toMatchObject([{ outcome: "done" }])
    await setup(s.workspace, { offline: null })
  })

  it("answers one address once a day, however many threads it opens", async () => {
    const helpdesk = await s.customer("Helpdesk")
    const first = await s.mail(`Helpdesk <${helpdesk}>`, "Waar is mijn pakket?", "Nog niet ontvangen.")
    expect(await actedOn(s.workspace, first.threadId)).toMatchObject([{ outcome: "done" }])
    // Its acknowledgement of our answer, in a new thread, says it is a machine's: left alone.
    const receipt = await s.mail(
      `Helpdesk <${helpdesk}>`,
      "Re: Waar is mijn pakket?",
      "Uw vraag waar uw pakket is, is ontvangen.",
      {
        "Auto-Submitted": "auto-replied"
      }
    )
    await leftAlone(receipt)
    // One that does not say so, in yet another thread: the day's answer to this address is spent; the team has it.
    const again = await s.mail(`Helpdesk <${helpdesk}>`, "Waar is mijn pakket?", "Nog steeds niet ontvangen.")
    expect(await actedOn(s.workspace, again.threadId)).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "limit" }
    ])
    expect(await s.outbound(again.threadId)).toEqual([])
  })

  it("refuses a customer of a store it does not reach", async () => {
    await setup(s.workspace, { stores: ["sto_elsewhere"] })
    const m = await s.mail(`Klant <${await s.customer("Klant")}>`, "Waar is mijn pakket?", "Waar blijft het?")
    expect(await actedOn(s.workspace, m.threadId)).toMatchObject([
      { decision: "refuse", outcome: "refused", refuseReason: "scope", storeId: s.storeId, model: null }
    ])
    expect(ok(await rpc("Drafts.forSubject", { subject: { type: "thread", id: m.threadId } }, s.cookie)).draft)
      .toBeNull()
    await setup(s.workspace, { stores: null })
  })

  const callsAbout = async (subjectId: string) =>
    ((await (await call(`http://api.test/api/__dev/ai/calls?workspace=${s.workspace}`)).json()) as {
      calls: Array<{ subjectId: string | null }>
    }).calls.filter((c) => c.subjectId === subjectId)

  it("asks a person, and no model, while the agent is switched off", async () => {
    await setup(s.workspace, { disabled: true })
    const m = await s.mail(`Roos <${await s.customer("Roos")}>`, "Waar is mijn pakket?", "Nog niets.")
    expect(await actedOn(s.workspace, m.threadId)).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "disabled", model: null }
    ])
    expect(await callsAbout(m.threadId)).toEqual([])
    await setup(s.workspace, { disabled: false })
  })

  it("asks a person once the month's AI budget is spent, and calls no model", async () => {
    await call(`http://api.test/api/__dev/ai/spent?workspace=${s.workspace}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ memberId: null, cents: 2_100 })
    })
    const m = await s.mail(`Mila <${await s.customer("Mila")}>`, "Waar is mijn pakket?", "Nog niets.")
    expect(await actedOn(s.workspace, m.threadId)).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "budget", model: null }
    ])
    expect(await callsAbout(m.threadId)).toEqual([])
    expect(await s.outbound(m.threadId)).toEqual([])
  })
})

describe("the agent's limit per day", () => {
  it("holds when two mails come in at once", async () => {
    const s = await mailStore("agent-limit")
    const { version } = ok(await rpc("Autonomy.get", {}, s.cookie))
    ok(
      await rpc("Autonomy.set", {
        levels: { SendReply: "auto" },
        limits: { SendReply: { perDay: 1 } },
        baseVersion: version
      }, s.cookie)
    )
    const a = await s.mail(`Ada <${await s.customer("Ada")}>`, "Waar is mijn pakket?", "Nog niet ontvangen.")
    const b = await s.mail(`Bo <${await s.customer("Bo")}>`, "Waar is mijn pakket?", "Nog niet ontvangen.")
    await Promise.all([
      deliverTask(await s.taskFor(a, `evt_limit_${a.messageId}`)),
      deliverTask(await s.taskFor(b, `evt_limit_${b.messageId}`))
    ])
    await actedOn(s.workspace, a.threadId)
    await actedOn(s.workspace, b.threadId)
    const replies = [...await s.outbound(a.threadId), ...await s.outbound(b.threadId)]
    expect(replies).toHaveLength(1)
    const rows = (await actionsOf(s.workspace)).filter((r) => r.subjectId === a.threadId || r.subjectId === b.threadId)
    expect(rows.filter((r) => r.outcome === "done")).toHaveLength(1)
    expect(rows.filter((r) => r.outcome !== "done")).toMatchObject([
      { decision: "propose", outcome: "proposed", refuseReason: "limit" }
    ])
  }, 120_000)
})

/** #1003's parcel has not moved since 5 October: the tracking sweep delays it, and the relay tells the sinks. */
const delay = async (workspace: string) => {
  await call(`http://api.test/api/__dev/tracking/sweep?workspace=${workspace}`, { method: "POST" })
  await relay(workspace)
}

const order1003 = async (cookie: string) =>
  ok(await rpc("Orders.list", { limit: 50 }, cookie)).rows.find((o) => o.number === "#1003")!

describe("the agent on a delayed order", () => {
  let email = ""

  it("asks first by default: the queue's plate on Start is the question", async () => {
    const store = await importedStore("agent-delay-ask")
    const order = await order1003(store.cookie)
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

  it("tells the shopper on Zelf doen, once, after the five minutes, as a notice no person sent", async () => {
    const store = await importedStore("agent-delay-auto")
    await level(store.cookie, "auto")
    const order = await order1003(store.cookie)
    await delay(store.workspace)
    const [row] = await actedOn(store.workspace, order.id)
    expect(row).toMatchObject({ decision: "run", outcome: "done", subjectType: "order", undoable: true })
    const mailEvent = (await outboxOf(store.workspace)).findLast((e) => e.event === "order.delay_mail")!
    expect(mailEvent).toMatchObject({ due: false, relayedAt: null })

    // The same event again, twice at once: told once.
    const event = (await outboxOf(store.workspace)).find((e) => e.event === "order.delayed")!
    const task: AgentTask = {
      workspaceId: store.workspace,
      eventId: event.id,
      trigger: { kind: "order.delayed", orderIds: [order.id] }
    }
    await Promise.all([deliverTask(task), deliverTask(task)])
    expect(await about(store.workspace, order.id)).toHaveLength(1)

    await pastUndo(store.workspace)
    await relay(store.workspace)
    const mails = (await (await call(
      `http://api.test/api/__dev/mail?to=${encodeURIComponent(email)}&reference=${encodeURIComponent(order.id)}`
    )).json() as { mails: Array<{ kind: string; autoSubmitted?: string | null }> }).mails
    expect(mails).toMatchObject([{ kind: "order.delayed", autoSubmitted: "auto-generated" }])
  }, 120_000)

  it("calls the mail off when the order is cancelled, or no longer delayed, while it waits", async () => {
    const store = await importedStore("agent-delay-cancel")
    await level(store.cookie, "auto")
    // #1003, delayed by the sweep, its delay taken off by hand during the five minutes.
    const swept = await order1003(store.cookie)
    await delay(store.workspace)
    expect(await actedOn(store.workspace, swept.id)).toMatchObject([{ outcome: "done" }])
    ok(await rpc("Orders.clearDelay", { ids: [swept.id] }, store.cookie))
    // #1001, not sent yet, marked delayed by hand, then cancelled during the five minutes.
    const open = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows.find((o) => o.number === "#1001")!
    ok(await rpc("Orders.flagDelayed", { ids: [open.id] }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await actedOn(store.workspace, open.id)).toMatchObject([{ outcome: "done" }])
    ok(await rpc("Orders.cancel", { ids: [open.id], restock: false, notify: false }, store.cookie))

    await pastUndo(store.workspace)
    await relay(store.workspace)
    const shoppers = ["klant1@example.com", "klant2@example.com", "klant3@example.com"]
    for (const to of shoppers) {
      expect(await mailsAbout(to, swept.id)).toEqual([])
      expect(await mailsAbout(to, open.id)).toEqual([])
    }
  }, 120_000)
})
