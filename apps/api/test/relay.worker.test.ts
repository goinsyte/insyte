import {
  createExecutionContext,
  createMessageBatch,
  createScheduledController,
  getQueueResult,
  waitOnExecutionContext
} from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Exit } from "effect"
import { describe, expect, it } from "vitest"
import worker from "../src/Main.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"
import { call, onboarding, sessionMe } from "./support.ts"

/*
 * The outbox relay (step 3, M1.4) through the Worker: founding a workspace commits `workspace.created`; the queue's
 * consumer delivers it to the product-analytics sink exactly once, however often it runs; the minute sweep finds
 * nothing left; a founding that is refused emits nothing.
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
const outboxOf = (workspace: string) =>
  dev<{ events: Array<{ id: string; event: string; relayedAt: string | null }> }>(`outbox?workspace=${workspace}`)
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
    expect(events.map((e) => e.event)).toEqual(["workspace.created"])
    outboxId = events[0]!.id
  })

  it("delivers it to product analytics once, however often the consumer runs", async () => {
    expect((await consume([outboxId])).ackAll).toBe(true)
    expect((await consume([outboxId, outboxId])).ackAll).toBe(true)
    const { events } = await productEventsOf(workspace)
    expect(events).toEqual([
      expect.objectContaining({ outboxId, event: "workspace_created", groups: { workspace } })
    ])
    expect((await outboxOf(workspace)).events[0]!.relayedAt).not.toBeNull()
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
})
