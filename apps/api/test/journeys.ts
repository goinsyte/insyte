import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { Cause, Exit } from "effect"
import worker from "../src/Main.ts"
import type { EventsMessage } from "../src/platform/Relay.ts"
import { call, onboarding, rpc } from "./support.ts"

/*
 * What the team and landing journeys share: people made through the real sign-up, the captured mail, the outbox and
 * its consumer, and reading an RPC's exit.
 */

export const ORIGIN = "http://localhost:4300"
export const run = Date.now().toString(36)
export const password = "correct-horse-battery"

export const post = (path: string, body: unknown) =>
  call(`http://api.test${path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body)
  })
export const cookiesOf = (response: Response) => response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")

export const mailsTo = async (to: string) =>
  (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}`)).json() as {
    mails: Array<{ kind: string; url: string }>
  }).mails

/** One record's mails to one address (a return's to its shopper, M9.3), newest first, with the name they were sent in. */
export const mailsAbout = async (to: string, reference: string) =>
  (await (await call(
    `http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}&reference=${encodeURIComponent(reference)}`
  )).json() as { mails: Array<{ kind: string; sender: string | null }> }).mails

/** A verified, signed-in person; with `workspace`, its founder too. */
export const person = async (tag: string, workspace?: string) => {
  const email = tag.includes("@") ? tag : `team-${run}-${tag}@example.com`
  await post("/api/auth/sign-up/email", { name: `Persoon ${tag}`, email, password })
  const link = new URL((await mailsTo(email))[0]!.url)
  await call(`http://api.test${link.pathname}${link.search}`, { redirect: "manual" })
  const cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))
  if (workspace !== undefined) {
    await onboarding.advance({ step: "role", persona: "admin" }, cookie)
    await onboarding.advance(
      {
        step: "organization",
        name: workspace,
        slug: `team-${run}-${tag.replace(/[^a-z0-9]/g, "")}`,
        country: "NL",
        teamSize: "2-5"
      },
      cookie
    )
  }
  return { email, cookie }
}

export const outboxOf = async (workspace: string) =>
  (await (await call(`http://api.test/api/__dev/outbox?workspace=${workspace}`)).json() as {
    events: Array<
      {
        id: string
        event: string
        payload: Record<string, unknown>
        relayedAt: string | null
        cancelled: boolean
        due: boolean
      }
    >
  }).events
export const productEventsOf = async (workspace: string) =>
  (await (await call(`http://api.test/api/__dev/product-events?workspace=${workspace}`)).json() as {
    events: Array<{ event: string; distinctId: string }>
  }).events

/** The relay's consumer, as the queue calls it, with these ids. */
export const consume = async (outboxIds: Array<string>) => {
  const ctx = createExecutionContext()
  const batch = createMessageBatch<EventsMessage>("insyte-events", [
    { id: `m-${Math.random()}`, timestamp: new Date(), attempts: 1, body: { outboxIds } }
  ])
  await worker.queue(batch, env, ctx)
  return getQueueResult(batch, ctx)
}

/**
 * The relay's consumer, for every event of the workspace not yet relayed, until every due one
 * is: the Worker's own delayed kick may be delivering the same rows meanwhile, and a row it holds is skipped here.
 */
export const relay = async (workspace: string) => {
  for (let attempt = 0; attempt < 50; attempt++) {
    const events = await outboxOf(workspace)
    const pending = events.filter((e) => e.relayedAt === null && !e.cancelled && e.due)
    if (pending.length === 0) return
    await consume(pending.map((e) => e.id))
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`the outbox of ${workspace} did not drain`)
}
/** As if the undo window had passed. */
export const pastUndo = (workspace: string) =>
  call(`http://api.test/api/__dev/outbox/due?workspace=${workspace}`, { method: "POST" })

/** The workspace's undo windows as if `seconds` had passed (a chat card's five minutes against a toast's eight). */
export const ageUndo = (workspace: string, seconds: number) =>
  call(`http://api.test/api/__dev/undo/age?workspace=${workspace}&seconds=${seconds}`, { method: "POST" })

export const ok = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value
  throw new Error(Cause.pretty(exit.cause))
}
export const failure = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? exit.cause.reasons.find((r) => r._tag === "Fail")?.error : undefined

/** A colleague in the owner's workspace with this role, through the mailed invitation. */
export const join = async (email: string) => {
  const url = new URL((await mailsTo(email))[0]!.url)
  const id = url.pathname.split("/").pop()!
  const k = url.searchParams.get("k")!
  await call("http://api.test/api/auth/sign-up/email", {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", "x-insyte-invitation": `${id}.${k}` },
    body: JSON.stringify({ name: email.split("@")[0], email, password })
  })
  const cookie = cookiesOf(await post("/api/auth/sign-in/email", { email, password }))
  ok(await rpc("Landing.accept", { id, k }, cookie))
  return cookie
}
