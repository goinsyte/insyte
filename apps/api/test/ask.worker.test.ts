import { describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, rpcStream, sessionMe } from "./support.ts"

/*
 * Vraag Insyte (M15 step 3; ai.md §4), on the fake: the worker tests run with `AI_ADAPTER=fake`, so each step is the
 * prompt's own deterministic answer and costs nothing, while every step is still reserved and metered. A question
 * streams its answer as frames, the tools read as the person asking (their role, their stores), every number in the
 * answer is a figure a tool computed, and a conversation is its owner's alone.
 */

// A frame or a turn, read loosely as the console does.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

type ModelCall = { purpose: string; prompt: string; provider: string; outcome: string; subjectId: string | null }

const callsOf = async (workspace: string, turnId: string) =>
  ((await (await call(`http://api.test/api/__dev/ai/calls?workspace=${workspace}`)).json()) as {
    calls: Array<ModelCall>
  }).calls.filter((c) => c.subjectId === turnId)

const seed = async (cookie: string, tag?: string) => {
  const query = tag === undefined ? "" : `?${new URLSearchParams({ tag, name: tag })}`
  const response = await call(`http://api.test/api/__dev/stores/seed${query}`, { method: "POST", headers: { cookie } })
  expect(response.status).toBe(200)
  return (await response.json() as { storeId: string }).storeId
}

/** A case waiting on evidence, on the store's order `#1002`. */
const caseOn = async (cookie: string, storeId: string, amountMinor: number) => {
  const order = ok(await rpc("Orders.list", { limit: 50, storeId }, cookie)).rows.find((o) => o.number === "#1002")!
  return ok(
    await rpc("Chargebacks.createManual", {
      provider: "stripe",
      customer: { name: "Sanne de Vries" },
      amountMinor,
      reasonCode: "not_received",
      orderId: order.id
    }, cookie)
  )
}

const ask = async (cookie: string, text: string, threadId?: string) =>
  ok(await rpcStream("Ask.send", { text, ...(threadId === undefined ? {} : { threadId }) }, cookie)) as Array<Json>

const settledOf = (frames: ReadonlyArray<Json>) => frames.find((f) => f._tag === "settled")!.turn
const figuresOf = (turn: Json) => turn.tokens.filter((t: Json) => "figure" in t)
/** A figure as it reads: Dutch amounts keep the euro sign and the number together with a no-break space. */
const shownOf = (turn: Json): Array<string> => figuresOf(turn).map((f: Json) => f.figure.replaceAll("\u00a0", " "))
const refsOf = (turn: Json) => turn.tokens.filter((t: Json) => "ref" in t)
/** The words with a digit that is not a record's own name (a case number in a figure's label): made-up numbers. */
const digitsInWords = (turn: Json, names: ReadonlyArray<string> = []) =>
  turn.tokens
    .filter((t: Json) => "t" in t && /\d/.test(t.t))
    .map((t: Json) => t.t as string)
    .filter((w: string) => !names.some((n) => w.includes(n)))

describe("Vraag Insyte", () => {
  let owner = ""
  let workspace = ""
  let first = ""
  let second = ""
  let threadId = ""
  let answerId = ""
  let firstTokens: Array<Json> = []

  it("streams an answer whose numbers are figures and whose records are chips, and meters each step", async () => {
    const me = await person("ask-owner", "Vraag B.V.")
    owner = me.cookie
    workspace = ok(await sessionMe(owner)).principals[0]!.workspaceId
    first = await seed(owner)
    second = await seed(owner, "tweede")
    await caseOn(owner, first, 4_500)
    await caseOn(owner, second, 7_250)

    const frames = await ask(owner, "Welke chargebacks hebben bewijs nodig?")
    const tags = frames.map((f) => f._tag)
    expect(tags[0]).toBe("started")
    expect(tags.at(-1)).toBe("settled")
    expect(tags).toContain("thinking")
    expect(tags).toContain("tool")
    expect(tags).toContain("source")
    expect(tags).toContain("text")
    // The thinking comes before the words, the words before the turn settles.
    expect(tags.indexOf("thinking")).toBeLessThan(tags.indexOf("text"))

    const started = frames[0]
    threadId = started.threadId
    answerId = started.turnId
    expect(started.question).toMatchObject({ role: "user", text: "Welke chargebacks hebben bewijs nodig?" })
    expect(started.title).toBe("Welke chargebacks hebben bewijs nodig?")

    const turn = settledOf(frames)
    expect(turn).toMatchObject({ id: answerId, role: "assistant", state: "settled", failure: null, withheld: false })
    expect(turn.tools).toEqual([{ verb: "Las", object: "2 zaken" }])
    // Every number is a figure a tool computed, never a digit in the words.
    expect(figuresOf(turn).map((f: Json) => [f.label, f.figure])).toEqual(
      expect.arrayContaining([["Zaken die op jou wachten", "2"]])
    )
    expect(shownOf(turn)).toEqual(expect.arrayContaining(["€ 45,00", "€ 72,50"]))
    expect(refsOf(turn)).toHaveLength(2)
    expect(digitsInWords(turn, refsOf(turn).map((r: Json) => r.ref))).toEqual([])
    expect(refsOf(turn).every((r: Json) => r.kind === "chargeback" && r.to.startsWith("/chargebacks/"))).toBe(true)
    expect(turn.followUps.length).toBeGreaterThan(0)
    expect(turn.followUps).not.toContain("Welke chargebacks hebben bewijs nodig?")
    // The words streamed are the words kept.
    expect(frames.filter((f) => f._tag === "text").flatMap((f) => f.tokens)).toEqual(turn.tokens)
    firstTokens = turn.tokens

    // Two steps (the tools, then the answer), each a metered call against the budget.
    expect((await callsOf(workspace, answerId)).map(({ purpose, prompt, provider, outcome, subjectId }) => ({
      purpose,
      prompt,
      provider,
      outcome,
      subjectId
    }))).toEqual([
      { purpose: "ask", prompt: "ask_step@1.0.0", provider: "fake", outcome: "ok", subjectId: answerId },
      { purpose: "ask", prompt: "ask_step@1.0.0", provider: "fake", outcome: "ok", subjectId: answerId }
    ])
  })

  it("answers a follow-up on the same conversation with Analyse's figures, each opening its explanation", async () => {
    const frames = await ask(owner, "Hoe gaat het deze maand met de omzet?", threadId)
    expect(frames[0]).toMatchObject({ _tag: "started", threadId })
    const turn = settledOf(frames)
    expect(turn.state).toBe("settled")
    const figures = figuresOf(turn)
    expect(figures.length).toBeGreaterThan(0)
    expect(figures.every((f: Json) => f.to === "/analytics")).toBe(true)
    const paid = figures.find((f: Json) => f.label === "Betaalde bestellingen deze maand")
    expect(paid?.explain).toMatchObject({ key: { _tag: "paid_orders" } })
    expect(digitsInWords(turn)).toEqual([])

    const thread = ok(await rpc("Ask.get", { id: threadId }, owner))
    expect(thread.turns.map((t) => [t.role, t.state])).toEqual([
      ["user", "settled"],
      ["assistant", "settled"],
      ["user", "settled"],
      ["assistant", "settled"]
    ])
    expect(thread.turns[1]!.tokens).toEqual(firstTokens)
    expect(ok(await rpc("Ask.list", {}, owner)).rows.map((r) => r.id)).toContain(threadId)
  })

  it("asks a question again as a new answer on its conversation", async () => {
    const frames = ok(await rpcStream("Ask.retry", { turnId: answerId }, owner)) as Array<Json>
    expect(frames[0]).toMatchObject({ _tag: "started", threadId })
    expect(frames[0].question.text).toBe("Welke chargebacks hebben bewijs nodig?")
    expect(frames[0].turnId).not.toBe(answerId)
    expect(settledOf(frames).state).toBe("settled")
  })

  it("keeps a conversation its owner's: a colleague can neither read nor ask on it", async () => {
    const email = `ask-${run}-colleague@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: "all" }] }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    const colleague = await join(email)
    expect(failure(await rpc("Ask.get", { id: threadId }, colleague))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpcStream("Ask.send", { text: "En nu?", threadId }, colleague))).toMatchObject({
      _tag: "NotFound"
    })
    expect(failure(await rpcStream("Ask.retry", { turnId: answerId }, colleague))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("Ask.list", {}, colleague)).rows.map((r) => r.id)).not.toContain(threadId)
  })

  it("reads only the stores a member reaches", async () => {
    const email = `ask-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: [first] }] }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    const held = await join(email)
    const turn = settledOf(await ask(held, "Welke chargebacks hebben bewijs nodig?"))
    expect(turn.tools).toEqual([{ verb: "Las", object: "1 zaak" }])
    expect(shownOf(turn)).toContain("€ 45,00")
    expect(shownOf(turn)).not.toContain("€ 72,50")
    expect(refsOf(turn)).toHaveLength(1)
  })

  it("says what a role may not see, and puts no number to it", async () => {
    const email = `ask-${run}-service@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "service", stores: "all" }] }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    const service = await join(email)
    // Klantenservice has no Analyse: the tool answers that it may not, and the answer has no figure from it.
    const turn = settledOf(await ask(service, "Hoe gaat het deze maand met de omzet?"))
    expect(turn.state).toBe("settled")
    expect(turn.tools).toEqual([{ verb: "Vergeleek", object: "deze maand met vorige maand" }])
    expect(figuresOf(turn)).toEqual([])
    expect(turn.sources).toEqual([])
  })

  it("sets a conversation aside with Undo, and puts it back", async () => {
    const removed = ok(await rpc("Ask.remove", { id: threadId }, owner))
    expect(removed.id).toBe(threadId)
    expect(ok(await rpc("Ask.list", {}, owner)).rows.map((r) => r.id)).not.toContain(threadId)
    expect(failure(await rpc("Ask.get", { id: threadId }, owner))).toMatchObject({ _tag: "NotFound" })
    ok(await rpc("Shared.undo", { token: removed.undo.token }, owner))
    expect(ok(await rpc("Ask.list", {}, owner)).rows.map((r) => r.id)).toContain(threadId)
  })

  it("settles the answer as failed once the month's budget is spent, and calls no model", async () => {
    ok(await rpc("AiBudget.setMany", { entries: [{ scope: "workspace", limit: 0 }] }, owner))
    const frames = await ask(owner, "Vat de open zaken van vandaag samen")
    const turn = settledOf(frames)
    expect(turn).toMatchObject({ state: "failed", failure: "budget", tokens: [] })
    expect(frames.filter((f) => f._tag === "text")).toEqual([])
    expect(await callsOf(workspace, turn.id)).toEqual([])
    ok(await rpc("AiBudget.setMany", { entries: [{ scope: "workspace", limit: null }] }, owner))
  })
})
