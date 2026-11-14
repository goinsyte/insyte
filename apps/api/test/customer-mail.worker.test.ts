import { mintId } from "@insyte/domain/Ids"
import { describe, expect, it } from "vitest"
import { failure, join, mailsAbout, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * Mail the shopper from anywhere (M7 9.1, M8 10.2a, M11). The team's words to an order's shopper go once the undo
 * window has passed, in the store's name; the caller's id sends them once, and Undo calls them off. "Track & trace-update
 * sturen" tells each order's newest parcel once, and says why the others were left out. Forwarding drafts the shopper's
 * mail for a leg. A ticket's "Klant informeren" mails the shopper from the team's mailbox and waits on their answer,
 * with one undo for both. Every read and write stays inside the member's own stores; an agent's key cannot send.
 */

const orderNumbered = async (cookie: string, number: string) =>
  ok(await rpc("Orders.list", { limit: 50 }, cookie)).rows.find((o) => o.number === number)!

const mailEvents = async (workspace: string) => (await outboxOf(workspace)).filter((e) => e.event === "order.mail")

/** The one order mail still waiting to go. */
const pendingMail = (events: Awaited<ReturnType<typeof mailEvents>>) => {
  const waiting = events.filter((e) => e.relayedAt === null && !e.cancelled)
  expect(waiting).toHaveLength(1)
  return (waiting[0]!.payload as { mailId: string }).mailId
}

const dev = (path: string) => call(`http://api.test/api/__dev/mail/${path}`, { method: "POST" })

const key = async (cookie: string, label: string, stores: "all" | Array<string>, agent: boolean) =>
  ok(
    await rpc("ApiKeys.create", {
      label: `${label} ${run}`,
      access: { kind: "role", roleId: "service" } as never,
      stores,
      expiresInDays: 30,
      ips: [],
      agent
    }, cookie)
  ).secret

/** A member like Klantenservice, held to another store. */
const fencedMember = async (store: { cookie: string; workspace: string }, tag: string) => {
  const made = ok(await rpc("Roles.create", { label: `Andere winkel ${tag}`, from: "service" }, store.cookie))
  const role = made.roles.roles.find((r) => r.id === made.id)!
  ok(
    await rpc("Roles.update", {
      id: role.id,
      levels: role.levels,
      specials: role.specials,
      refundLimit: role.refundLimit,
      stores: ["store_elsewhere"]
    }, store.cookie)
  )
  const email = `cml-${run}-${tag}@invited.test`
  ok(await rpc("Invitations.send", { rows: [{ email, roleId: role.id, stores: "all" }] }, store.cookie))
  await pastUndo(store.workspace)
  await relay(store.workspace)
  return join(email)
}

// A JSON-RPC answer, read loosely as a client would.
// eslint-disable-next-line typescript/no-explicit-any
type Json = any
const MCP_VERSION = "2026-07-28"
let mcpId = 0

const tool = async (token: string, name: string, args: Record<string, unknown>) => {
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
      id: ++mcpId,
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
  const message: Json = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => "id" in m)
    : JSON.parse(text)
  return { isError: message.result.isError as boolean, body: JSON.parse(message.result.content[0].text) as Json }
}

describe("mail the shopper", () => {
  it("mails an order's shopper after the window, once per id, with undo, inside the member's stores", async () => {
    const store = await importedStore("cml-order")
    const open = await orderNumbered(store.cookie, "#1001")
    const anonymous = await orderNumbered(store.cookie, "#1005")
    const to = open.customerEmail!

    expect(failure(await rpc("Orders.emailCustomer", { orderId: open.id, subject: "Hoi", body: " \n " }, store.cookie)))
      .toMatchObject({ _tag: "Invalid", fields: { body: "required" } })
    expect(
      failure(await rpc("Orders.emailCustomer", { orderId: anonymous.id, subject: "Hoi", body: "x" }, store.cookie))
    )
      .toMatchObject({ _tag: "CustomerMailRefused", reason: "no_email" })
    expect(failure(await rpc("Orders.emailCustomer", { orderId: "ord_none", subject: "Hoi", body: "x" }, store.cookie)))
      .toMatchObject({ _tag: "NotFound" })
    // A subject is one header line: no line break smuggled into it.
    expect(
      failure(
        await rpc(
          "Orders.emailCustomer",
          { orderId: open.id, subject: "Hoi\r\nBcc: x@y.test", body: "x" },
          store.cookie
        )
      )
    ).toMatchObject({ _tag: "Invalid", fields: { subject: "invalid" } })

    // Put in line with an undo; Undo calls it off, so nothing leaves.
    const first = ok(
      await rpc(
        "Orders.emailCustomer",
        { orderId: open.id, subject: "Over je bestelling", body: "Hoi,\n\nEerst." },
        store.cookie
      )
    )
    expect(first.mail).toMatchObject({ orderId: open.id, kind: "message", state: "scheduled", to })
    ok(await rpc("Shared.undo", { token: first.undo!.token }, store.cookie))
    await pastUndo(store.workspace)
    await relay(store.workspace)
    expect(await mailsAbout(to, first.mail.id)).toEqual([])
    expect((await mailEvents(store.workspace)).map((e) => e.cancelled)).toEqual([true])

    // The caller's id: asked twice, one mail, the second answer without an undo of its own.
    const id = mintId("oml")
    const body = "Hoi Anna,\n\nJe bestelling komt eraan.\n\nGroet,\nDe winkel"
    const sent = ok(
      await rpc("Orders.emailCustomer", { orderId: open.id, subject: "Onderweg", body, id }, store.cookie)
    )
    const again = ok(
      await rpc("Orders.emailCustomer", { orderId: open.id, subject: "Onderweg", body, id }, store.cookie)
    )
    expect(again).toMatchObject({ mail: { id }, undo: null })
    expect(sent.mail.id).toBe(id)
    const other = await orderNumbered(store.cookie, "#1003")
    expect(failure(await rpc("Orders.emailCustomer", { orderId: other.id, subject: "x", body: "x", id }, store.cookie)))
      .toMatchObject({ _tag: "Conflict", reason: "mail_id_taken" })
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const mails = await mailsAbout(to, id)
    expect(mails).toHaveLength(1)
    expect(mails[0]).toMatchObject({ kind: "order.message" })
    expect(mails[0]?.sender).toBeTruthy()
    // Gone is gone: its undo no longer calls it off.
    expect(failure(await rpc("Shared.undo", { token: sent.undo!.token }, store.cookie))).toMatchObject({
      _tag: "Conflict"
    })

    // A member held to another store does not find the order.
    const fenced = await fencedMember(store, "order")
    expect(failure(await rpc("Orders.emailCustomer", { orderId: open.id, subject: "x", body: "x" }, fenced)))
      .toMatchObject({ _tag: "NotFound" })

    // The same over `/v1`, once per Idempotency-Key; a key held to another store does not find the order.
    const token = await key(store.cookie, "Mail", "all", false)
    const v1 = (secret: string, idem: string) =>
      call(`http://api.public.test/v1/orders/${open.id}/emails`, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "idempotency-key": idem, "content-type": "application/json" },
        body: JSON.stringify({ subject: "Via de API", body: "Hoi,\n\nVia de API." })
      })
    const posted = await v1(token, `v1-mail-${run}`)
    expect(posted.status).toBe(200)
    const mail = await posted.json() as { id: string; state: string; kind: string }
    expect(mail).toMatchObject({ state: "scheduled", kind: "message" })
    expect((await (await v1(token, `v1-mail-${run}`)).json() as { id: string }).id).toBe(mail.id)
    const elsewhere = await key(store.cookie, "Andere winkel", ["store_elsewhere"], false)
    expect((await v1(elsewhere, `v1-elsewhere-${run}`)).status).toBe(404)
    const closed = await call(`http://api.public.test/v1/orders/${anonymous.id}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "idempotency-key": `v1-anon-${run}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ subject: "x", body: "x" })
    })
    expect(closed.status).toBe(409)

    // Over MCP with the same key; an agent's key is refused.
    const viaMcp = await tool(token, "email_order_customer", {
      order_id: open.id,
      subject: "Via MCP",
      body: "Hoi,\n\nVia MCP.",
      idempotency_key: `mcp-mail-${run}`
    })
    expect(viaMcp.isError).toBe(false)
    expect(viaMcp.body).toMatchObject({ order_id: open.id, state: "scheduled" })
    const agent = await key(store.cookie, "Agent", "all", true)
    const refused = await tool(agent, "email_order_customer", {
      order_id: open.id,
      subject: "x",
      body: "x",
      idempotency_key: `agent-mail-${run}`
    })
    expect(refused.isError).toBe(true)
    expect(refused.body).toMatchObject({ error: { code: "ActionNotAllowedV1", action: "email_order_customer" } })
    // Over `/v1` an agent's key does not mail a shopper either: the key door sends its writes to MCP.
    const byAgent = await v1(agent, `v1-agent-${run}`)
    expect(byAgent.status).toBe(403)
    expect(await byAgent.json()).toMatchObject({ error: { code: "ActionNotAllowedV1", reason: "use_mcp" } })
  })

  it("sends track and trace once per parcel, says why the rest were left out, with one undo", async () => {
    const store = await importedStore("cml-track")
    const rows = ok(await rpc("Orders.list", { limit: 50 }, store.cookie)).rows
    const by = (n: string) => rows.find((o) => o.number === n)!
    const ids = ["#1001", "#1002", "#1003", "#1004", "#1005"].map((n) => by(n).id)

    // Undone first: nothing leaves, and the order no longer shows it as sent.
    const tried = ok(await rpc("Orders.sendTrackingUpdate", { ids }, store.cookie))
    expect(tried.orders.map((o) => o.number)).toEqual(["#1003"])
    expect(tried.orders.every((o) => o.trackingSentAt !== null)).toBe(true)
    expect(Object.fromEntries(tried.skipped.map((s) => [rows.find((o) => o.id === s.id)!.number, s.reason]))).toEqual({
      "#1001": "no_tracking",
      "#1002": "delivered",
      "#1004": "closed",
      "#1005": "closed"
    })
    ok(await rpc("Shared.undo", { token: tried.undo!.token }, store.cookie))
    expect((await orderNumbered(store.cookie, "#1003")).trackingSentAt).toBeNull()

    // Refused for good: the order shows it was not sent, and a second press tries it afresh.
    ok(await rpc("Orders.sendTrackingUpdate", { ids: [by("#1003").id] }, store.cookie))
    const bounced = pendingMail(await mailEvents(store.workspace))
    await dev(`refuse?reference=${bounced}`)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    await dev(`refuse?reference=${bounced}&off=1`)
    expect(await orderNumbered(store.cookie, "#1003")).toMatchObject({ trackingSentAt: null })
    expect((await orderNumbered(store.cookie, "#1003")).trackingFailedAt).not.toBeNull()

    // Sent for good: a second press tells no one twice.
    const sent = ok(await rpc("Orders.sendTrackingUpdate", { ids: [by("#1003").id] }, store.cookie))
    expect(sent.orders.map((o) => o.number)).toEqual(["#1003"])
    expect(ok(await rpc("Orders.sendTrackingUpdate", { ids: [by("#1003").id] }, store.cookie))).toMatchObject({
      orders: [],
      skipped: [{ id: by("#1003").id, reason: "already_told" }],
      undo: null
    })
    // The provider busy (429): the mail stays in line, and goes on a later try, once.
    const mailId = pendingMail(await mailEvents(store.workspace))
    await dev(`refuse?reference=${mailId}&busy=1`)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const to = by("#1003").customerEmail!
    expect(await mailsAbout(to, mailId)).toEqual([])
    const retry = (await mailEvents(store.workspace)).filter((e) => e.relayedAt === null && !e.cancelled)
    expect(retry.map((e) => e.payload)).toEqual([expect.objectContaining({ mailId, attempt: 2 })])
    expect(retry[0]!.due).toBe(false)
    await dev(`refuse?reference=${mailId}&busy=1&off=1`)
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const mails = await mailsAbout(to, mailId)
    expect(mails).toHaveLength(1)
    expect(mails[0]).toMatchObject({ kind: "order.message" })
    expect(await orderNumbered(store.cookie, "#1003")).toMatchObject({ trackingFailedAt: null })
    expect((await orderNumbered(store.cookie, "#1003")).trackingSentAt).not.toBeNull()

    // A member held to another store does not find the orders.
    const fenced = await fencedMember(store, "track")
    expect(failure(await rpc("Orders.sendTrackingUpdate", { ids: [by("#1002").id] }, fenced))).toMatchObject({
      _tag: "NotFound"
    })
  })

  it("drafts forwarding's mail for a leg's shopper, inside the member's stores", async () => {
    const store = await importedStore("cml-draft")
    const leg = ok(await rpc("Forwarding.list", { view: "to_forward" }, store.cookie)).rows[0]!
    const draft = ok(await rpc("Forwarding.customerDraft", { id: leg.id }, store.cookie))
    expect(draft).toMatchObject({
      legId: leg.id,
      orderId: leg.orderId,
      subject: `Over je bestelling ${leg.orderNumber}`
    })
    expect(draft.to).toMatch(/@example\.com$/)
    expect(draft.body).toMatch(/^Hoi Klant,\n\nBedankt voor je bestelling/)
    expect(draft.body).toMatch(/\n\nGroet,\n.+$/)
    expect(failure(await rpc("Forwarding.customerDraft", { id: "fwd_none" }, store.cookie))).toMatchObject({
      _tag: "NotFound"
    })
    const fenced = await fencedMember(store, "draft")
    expect(failure(await rpc("Forwarding.customerDraft", { id: leg.id }, fenced))).toMatchObject({ _tag: "NotFound" })
  })

  it("informs a ticket's shopper from the team's mailbox, waits on their answer, and undoes both together", async () => {
    const store = await importedStore("cml-ticket")
    const order = await orderNumbered(store.cookie, "#1003")
    const made = ok(
      await rpc("Tickets.create", {
        title: "Waar blijft mijn pakket",
        related: { type: "order", id: order.id }
      }, store.cookie)
    )
    const ticket = made.tickets[0]!
    const loose = ok(await rpc("Tickets.create", { title: "Zonder klant" }, store.cookie)).tickets[0]!

    // No mailbox yet, and a ticket about no one: said, nothing sent.
    expect(failure(await rpc("Tickets.emailCustomer", { id: ticket.id }, store.cookie))).toMatchObject({
      _tag: "NoMailbox"
    })
    ok(
      await rpc(
        "Mailboxes.connect",
        { provider: "forward", address: `cml-${run}@winkel.nl`, label: "Klantenservice" },
        store.cookie
      )
    )
    expect(failure(await rpc("Tickets.emailCustomer", { id: loose.id }, store.cookie))).toMatchObject({
      _tag: "NoCustomerAddress"
    })

    // Mailed: the ticket waits on the answer, its activity says so, the thread is linked to it. Undo takes all back.
    const mailed = ok(await rpc("Tickets.emailCustomer", { id: ticket.id }, store.cookie))
    expect(mailed.ticket.status).toBe("awaiting_reply")
    expect(mailed.to).toBe(order.customerEmail)
    const thread = ok(await rpc("Threads.get", { id: mailed.threadId }, store.cookie))
    expect(thread.messages[0]).toMatchObject({ sendState: "scheduled", subject: "Een update over je bestelling #1003" })
    const comments = ok(await rpc("Tickets.get", { id: ticket.id }, store.cookie)).comments
    expect(comments.find((c) => c.kind === "email_sent")?.body).toBe(
      "Klant gemaild met de laatste stand van zaken. Wacht op antwoord."
    )
    ok(await rpc("Shared.undo", { token: mailed.undo!.token }, store.cookie))
    const back = ok(await rpc("Tickets.get", { id: ticket.id }, store.cookie))
    expect(back.ticket.status).toBe(ticket.status)
    expect(back.comments.filter((c) => c.kind === "email_sent")).toEqual([])
    expect(failure(await rpc("Threads.get", { id: mailed.threadId }, store.cookie))).toMatchObject({ _tag: "NotFound" })

    // Mailed for good, with the team's own words: it leaves after the window.
    const own = ok(
      await rpc("Tickets.emailCustomer", { id: ticket.id, body: "Hoi Bram,\n\nHij is onderweg." }, store.cookie)
    )
    await pastUndo(store.workspace)
    await relay(store.workspace)
    const gone = ok(await rpc("Threads.get", { id: own.threadId }, store.cookie))
    expect(gone.messages[0]).toMatchObject({ sendState: "sent" })
    expect(gone.messages[0]?.bodyText).toContain("Hij is onderweg.")

    // Next time in the shopper's thread, not in a newer one with the supplier; the caller's id sends it once.
    const supplier = ok(
      await rpc("Threads.compose", {
        to: `levering-${run}@leverancier.test`,
        subject: "Pakket #1003",
        body: "Wanneer gaat het weg?"
      }, store.cookie)
    )
    ok(await rpc("Threads.linkTicket", { threadId: supplier.thread.id, ticketId: ticket.id }, store.cookie))
    const mailId = mintId("eml")
    const next = ok(await rpc("Tickets.emailCustomer", { id: ticket.id, mailId }, store.cookie))
    expect(next).toMatchObject({ threadId: own.threadId, to: order.customerEmail })
    expect(next.undo).not.toBeNull()
    const twice = ok(await rpc("Tickets.emailCustomer", { id: ticket.id, mailId }, store.cookie))
    expect(twice).toMatchObject({ threadId: own.threadId, to: order.customerEmail, undo: null })
    const shopperThread = ok(await rpc("Threads.get", { id: own.threadId }, store.cookie))
    expect(shopperThread.messages.filter((m) => m.id === mailId)).toHaveLength(1)

    // A member held to another store does not find a ticket of this one.
    const fenced = await fencedMember(store, "ticket")
    expect(failure(await rpc("Tickets.emailCustomer", { id: ticket.id }, fenced))).toMatchObject({ _tag: "NotFound" })
  })
})
