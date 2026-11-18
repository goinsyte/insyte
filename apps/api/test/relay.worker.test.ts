import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  getQueueResult,
  waitOnExecutionContext
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Exit } from "effect"
import { describe, expect, it, vi } from "vitest"
import worker from "../src/Local.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"
import { call, onboarding, sessionMe } from "./support.ts"

/*
 * The outbox relay (step 3, M1.4) through the Worker: founding a workspace commits `workspace.created`; the queue's
 * consumer delivers it to the product-analytics sink exactly once, however often it runs; the minute sweep finds
 * nothing left; a founding that is refused emits nothing. A row that is not its event's (written by hand, or by an
 * older version) is never marked relayed: set aside as a dead letter, or, for a privacy, billing or webhook event,
 * held back and tried again later; `/api/health/deep` counts both.
 */

const ORIGIN = "http://localhost:4300"
const run = Date.now().toString(36)
const password = "correct-horse-battery"

const post = (path: string, body: unknown) =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body)
  })
const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")

/** A verified, signed-in person at the organisation step. */
const atOrganisation = async (tag: string) => {
  const email = `relay-${run}-${tag}@example.com`
  await post("/api/auth/sign-up/email", { name: tag, email, password })
  const { mails } = await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(email)}`)).json() as {
    mails: Array<{ url: string }>
  }
  const link = new URL(mails[0]!.url)
  await call(`http://api.test${link.pathname}${link.search}`, { redirect: "manual" })
  const cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))
  await onboarding.advance({ step: "role", persona: "admin" }, cookie)
  return cookie
}

const dev = async <A>(path: string): Promise<A> =>
  (await call(`http://api.test/api/__dev/${path}`)).json() as Promise<A>
interface OutboxRow {
  id: string
  event: string
  relayedAt: string | null
  due: boolean
  attempts: number
  deadLetteredAt: string | null
  deadLetterReason: string | null
}
const outboxOf = (workspace: string) => dev<{ events: Array<OutboxRow> }>(`outbox?workspace=${workspace}`)
/** An outbox row as a raw insert writes one, whatever its payload. */
const raw = async (workspace: string, event: string, payload: unknown) =>
  ((await (await call(`http://api.test/api/__dev/outbox/raw?workspace=${workspace}&event=${event}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  })).json()) as { id: string }).id
const letters = async () =>
  ((await (await call("http://api.test/api/health/deep")).json()) as { outbox: { deadLettered: number; held: number } })
    .outbox
const productEventsOf = (workspace: string) =>
  dev<{ events: Array<{ outboxId: string; event: string; distinctId: string; groups: Record<string, string> }> }>(
    `product-events?workspace=${workspace}`
  )

/** The consumer, as the queue calls it, with these ids. */
const consume = async (outboxIds: Array<string>) => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch<EventsMessage>("insyte-events", [
    { id: `m-${Math.random()}`, timestamp: new Date(), attempts: 1, body: { outboxIds } }
  ])
  await worker.queue(batch, env, ctx)
  return getQueueResult(batch, ctx)
}

describe("the outbox relay", () => {
  let workspace = ""
  let outboxId = ""

  it("commits workspace.created with the workspace, in its own scope", async () => {
    const cookie = await atOrganisation("a")
    const founded = await onboarding.advance(
      { step: "organization", name: "Relay Co.", slug: `relay-${run}`, country: "NL", teamSize: "1" },
      cookie
    )
    expect(Exit.isSuccess(founded)).toBe(true)
    const me = await sessionMe(cookie)
    workspace = Exit.isSuccess(me) ? me.value.principals[0]!.workspaceId : ""
    const { events } = await outboxOf(workspace)
    // Beside it, the realtime signals of the audited writes (records.changed, step 7.2).
    const created = events.filter((e) => e.event !== "records.changed")
    expect(created.map((e) => e.event)).toEqual(["workspace.created"])
    outboxId = created[0]!.id
  })

  it("delivers it to product analytics once, however often the consumer runs", async () => {
    expect((await consume([outboxId])).ackAll).toBe(true)
    expect((await consume([outboxId, outboxId])).ackAll).toBe(true)
    const { events } = await productEventsOf(workspace)
    expect(events).toEqual([
      expect.objectContaining({ outboxId, event: "workspace_created", groups: { workspace } })
    ])
    expect((await outboxOf(workspace)).events.find((e) => e.id === outboxId)!.relayedAt).not.toBeNull()
  })

  it("leaves the minute sweep nothing of it to send again", async () => {
    const ctx = createExecutionContext()
    worker.scheduled(createScheduledController({ cron: "* * * * *" }), env, ctx)
    await waitOnExecutionContext(ctx)
    expect((await productEventsOf(workspace)).events).toHaveLength(1)
  })

  it("emits nothing for a founding that is refused", async () => {
    const cookie = await atOrganisation("b")
    const refused = await onboarding.advance(
      { step: "organization", name: "Kopie", slug: `relay-${run}`, country: "NL", teamSize: "1" },
      cookie
    )
    expect(Exit.isFailure(refused)).toBe(true)
    const me = await sessionMe(cookie)
    expect(Exit.isSuccess(me) && me.value.principals).toEqual([])
  })

  it("sets aside a row that is not its event's, never as relayed, and holds back one that must not be lost", async () => {
    const before = await letters()
    const stray = await raw(workspace, "sheet.changed", { workspaceId: workspace })
    const privacy = await raw(workspace, "privacy.deletion_requested", { workspaceId: workspace })
    const webhook = await raw(workspace, "order.cancelled", { workspaceId: workspace, orderIds: "ord_1" })
    expect((await consume([stray, privacy, webhook])).ackAll).toBe(true)
    const rows = new Map((await outboxOf(workspace)).events.map((e) => [e.id, e]))
    // A dead letter: set aside, not relayed, and not swept again.
    expect(rows.get(stray)).toMatchObject({ relayedAt: null, attempts: 1, deadLetterReason: expect.any(String) })
    expect(rows.get(stray)!.deadLetteredAt).not.toBeNull()
    // A shopper's erasure and a webhook's order: still to deliver, later, never set aside.
    for (const id of [privacy, webhook]) {
      expect(rows.get(id)).toMatchObject({ relayedAt: null, deadLetteredAt: null, attempts: 1, due: false })
    }
    const after = await letters()
    expect(after.deadLettered - before.deadLettered).toBeGreaterThanOrEqual(1)
    expect(after.held - before.held).toBeGreaterThanOrEqual(2)
    // Delivered again (a kick, the sweep): the dead letter stays as it was.
    expect((await consume([stray])).ackAll).toBe(true)
    expect((await outboxOf(workspace)).events.find((e) => e.id === stray)!.attempts).toBe(1)
  })

  it("relays the rest of a batch when one event's sink fails, and holds that one back on its own (W13.6)", async () => {
    // An import whose Workflow cannot start (an id no Workflow takes): the data sink fails on every try.
    const bad = await raw(workspace, "import.uploaded", {
      workspaceId: workspace,
      importId: "no such id!",
      userId: "u"
    })
    const good = await raw(workspace, "workspace.created", { workspaceId: workspace, userId: `u-${run}` })
    const result = await consume([bad, good])
    // The message is done with: the failing event waits for its own try again, nothing else goes back to the queue.
    expect(result.ackAll).toBe(true)
    expect(result.retryBatch.retry).toBe(false)
    const rows = new Map((await outboxOf(workspace)).events.map((e) => [e.id, e]))
    expect(rows.get(good)!.relayedAt).not.toBeNull()
    expect(rows.get(bad)).toMatchObject({ relayedAt: null, deadLetteredAt: null, attempts: 1, due: false })
    // The reason names the sink and the error's kind, never the payload.
    expect(rows.get(bad)!.deadLetterReason).toMatch(/^sink data failed: \w+/)
    expect(rows.get(bad)!.deadLetterReason).not.toContain("no such id")
  })

  it("delivers an event whose room cannot be reached: a realtime frame is best-effort (W13.6)", async () => {
    // The room's object failing (a reset after a deploy, an overload): the broadcast rejects.
    const rooms = vi.spyOn(env.ROOMS, "getByName").mockReturnValue(
      { broadcast: () => Promise.reject(new Error("Durable Object reset because its code was updated.")) } as never
    )
    try {
      const frame = await raw(workspace, "records.changed", { workspaceId: workspace, kind: "note", ids: ["n_1"] })
      expect((await consume([frame])).ackAll).toBe(true)
      const row = (await outboxOf(workspace)).events.find((e) => e.id === frame)!
      expect(row).toMatchObject({ deadLetteredAt: null, deadLetterReason: null })
      expect(row.relayedAt).not.toBeNull()
      expect(rooms).toHaveBeenCalled()
    } finally {
      rooms.mockRestore()
    }
  })
  it("keeps a task it asks for until it ran, and the cron sends one whose message was lost again (W13.6)", async () => {
    const tasksOf = () =>
      dev<{ tasks: Array<{ kind: string; ref: string; attempts: number; task: EventsMessage }> }>(
        `pending-tasks?workspace=${workspace}`
      )
    // The topic's message is lost on its way to the queue.
    const send = vi.spyOn(env.EVENTS, "send").mockResolvedValue(undefined as never)
    const sendBatch = vi.spyOn(env.EVENTS, "sendBatch").mockResolvedValue(undefined as never)
    try {
      const asked = await raw(workspace, "ticket.topic_requested", {
        workspaceId: workspace,
        userId: "u",
        ticketId: `tkt_${run}`
      })
      expect((await consume([asked])).ackAll).toBe(true)
      expect((await tasksOf()).tasks).toEqual([expect.objectContaining({ kind: "classify_ticket", ref: asked })])
      // Ten minutes on, the cron sends it again.
      await call(`http://api.test/api/__dev/pending-tasks/due?workspace=${workspace}`, { method: "POST" })
      const ctx = createExecutionContext()
      worker.scheduled(
        createScheduledController({ cron: "* * * * *", scheduledTime: Date.UTC(2026, 10, 19, 1, 7) }),
        env,
        ctx
      )
      await waitOnExecutionContext(ctx)
      const again = sendBatch.mock.calls.flatMap(([messages]) => [...messages]).map((m) => m.body as EventsMessage)
      const task = again.find((body) => "classifyTicket" in body && body.classifyTicket.eventId === asked)
      expect(task).toBeDefined()
      expect((await tasksOf()).tasks[0]!.attempts).toBe(1)
      // Run, it is crossed off.
      const batch = createMessageBatch<EventsMessage>("insyte-events", [
        { id: `t-${run}`, timestamp: new Date(), attempts: 1, body: task! }
      ])
      const tctx = createExecutionContext()
      await worker.queue(batch, env, tctx)
      await getQueueResult(batch, tctx)
      expect((await tasksOf()).tasks).toEqual([])
    } finally {
      send.mockRestore()
      sendBatch.mockRestore()
    }
  })
})
