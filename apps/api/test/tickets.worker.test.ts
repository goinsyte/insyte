import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Tickets (step 13.3, M11 step 3), made by hand: numbered `#n` per workspace, on the board and in the set-aside views
 * with a count each; moved, assigned and set aside, each with its undo; commented with `@` mentions that tell the
 * teammate; refused to a role without Klantenservice; and the same through `/v1` and MCP for a key.
 */

// A response body, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any

const HOST = "http://api.public.test"

const send = async (method: string, path: string, token: string, body?: unknown) => {
  const response = await call(`${HOST}/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(method === "GET" ? {} : { "idempotency-key": crypto.randomUUID() })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  })
  return { status: response.status, body: await response.json() as Json }
}

const mcpCall = async (token: string, name: string, args: Record<string, unknown>) => {
  const response = await call(`${HOST}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
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
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
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
  if (message.result === undefined) throw new Error(JSON.stringify(message))
  return { isError: message.result.isError as boolean, value: JSON.parse(message.result.content[0].text) as Json }
}

const keyFor = async (cookie: string, label: string, roleId: string) =>
  ok(
    await rpc("ApiKeys.create", {
      label,
      access: { kind: "role", roleId } as never,
      stores: "all",
      expiresInDays: 30,
      ips: [],
      agent: false
    }, cookie)
  ).secret

const inbox = async (cookie: string) =>
  ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, cookie)).items

describe("tickets", () => {
  const people = { owner: "", service: "", view: "", finance: "" }
  let workspace = ""
  let ownerId = ""
  let serviceId = ""

  beforeAll(async () => {
    const owner = await person("tickets-owner", "Tickets B.V.")
    people.owner = owner.cookie
    const me = ok(await sessionMe(owner.cookie)).principals[0]!
    workspace = me.workspaceId
    ownerId = me.id
    const colleagues = (["service", "view", "finance"] as const).map((role) => ({
      role,
      email: `tickets-${run}-${role}@invited.test`
    }))
    ok(
      await rpc("Invitations.send", {
        rows: colleagues.map((c) => ({ email: c.email, roleId: c.role, stores: "all" as const }))
      }, owner.cookie)
    )
    await pastUndo(workspace)
    await relay(workspace)
    for (const c of colleagues) people[c.role] = await join(c.email)
    serviceId = ok(await sessionMe(people.service)).principals[0]!.id
    await relay(workspace)
  }, 120_000)

  it("numbers tickets #n per workspace, and Undo takes a new one away again", async () => {
    const options = ok(await rpc("Tickets.options", undefined, people.owner))
    expect(options.templates.map((t) => t.id)).toEqual(["refund_request", "supplier_escalation", "customer_feedback"])
    expect(options.labels).toContain("Klantenservice")

    const first = ok(await rpc("Tickets.create", { title: "  Pakket kwijt bij PostNL  " }, people.owner))
    expect(first.tickets[0]).toMatchObject({
      number: 1,
      title: "Pakket kwijt bij PostNL",
      status: "intake",
      priority: "medium",
      source: "manual",
      topic: "where_is_my_order",
      commentCount: 0,
      related: null
    })
    const mistaken = ok(await rpc("Tickets.create", { title: "Per ongeluk" }, people.owner))
    expect(mistaken.tickets[0]!.number).toBe(2)
    ok(await rpc("Shared.undo", { token: mistaken.undo!.token }, people.owner))
    expect(failure(await rpc("Tickets.get", { id: mistaken.tickets[0]!.id }, people.owner))).toMatchObject({
      _tag: "NotFound"
    })
    // A number is never handed out twice, so the next one is #3; it goes to the top of the board.
    const third = ok(
      await rpc("Tickets.create", {
        title: "Verzoek om terugbetaling · #1001",
        priority: "high",
        labels: ["Terugbetaling", " Terugbetaling "],
        template: "refund_request",
        dueAt: Date.UTC(2026, 10, 12)
      }, people.owner)
    ).tickets[0]!
    expect(third).toMatchObject({ number: 3, labels: ["Terugbetaling"], template: "refund_request", topic: "returns" })
    expect(third.position).toBeLessThan(first.tickets[0]!.position)
    expect(failure(await rpc("Tickets.create", { title: "   " }, people.owner))).toMatchObject({
      _tag: "Invalid",
      fields: { title: "required" }
    })
    expect(
      failure(await rpc("Tickets.create", { title: "Iemand anders", assigneeIds: ["mem_none"] }, people.owner))
    ).toMatchObject({ _tag: "MemberNotActive", memberId: "mem_none" })
  })

  it("lists the board and every set-aside view with a count each, and moves with Undo", async () => {
    const make = async (title: string, extra: Record<string, unknown> = {}) =>
      ok(await rpc("Tickets.create", { title, ...extra }, people.owner)).tickets[0]!
    const mine = await make("Voor mij", { assigneeIds: [ownerId] })
    const done = await make("Al klaar", { status: "done" })
    expect(done.resolvedAt).not.toBeNull()
    const snoozed = await make("Later")
    const archived = await make("Oud")
    const spam = await make("Win een iPhone")
    const trashed = await make("Weg ermee")

    ok(await rpc("Tickets.snooze", { ids: [snoozed.id], until: Date.now() + 86_400_000 }, people.owner))
    ok(await rpc("Tickets.archive", { ids: [archived.id] }, people.owner))
    ok(await rpc("Tickets.spam", { ids: [spam.id] }, people.owner))
    ok(await rpc("Tickets.trash", { ids: [trashed.id] }, people.owner))
    expect(failure(await rpc("Tickets.snooze", { ids: [mine.id], until: Date.now() - 1 }, people.owner)))
      .toMatchObject({ _tag: "Invalid", fields: { until: "past" } })

    const list = ok(await rpc("Tickets.list", {}, people.owner))
    // Pakket kwijt, #3, Voor mij, Al klaar on the board; one in each set-aside view.
    expect(list.counts).toMatchObject({
      all: 4,
      open: 3,
      mine: 1,
      unassigned: 2,
      snoozed: 1,
      done: 1,
      archived: 1,
      spam: 1,
      trash: 1,
      bySource: { manual: 3 }
    })
    expect(list.rows).toHaveLength(8)
    // Newest on top: the board's order.
    expect(list.rows[0]!.title).toBe("Weg ermee")
    const board = ok(await rpc("Tickets.list", { view: "all" }, people.owner)).rows.map((r) => r.title)
    expect(board).toEqual(["Al klaar", "Voor mij", "Verzoek om terugbetaling · #1001", "Pakket kwijt bij PostNL"])
    expect(ok(await rpc("Tickets.list", { view: "mine" }, people.owner)).rows.map((r) => r.id)).toEqual([mine.id])

    // The panel counts each view by its link.
    const counts = ok(await rpc("Nav.counts", { area: "tickets" }, people.owner))
    expect(counts).toMatchObject({
      "/tickets": 4,
      "/tickets?view=mine": 1,
      "/tickets?view=trash": 1,
      "/tickets?source=manual": 3
    })

    const moved = ok(await rpc("Tickets.setStatus", { ids: [mine.id, done.id], status: "in_progress" }, people.owner))
    expect(moved.tickets.map((t) => t.status)).toEqual(["in_progress", "in_progress"])
    ok(await rpc("Shared.undo", { token: moved.undo!.token }, people.owner))
    const back = ok(await rpc("Tickets.get", { id: done.id }, people.owner)).ticket
    expect(back.status).toBe("done")
    expect(back.resolvedAt).toBe(done.resolvedAt)

    // Back from the trash and the rest at once, with Undo.
    const putBack = ok(
      await rpc("Tickets.putBack", { ids: [snoozed.id, archived.id, spam.id, trashed.id] }, people.owner)
    )
    expect(putBack.tickets.every((t) => t.deletedAt === null && t.archivedAt === null)).toBe(true)
    ok(await rpc("Shared.undo", { token: putBack.undo!.token }, people.owner))
    expect(ok(await rpc("Tickets.list", { view: "trash" }, people.owner)).rows.map((r) => r.id)).toEqual([trashed.id])

    // A priority for several at once, the title for one; a reorder keeps the places the cards held.
    const prio = ok(await rpc("Tickets.update", { ids: [mine.id, done.id], priority: "high" }, people.owner))
    expect(prio.tickets.map((t) => t.priority)).toEqual(["high", "high"])
    expect(failure(await rpc("Tickets.update", { ids: [mine.id, done.id], title: "Twee" }, people.owner)))
      .toMatchObject({ _tag: "Invalid", fields: { ids: "one" } })
    const renamed = ok(
      await rpc("Tickets.update", { ids: [mine.id], title: "Maat valt klein", labels: ["Feedback"] }, people.owner)
    )
    expect(renamed.tickets[0]).toMatchObject({ title: "Maat valt klein", topic: "sizing", labels: ["Feedback"] })
    ok(await rpc("Shared.undo", { token: renamed.undo!.token }, people.owner))
    expect(ok(await rpc("Tickets.get", { id: mine.id }, people.owner)).ticket).toMatchObject({
      title: "Voor mij",
      labels: []
    })
    ok(await rpc("Tickets.reorder", { ids: [mine.id, done.id] }, people.owner))
    const reordered = ok(await rpc("Tickets.list", { view: "all" }, people.owner)).rows.map((r) => r.title)
    expect(reordered.slice(0, 2)).toEqual(["Voor mij", "Al klaar"])

    const copy = ok(await rpc("Tickets.duplicate", { id: mine.id }, people.owner)).tickets[0]!
    expect(copy).toMatchObject({ title: "Voor mij (kopie)", assignees: [], priority: "high" })
  })

  it("tells an assignee once the window has passed, and an undone assignment tells no one", async () => {
    const ticket = ok(await rpc("Tickets.create", { title: "Klant wacht op antwoord" }, people.owner)).tickets[0]!
    const undone = ok(await rpc("Tickets.assign", { id: ticket.id, memberId: serviceId }, people.owner))
    expect(undone.tickets[0]!.assignees.map((a) => a.id)).toEqual([serviceId])
    ok(await rpc("Shared.undo", { token: undone.undo!.token }, people.owner))
    await pastUndo(workspace)
    await relay(workspace)
    expect((await inbox(people.service)).filter((n) => n.kind === "ticket.assigned")).toHaveLength(0)

    const assigned = ok(await rpc("Tickets.assign", { id: ticket.id, memberId: serviceId }, people.owner))
    // Twice is once.
    expect(ok(await rpc("Tickets.assign", { id: ticket.id, memberId: serviceId }, people.owner)).undo).toBeNull()
    expect(assigned.tickets[0]!.assignees).toEqual([{ id: serviceId, name: expect.stringContaining("service") }])
    await pastUndo(workspace)
    await relay(workspace)
    const note = (await inbox(people.service)).find((n) => n.kind === "ticket.assigned")
    expect(note).toMatchObject({
      subjectType: "ticket",
      subjectId: ticket.id,
      actor: { kind: "member", id: ownerId },
      data: { number: ticket.number, title: "Klant wacht op antwoord" }
    })
    expect(
      failure(await rpc("Tickets.assign", { id: ticket.id, memberId: "mem_none" }, people.owner))
    ).toMatchObject({ _tag: "MemberNotActive" })

    const off = ok(await rpc("Tickets.unassign", { id: ticket.id, memberId: serviceId }, people.owner))
    expect(off.tickets[0]!.assignees).toEqual([])
    ok(await rpc("Shared.undo", { token: off.undo!.token }, people.owner))
    expect(ok(await rpc("Tickets.get", { id: ticket.id }, people.owner)).ticket.assignees.map((a) => a.id)).toEqual([
      serviceId
    ])
  })

  it("keeps comments newest first, tells whom they name, and follows the ticket for the viewer", async () => {
    const ticket = ok(await rpc("Tickets.create", { title: "Verkeerde kleur geleverd" }, people.owner)).tickets[0]!
    ok(await rpc("Tickets.comment", { id: ticket.id, body: "Eerst even de foto's opvragen." }, people.owner))
    const named = ok(
      await rpc(
        "Tickets.comment",
        { id: ticket.id, body: "@Service kun jij dit oppakken?", mentions: [serviceId] },
        people.owner
      )
    )
    expect(named).toMatchObject({
      kind: "comment",
      author: { kind: "member", id: ownerId },
      mentions: [{ id: serviceId }]
    })
    expect(
      failure(await rpc("Tickets.comment", { id: ticket.id, body: "x", mentions: ["mem_none"] }, people.owner))
    ).toMatchObject({ _tag: "MemberNotActive" })

    await relay(workspace)
    const note = (await inbox(people.service)).find((n) => n.kind === "chat.mention")
    expect(note).toMatchObject({
      subjectType: "ticket",
      subjectId: ticket.id,
      actor: { kind: "member", id: ownerId },
      data: { number: ticket.number, comment: "@Service kun jij dit oppakken?" }
    })

    const detail = ok(await rpc("Tickets.get", { id: ticket.id }, people.owner))
    expect(detail.comments.map((c) => c.body)).toEqual([
      "@Service kun jij dit oppakken?",
      "Eerst even de foto's opvragen."
    ])
    expect(detail.ticket.commentCount).toBe(2)
    expect(detail.watching).toBe(false)
    ok(await rpc("Tickets.watch", { id: ticket.id }, people.owner))
    expect(ok(await rpc("Tickets.get", { id: ticket.id }, people.owner)).watching).toBe(true)
    ok(await rpc("Tickets.unwatch", { id: ticket.id }, people.owner))
    expect(ok(await rpc("Tickets.get", { id: ticket.id }, people.owner)).watching).toBe(false)
  })

  it("refuses a role without Klantenservice, lets one that only looks look, and keeps the trash for Beheren", async () => {
    const ticket = ok(await rpc("Tickets.create", { title: "Rechten" }, people.owner)).tickets[0]!
    expect(failure(await rpc("Tickets.list", {}, people.finance))).toMatchObject({
      _tag: "Forbidden",
      permission: "support",
      level: 1
    })
    expect(ok(await rpc("Tickets.get", { id: ticket.id }, people.view)).ticket.title).toBe("Rechten")
    expect(failure(await rpc("Tickets.create", { title: "Mag niet" }, people.view))).toMatchObject({
      _tag: "Forbidden",
      permission: "support",
      level: 2
    })
    expect(failure(await rpc("Tickets.setStatus", { ids: [ticket.id], status: "done" }, people.view))).toMatchObject({
      _tag: "Forbidden"
    })
    expect(failure(await rpc("Tickets.comment", { id: ticket.id, body: "Hoi" }, people.view))).toMatchObject({
      _tag: "Forbidden"
    })
    // Klantenservice has Beheren: the trash is theirs.
    ok(await rpc("Tickets.trash", { ids: [ticket.id] }, people.service))
    ok(await rpc("Tickets.putBack", { ids: [ticket.id] }, people.service))
  })

  it("writes, moves, assigns and comments through /v1 and MCP, and refuses a key that only looks", async () => {
    const writer = await keyFor(people.owner, "Helpdesk-koppeling", "service")
    const reader = await keyFor(people.owner, "Alleen kijken", "view")
    // Its own key for MCP: a key may make ten calls a second.
    const agent = await keyFor(people.owner, "Agent", "service")

    const made = await send("POST", "/tickets", writer, {
      title: "Via de API",
      priority: "high",
      assignee_ids: [serviceId],
      labels: ["Klantenservice"],
      due_at: "2026-11-20T09:00:00.000Z"
    })
    expect(made.status).toBe(200)
    expect(made.body).toMatchObject({
      title: "Via de API",
      status: "intake",
      priority: "high",
      assignees: [{ id: serviceId }],
      labels: ["Klantenservice"],
      due_at: "2026-11-20T09:00:00.000Z",
      source: "manual"
    })
    const id = made.body.id as string

    const moved = await send("POST", `/tickets/${id}/status`, writer, { status: "awaiting_reply" })
    expect(moved.body.status).toBe("awaiting_reply")
    const patched = await send("PATCH", `/tickets/${id}`, writer, { due_at: null, labels: [] })
    expect(patched.body).toMatchObject({ due_at: null, labels: [] })
    const unassigned = await send("POST", `/tickets/${id}/unassign`, writer, { member_id: serviceId })
    expect(unassigned.body.assignees).toEqual([])
    const comment = await send("POST", `/tickets/${id}/comments`, writer, { body: "Doorgezet naar de leverancier." })
    expect(comment.status).toBe(200)
    expect(comment.body.author).toMatchObject({ kind: "api_key", name: "Helpdesk-koppeling" })
    const one = await send("GET", `/tickets/${id}`, writer)
    expect(one.body.comments.map((c: Json) => c.body)).toEqual(["Doorgezet naar de leverancier."])
    expect((await send("GET", "/tickets/tkt_none", writer)).status).toBe(404)
    expect((await send("POST", `/tickets/${id}/assign`, writer, { member_id: "mem_none" })).body.error).toMatchObject({
      code: "ValidationFailedV1",
      fields: { member_id: "not_active" }
    })

    const listed = await send("GET", "/tickets?view=open", reader)
    expect(listed.status).toBe(200)
    expect(listed.body.data.map((t: Json) => t.id)).toContain(id)
    const refused = await send("POST", "/tickets", reader, { title: "Mag niet" })
    expect(refused.status).toBe(403)
    expect(refused.body.error).toMatchObject({ code: "ScopeMissingV1", scope: "support.write" })

    const viaMcp = await mcpCall(agent, "create_ticket", { title: "Via MCP", status: "in_progress" })
    expect(viaMcp.isError).toBe(false)
    expect(viaMcp.value).toMatchObject({ title: "Via MCP", status: "in_progress" })
    const assigned = await mcpCall(agent, "assign_ticket", { ticket_id: viaMcp.value.id, member_id: serviceId })
    expect(assigned.value.assignees).toEqual([{ id: serviceId, name: expect.any(String) }])
    const done = await mcpCall(agent, "set_ticket_status", { ticket_id: viaMcp.value.id, status: "done" })
    expect(done.value.status).toBe("done")
    const said = await mcpCall(agent, "comment_on_ticket", { ticket_id: viaMcp.value.id, body: "Opgelost." })
    expect(said.value.body).toBe("Opgelost.")
    const page = await mcpCall(reader, "list_tickets", { view: "done" })
    expect(page.value.data.map((t: Json) => t.id)).toContain(viaMcp.value.id)
    expect((await mcpCall(reader, "get_ticket", { ticket_id: viaMcp.value.id })).value.comments).toHaveLength(1)
    expect((await mcpCall(reader, "create_ticket", { title: "Nee" })).isError).toBe(true)
  })
})
