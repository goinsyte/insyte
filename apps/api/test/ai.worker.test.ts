import { describe, expect, it } from "vitest"
import { failure, ok, person } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Insyte AI's drafts and summaries (M15 steps 1 and 2; ADR-0027), on the fake: the worker tests have no model keys,
 * so every answer is the prompt's own deterministic one and costs nothing. Each call is still metered (`model_calls`)
 * and still refused once the month's budget is spent. A draft is text the composer takes or leaves; nothing is sent.
 */

type Call = { purpose: string; prompt: string; provider: string; outcome: string; subjectId: string | null }

const callsOf = async (workspace: string, subjectId: string) =>
  ((await (await call(`http://api.test/api/__dev/ai/calls?workspace=${workspace}`)).json()) as { calls: Array<Call> })
    .calls.filter((c) => c.subjectId === subjectId)
    .map(({ purpose, prompt, provider, outcome }) => ({ purpose, prompt, provider, outcome }))

describe("Insyte AI drafts", () => {
  let owner = ""
  let workspace = ""
  let ticket = ""

  it("writes a reply draft for a ticket, rewrites it shorter, and counts it taken", async () => {
    owner = (await person("ai-owner", "Concepten B.V.")).cookie
    workspace = ok(await sessionMe(owner)).principals[0]!.workspaceId
    ticket = ok(
      await rpc(
        "Tickets.create",
        { title: "Waar blijft mijn pakket", description: "Klant wacht al een week." },
        owner
      )
    )
      .tickets[0]!.id

    const before = ok(await rpc("Drafts.forSubject", { subject: { type: "ticket", id: ticket } }, owner))
    expect(before).toMatchObject({ draft: null, canDraft: true })

    const first = ok(await rpc("Drafts.reply", { subject: { type: "ticket", id: ticket } }, owner))
    expect(first).toMatchObject({ kind: "reply", tone: null, provider: "fake", promptVersion: "1.0.0", usedAt: null })
    expect(first.text).toContain("Waar blijft mijn pakket")
    expect(first.text).not.toMatch(/!/)

    const shorter = ok(
      await rpc("Drafts.reply", {
        subject: { type: "ticket", id: ticket },
        tone: "korter",
        parentDraftId: first.id
      }, owner)
    )
    expect(shorter).toMatchObject({ tone: "korter", parentDraftId: first.id })
    expect(shorter.text.length).toBeLessThan(first.text.length)

    const used = ok(await rpc("Drafts.use", { id: shorter.id }, owner))
    expect(used.usedAt).not.toBeNull()
    const latest = ok(await rpc("Drafts.forSubject", { subject: { type: "ticket", id: ticket } }, owner))
    expect(latest.draft?.id).toBe(shorter.id)
  })

  it("refuses a rewrite without the draft it rewrites, and a ticket that is not there", async () => {
    expect(failure(await rpc("Drafts.reply", { subject: { type: "ticket", id: ticket }, tone: "warmer" }, owner)))
      .toMatchObject({ _tag: "Invalid" })
    expect(failure(await rpc("Drafts.reply", { subject: { type: "ticket", id: "tkt_none" } }, owner)))
      .toMatchObject({ _tag: "NotFound", entity: "ticket" })
    expect(failure(await rpc("Drafts.summarizeThread", { threadId: "thr_none" }, owner)))
      .toMatchObject({ _tag: "NotFound", entity: "thread" })
  })

  it("puts a ticket's summary in its activity as Insyte's line", async () => {
    const summary = ok(await rpc("Drafts.summarizeTicket", { ticketId: ticket }, owner))
    expect(summary.text).toContain("Waar blijft mijn pakket")
    const detail = ok(await rpc("Tickets.get", { id: ticket }, owner))
    expect(detail.comments.find((c) => c.id === summary.commentId)).toMatchObject({ kind: "ai_summary" })
  })

  it("meters every call, without its text, and the month's use is on Limieten", async () => {
    const calls = await callsOf(workspace, ticket)
    expect(calls).toEqual([
      { purpose: "draft", prompt: "reply_draft@1.0.0", provider: "fake", outcome: "ok" },
      { purpose: "draft", prompt: "reply_draft@1.0.0", provider: "fake", outcome: "ok" },
      { purpose: "summarize", prompt: "ticket_summary@1.0.0", provider: "fake", outcome: "ok" }
    ])
    const budgets = ok(await rpc("AiBudget.get", undefined, owner))
    expect(budgets).toMatchObject({ metered: true, workspace: { used: 0 }, background: 0 })
  })

  it("refuses a call once the workspace's budget is spent, and calls no model", async () => {
    ok(await rpc("AiBudget.setMany", { entries: [{ scope: "workspace", limit: 0 }] }, owner))
    expect(failure(await rpc("Drafts.reply", { subject: { type: "ticket", id: ticket } }, owner)))
      .toMatchObject({ _tag: "BudgetExceeded", scope: "workspace", limit: 0 })
    expect(await callsOf(workspace, ticket)).toHaveLength(3)
    ok(await rpc("AiBudget.setMany", { entries: [{ scope: "workspace", limit: null }] }, owner))
  })

  it("says the knowledge base has nothing to write from yet", async () => {
    expect(ok(await rpc("Drafts.knowledgeAnswer", {}, owner))).toEqual({ _tag: "Nothing", reason: "no_knowledge" })
  })
})
