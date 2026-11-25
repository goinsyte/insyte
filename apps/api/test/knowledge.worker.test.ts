import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, rpcStream, sessionMe } from "./support.ts"

/*
 * Kennisbank (M15 step 7, W11.2), on the fake embedder (`EMBEDDINGS_ADAPTER=fake`) and the fake model: chapters are
 * written as drafts, published as versions the agents read, and undone; publishing a chapter the customer agent reads
 * needs `ai.autonomy`; a chapter for one store is read only by who reaches it; a reply draft reads the published
 * chapters, cites the one it used and files the question nothing answered as a gap; the jobs Worker embeds a published
 * chapter; an archived one is read by nothing. A key reads the published chapters only, over `/v1` and MCP, and Vraag
 * Insyte answers from them (`search_knowledge`) as the person asking.
 */

type Call = { purpose: string; provider: string; outcome: string; subjectId: string | null }

const callsOf = async (workspace: string) =>
  ((await (await call(`http://api.test/api/__dev/ai/calls?workspace=${workspace}`)).json()) as {
    calls: Array<Call>
  }).calls

const until = async <A>(read: () => Promise<A>, done: (a: A) => boolean) => {
  for (let i = 0; i < 50; i++) {
    const value = await read()
    if (done(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return read()
}

const RETURNS = [
  "## Termijn",
  "",
  "Je kunt binnen 30 dagen na bezorging retourneren via ons retourportaal.",
  "",
  "## Sale",
  "",
  "Sale-artikelen ruil je alleen voor een andere maat."
].join("\n")

const MCP_VERSION = "2026-07-28"
const mcp = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call("http://api.public.test/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": MCP_VERSION,
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
          "io.modelcontextprotocol/protocolVersion": MCP_VERSION,
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
  return message.result as { isError: boolean; content: Array<{ text: string }> }
}

describe("Kennisbank", () => {
  const people = { owner: "", view: "", service: "", editor: "", held: "" }
  let workspace = ""
  let storeId = ""
  let returns = ""

  beforeAll(async () => {
    const owner = await person("kb-owner", "Kennis B.V.")
    people.owner = owner.cookie
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const seed = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: owner.cookie }
    })
    storeId = ((await seed.json()) as { storeId: string }).storeId
    // Instellingen · Beheren (what Kennisbank's editor asks) without `ai.autonomy`.
    const made = ok(await rpc("Roles.create", { label: "Kennisbank", from: "view" }, owner.cookie))
    const role = made.roles.roles.find((r) => r.id === made.id)!
    ok(
      await rpc("Roles.update", {
        id: role.id,
        levels: { ...role.levels, settings: 3 },
        specials: role.specials,
        refundLimit: role.refundLimit,
        stores: "all"
      }, owner.cookie)
    )
    const invited = [
      { key: "view", roleId: "view", stores: "all" as const },
      { key: "service", roleId: "service", stores: "all" as const },
      { key: "editor", roleId: role.id, stores: "all" as const },
      // An admin held to another store: every chapter for this one is out of reach.
      { key: "held", roleId: "admin", stores: ["sto_elsewhere"] }
    ] as const
    const emails = invited.map((i) => ({ ...i, email: `kb-${run}-${i.key}@invited.test` }))
    ok(
      await rpc(
        "Invitations.send",
        { rows: emails.map((i) => ({ email: i.email, roleId: i.roleId, stores: i.stores })) },
        owner.cookie
      )
    )
    await pastUndo(workspace)
    await relay(workspace)
    for (const i of emails) people[i.key] = await join(i.email)
  }, 120_000)

  it("writes a draft, refuses a stale save, publishes versions and undoes a publication", async () => {
    const created = ok(
      await rpc("Knowledge.create", { title: "Retourneren", audience: "customer_agent", body: "Concept" }, people.owner)
    )
    returns = created.article.id
    expect(created.article).toMatchObject({ status: "draft", published: null, archived: false })
    expect(created.undo).not.toBeNull()

    const saved = ok(
      await rpc("Knowledge.saveDraft", {
        id: returns,
        title: "Retourneren",
        audience: "customer_agent",
        body: RETURNS,
        baseRevision: created.article.revision
      }, people.owner)
    )
    expect(saved.article.body).toBe(RETURNS)
    // A save on the revision the editor read before is refused, with the one it is at now.
    expect(
      failure(
        await rpc("Knowledge.saveDraft", {
          id: returns,
          title: "Retourneren",
          audience: "customer_agent",
          body: "Oud",
          baseRevision: created.article.revision
        }, people.owner)
      )
    ).toMatchObject({ _tag: "KnowledgeStale", revision: saved.article.revision })

    const published = ok(
      await rpc("Knowledge.publish", {
        id: returns,
        title: "Retourneren",
        audience: "customer_agent",
        body: RETURNS,
        baseRevision: saved.article.revision
      }, people.owner)
    )
    expect(published.article).toMatchObject({ status: "published", published: { body: RETURNS } })
    const v1 = published.article.published!.version
    expect((await outboxOf(workspace)).filter((e) => e.event === "knowledge.published").length).toBeGreaterThan(0)

    // A change not yet published leaves the published text as it was.
    const changed = ok(
      await rpc("Knowledge.saveDraft", {
        id: returns,
        title: "Retourneren",
        audience: "customer_agent",
        body: `${RETURNS}\n\nRuilen kan ook.`
      }, people.owner)
    )
    expect(changed.article).toMatchObject({ status: "changed", published: { version: v1, body: RETURNS } })
    const second = ok(
      await rpc("Knowledge.publish", {
        id: returns,
        title: "Retourneren",
        audience: "customer_agent",
        body: `${RETURNS}\n\nRuilen kan ook.`
      }, people.owner)
    )
    expect(second.article.published!.body).toContain("Ruilen")
    // Its undo publishes the previous text again.
    ok(await rpc("Shared.undo", { token: second.undo!.token }, people.owner))
    const back = ok(await rpc("Knowledge.get", { id: returns }, people.owner))
    expect(back.published!.body).toBe(RETURNS)

    const versions = ok(await rpc("Knowledge.versions", { id: returns }, people.owner))
    // Oldest first, for the drawer's diff.
    const numbers = versions.map((v) => v.version)
    expect(numbers).toEqual(numbers.toSorted((a, b) => a - b))
    expect(ok(await rpc("Knowledge.version", { id: returns, version: v1 }, people.owner)).body).toBe(RETURNS)
    expect(failure(await rpc("Knowledge.version", { id: returns, version: 999 }, people.owner)))
      .toMatchObject({ _tag: "NotFound" })
  })

  it("keeps an empty chapter a draft: publishing it is refused at its text", async () => {
    const created = ok(await rpc("Knowledge.create", { title: "Leeg", audience: "assistant", body: "" }, people.owner))
    for (const body of ["", "  \n "]) {
      expect(
        failure(
          await rpc(
            "Knowledge.publish",
            { id: created.article.id, title: "Leeg", audience: "assistant", body },
            people.owner
          )
        ),
        JSON.stringify(body)
      ).toMatchObject({ _tag: "Invalid", fields: { body: "required" } })
    }
    expect(ok(await rpc("Knowledge.get", { id: created.article.id }, people.owner)))
      .toMatchObject({ status: "draft", published: null })
    ok(await rpc("Knowledge.archive", { id: created.article.id }, people.owner))
  })

  it("refuses to put back an empty version, as a chapter's first one is", async () => {
    const created = ok(
      await rpc("Knowledge.create", { title: "Leeg terug", audience: "assistant", body: "" }, people.owner)
    )
    const first = created.article.versions[0]!.version
    ok(
      await rpc(
        "Knowledge.publish",
        { id: created.article.id, title: "Leeg terug", audience: "assistant", body: "Nu met tekst." },
        people.owner
      )
    )
    expect(failure(await rpc("Knowledge.restoreVersion", { id: created.article.id, version: first }, people.owner)))
      .toMatchObject({ _tag: "Invalid", fields: { body: "required" } })
    expect(ok(await rpc("Knowledge.get", { id: created.article.id }, people.owner)).published)
      .toMatchObject({ body: "Nu met tekst." })
    ok(await rpc("Knowledge.archive", { id: created.article.id }, people.owner))
  })

  it("lets Bekijken read, Beheren write, and only ai.autonomy publish what the customer agent reads", async () => {
    expect(ok(await rpc("Knowledge.list", {}, people.view)).rows.map((r) => r.id)).toContain(returns)
    expect(failure(await rpc("Knowledge.create", { title: "X", audience: "assistant", body: "" }, people.view)))
      .toMatchObject({ _tag: "Forbidden" })
    // Klantenservice has no Instellingen · Bekijken.
    expect(failure(await rpc("Knowledge.list", {}, people.service))).toMatchObject({ _tag: "Forbidden" })

    const mine = ok(
      await rpc(
        "Knowledge.create",
        { title: "Interne werkwijze", audience: "customer_agent", body: "Stap 1" },
        people.editor
      )
    ).article
    expect(
      failure(
        await rpc(
          "Knowledge.publish",
          { id: mine.id, title: mine.title, audience: "customer_agent", body: "Stap 1" },
          people.editor
        )
      )
    ).toMatchObject({ _tag: "Forbidden" })
    // For the team only, Beheren is enough.
    const internal = ok(
      await rpc(
        "Knowledge.publish",
        { id: mine.id, title: mine.title, audience: "assistant", body: "Stap 1" },
        people.editor
      )
    )
    expect(internal.article).toMatchObject({ status: "published", audience: "assistant" })
    // Moving it back to the customer agent is publishing for customers again.
    expect(
      failure(
        await rpc(
          "Knowledge.publish",
          { id: mine.id, title: mine.title, audience: "both", body: "Stap 1" },
          people.editor
        )
      )
    ).toMatchObject({ _tag: "Forbidden" })
  })

  it("keeps a store's chapter from who does not reach that store", async () => {
    const own = ok(
      await rpc(
        "Knowledge.create",
        { title: "Alleen deze winkel", audience: "assistant", body: "Hier", storeId },
        people.owner
      )
    ).article
    expect(own.storeId).toBe(storeId)
    ok(
      await rpc(
        "Knowledge.publish",
        { id: own.id, title: own.title, audience: "assistant", body: "Hier" },
        people.owner
      )
    )
    const theirs = ok(await rpc("Knowledge.list", {}, people.held)).rows.map((r) => r.id)
    expect(theirs).toContain(returns)
    expect(theirs).not.toContain(own.id)
    expect(failure(await rpc("Knowledge.get", { id: own.id }, people.held))).toMatchObject({ _tag: "NotFound" })
    const searched = ok(
      await rpc("Knowledge.search", { query: "alleen deze winkel hier", audience: "any" }, people.held)
    )
    expect(searched.hits.map((h) => h.articleId)).not.toContain(own.id)
    expect(
      failure(await rpc("Knowledge.create", { title: "Elders", audience: "assistant", body: "", storeId }, people.held))
    )
      .toMatchObject({ _tag: "Invalid" })
  })

  it("finds the published chapter, cites it in a reply draft, and files what nothing answers", async () => {
    const found = ok(
      await rpc("Knowledge.search", { query: "Binnen hoeveel dagen kan ik retourneren?" }, people.owner)
    )
    expect(found.mode).toBe("vector")
    expect(found.hits[0]).toMatchObject({ articleId: returns, title: "Retourneren" })
    // The draft is never read.
    expect(found.hits.every((h) => !h.text.includes("Ruilen kan ook"))).toBe(true)

    const ticket = ok(
      await rpc("Tickets.create", { title: "Binnen hoeveel dagen kan ik retourneren?", description: "" }, people.owner)
    ).tickets[0]!.id
    const draft = ok(await rpc("Drafts.reply", { subject: { type: "ticket", id: ticket } }, people.owner))
    expect(draft.sources?.map((s) => s.articleId)).toEqual([returns])
    expect(ok(await rpc("Knowledge.get", { id: returns }, people.owner)).uses7d).toBeGreaterThanOrEqual(1)

    const other = ok(
      await rpc("Tickets.create", { title: "Versturen jullie naar Zwitserland?", description: "" }, people.owner)
    ).tickets[0]!.id
    const unanswered = ok(await rpc("Drafts.reply", { subject: { type: "ticket", id: other } }, people.owner))
    expect(unanswered.sources ?? []).toEqual([])
    const gaps = ok(await rpc("Knowledge.gaps", {}, people.owner))
    const gap = gaps.rows.find((g) => g.ticketId === other)!
    expect(gap).toMatchObject({ question: "Versturen jullie naar Zwitserland?", state: "open", count: 1 })

    // "negeren", and its undo.
    const dismissed = ok(await rpc("Knowledge.dismissGap", { gapId: gap.id }, people.owner))
    expect(dismissed.gap.state).toBe("dismissed")
    ok(await rpc("Shared.undo", { token: dismissed.undo!.token }, people.owner))
    expect(ok(await rpc("Knowledge.gap", { gapId: gap.id }, people.owner)).state).toBe("open")

    // "Toevoegen aan…": the chapter's next publication answers it.
    const shipping = ok(
      await rpc("Knowledge.create", { title: "Verzending", audience: "customer_agent", body: "" }, people.owner)
    ).article
    ok(await rpc("Knowledge.linkGap", { gapId: gap.id, articleId: shipping.id }, people.owner))
    const first = ok(await rpc("Drafts.knowledgeAnswer", { gapId: gap.id, articleId: shipping.id }, people.owner))
    expect(first._tag).toBe("Nothing")
    ok(
      await rpc("Knowledge.publish", {
        id: shipping.id,
        title: "Verzending",
        audience: "customer_agent",
        body: "We versturen naar Nederland, België en Zwitserland."
      }, people.owner)
    )
    expect(ok(await rpc("Knowledge.gap", { gapId: gap.id }, people.owner)).state).toBe("answered")
    expect(failure(await rpc("Knowledge.dismissGap", { gapId: gap.id }, people.owner)))
      .toMatchObject({ _tag: "GapNotOpen", state: "answered" })
  })

  it("embeds a published chapter on the jobs Worker, metered", async () => {
    await relay(workspace)
    const embedded = await until(
      () => callsOf(workspace),
      (calls) => calls.some((c) => c.purpose === "embedding" && c.subjectId === returns)
    )
    expect(embedded.find((c) => c.purpose === "embedding" && c.subjectId === returns))
      .toMatchObject({ provider: "fake", outcome: "ok" })
    const found = ok(await rpc("Knowledge.search", { query: "retourportaal termijn dagen" }, people.owner))
    expect(found.hits[0]?.articleId).toBe(returns)
  })

  it("lets a key read the published chapters only, over /v1 and MCP", async () => {
    const draftOnly = ok(
      await rpc(
        "Knowledge.create",
        { title: "Nog niet klaar", audience: "customer_agent", body: "Geheim" },
        people.owner
      )
    ).article
    const key = ok(
      await rpc("ApiKeys.create", {
        label: "Kennisbank",
        access: { kind: "custom", scopes: { support: 1 } },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, people.owner)
    ).secret
    const auth = { headers: { authorization: `Bearer ${key}` } }
    const list = await call("http://api.test/v1/knowledge_articles", auth)
    expect(list.status).toBe(200)
    const rows = ((await list.json()) as { data: Array<{ id: string; version: number }> }).data
    expect(rows.map((r) => r.id)).toContain(returns)
    expect(rows.map((r) => r.id)).not.toContain(draftOnly.id)
    const one = await call(`http://api.test/v1/knowledge_articles/${returns}`, auth)
    expect(await one.json()).toMatchObject({ id: returns, body: RETURNS, audience: "customer_agent" })
    expect((await call(`http://api.test/v1/knowledge_articles/${draftOnly.id}`, auth)).status).toBe(404)

    const searched = await mcp(key, "search_knowledge", { query: "binnen hoeveel dagen retourneren" })
    expect(searched.isError).toBe(false)
    expect(JSON.parse(searched.content[0]!.text).data[0]).toMatchObject({ article_id: returns })

    const narrow = ok(
      await rpc("ApiKeys.create", {
        label: "Alleen bestellingen",
        access: { kind: "custom", scopes: { orders: 1 } },
        stores: "all",
        expiresInDays: 30,
        ips: [],
        agent: false
      }, people.owner)
    ).secret
    const refused = await call("http://api.test/v1/knowledge_articles", {
      headers: { authorization: `Bearer ${narrow}` }
    })
    expect(refused.status).toBe(403)
    expect(((await refused.json()) as { error: { scope: string } }).error.scope).toBe("support.read")
  })

  it("archives a chapter out of every read, with undo", async () => {
    const archived = ok(await rpc("Knowledge.archive", { id: returns }, people.owner))
    expect(archived.article.archived).toBe(true)
    expect(ok(await rpc("Knowledge.list", {}, people.owner)).rows.map((r) => r.id)).not.toContain(returns)
    const found = ok(await rpc("Knowledge.search", { query: "binnen hoeveel dagen retourneren" }, people.owner))
    expect(found.hits.map((h) => h.articleId)).not.toContain(returns)
    expect(
      failure(
        await rpc(
          "Knowledge.saveDraft",
          { id: returns, title: "Retourneren", audience: "customer_agent", body: "" },
          people.owner
        )
      )
    ).toMatchObject({ _tag: "ArticleArchived" })
    ok(await rpc("Shared.undo", { token: archived.undo!.token }, people.owner))
    expect(ok(await rpc("Knowledge.list", {}, people.owner)).rows.map((r) => r.id)).toContain(returns)
    const again = ok(await rpc("Knowledge.search", { query: "binnen hoeveel dagen retourneren" }, people.owner))
    expect(again.hits[0]?.articleId).toBe(returns)
  })
  it("lets Vraag Insyte answer from the published chapters only, as the person asking reads them", async () => {
    const BODY = "Retourneren en terugsturen kan via het retourportaal, met het label uit de bevestiging."
    const make = async (title: string, body: string, extra: Record<string, unknown> = {}) =>
      ok(await rpc("Knowledge.create", { title, audience: "assistant", body, ...extra }, people.owner)).article
    const publish = async (a: { id: string; title: string }, body: string) =>
      ok(await rpc("Knowledge.publish", { id: a.id, title: a.title, audience: "assistant", body }, people.owner))
    const policy = await make("Retourbeleid voor het team", BODY)
    await publish(policy, BODY)
    // A draft, an archived chapter, and one for the store `held` does not reach: all about the same question.
    const draft = await make("Concept retourneren", `${BODY} Concepttekst.`)
    const old = await make("Oud retourbeleid", `${BODY} Oude tekst.`)
    await publish(old, `${BODY} Oude tekst.`)
    ok(await rpc("Knowledge.archive", { id: old.id }, people.owner))
    const local = await make("Retourneren in deze winkel", `${BODY} Winkeltekst.`, { storeId })
    await publish(local, `${BODY} Winkeltekst.`)

    const askOf = async (cookie: string) => {
      const frames = ok(
        await rpcStream("Ask.send", { text: "Hoe lang kan ik retourneren en terugsturen?" }, cookie)
      ) as Array<{ _tag: string; turn?: { sources: Array<{ title: string; to: string }>; tokens: Array<unknown> } }>
      const settled = frames.find((f) => f._tag === "settled")!.turn!
      return settled.sources.map((src) => src.to)
    }
    const cites = (id: string) => `/settings/ai/knowledge/${id}`
    const uses = async (id: string) => ok(await rpc("Knowledge.get", { id }, people.owner)).uses7d
    expect(await uses(policy.id)).toBe(0)

    const owner = await askOf(people.owner)
    expect(owner).toContain(cites(policy.id))
    expect(owner).toContain(cites(local.id))
    expect(owner).not.toContain(cites(draft.id))
    expect(owner).not.toContain(cites(old.id))

    // Held to another store: the workspace's chapter, never the store's.
    const held = await askOf(people.held)
    expect(held).toContain(cites(policy.id))
    expect(held).not.toContain(cites(local.id))
    expect(held).not.toContain(cites(draft.id))
    expect(held).not.toContain(cites(old.id))

    // Each answer that read a chapter used it: "gebruikt (7 d)" counts both turns on the team's chapter, one on the store's.
    expect(await uses(policy.id)).toBe(2)
    expect(await uses(local.id)).toBe(1)
    expect(await uses(draft.id)).toBe(0)
  })
})
