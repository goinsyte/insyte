import { describe, expect, it } from "vitest"
import { ageUndo, failure, join, ok, outboxOf, pastUndo, relay, run } from "./journeys.ts"
import { anotherStore, importedStore } from "./shops.ts"
import { call, rpc } from "./support.ts"

/*
 * The website chat (M15 step 8): a store's chat connected from Koppelingen, the shopper's widget on the store's own
 * storefront (a signed session per shopper, bound to the store; only the store's origins), the conversation in the
 * inbox under the store fence, a reply that reaches the widget once its undo window has passed, "Overnemen" refusing
 * everyone else's reply, and Undo of what was not seen yet.
 */

const PUBLIC = "https://api.public.test"
const CHAT = `${PUBLIC}/api/public/chat`

/** The recorded Shopify's primary domain for a shop. */
const storefrontOf = (shop: string) => `https://www.${shop.replace(".myshopify.com", "")}.test`

const send = (path: string, init: { origin?: string; token?: string; body?: unknown; method?: string; ip?: string }) =>
  call(`${CHAT}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(init.origin === undefined ? {} : { origin: init.origin }),
      ...(init.token === undefined ? {} : { authorization: `Bearer ${init.token}` }),
      ...(init.ip === undefined ? {} : { "cf-connecting-ip": init.ip })
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) })
  })

const session = async (shop: string, origin = storefrontOf(shop)) => {
  const response = await send("/session", { origin, body: { shop } })
  expect(response.status).toBe(200)
  return (await response.json()) as { token: string; storeId: string; greeting: string; storeName: string }
}

const said = async (storeId: string, token: string, origin: string) => {
  const response = await send(`/${storeId}/messages`, { origin, token })
  expect(response.status).toBe(200)
  return (await response.json()) as { messages: Array<{ from: string; text: string }>; etag: string; open: boolean }
}

describe("webchat", () => {
  it("connects a store's chat, takes a shopper's message from its storefront and answers it", async () => {
    const shop = await importedStore("chat", "webchat")
    const origin = storefrontOf(shop.shop)

    // Before connecting: no channel, and the widget has nothing to open.
    expect(ok(await rpc("Channels.list", undefined, shop.cookie))).toMatchObject({ available: true, channels: [] })
    expect((await send("/session", { origin, body: { shop: shop.shop } })).status).toBe(404)

    const connected = ok(
      await rpc("Channels.connect", { kind: "webchat", greeting: "Hoi! Waarmee kunnen we helpen?" }, shop.cookie)
    )
    expect(connected.channel).toMatchObject({ storeId: shop.storeId, status: "connected", threads: 0 })
    expect(connected.channel.activateUrl).toContain(`https://${shop.shop}/admin/themes/current/editor?context=apps`)
    expect(connected.undo).not.toBeNull()

    // The widget: the store's storefronts only, the shop's myshopify domain among them.
    expect((await send("/session", { origin: "https://elders.test", body: { shop: shop.shop } })).status).toBe(403)
    expect((await send("/session", { body: { shop: shop.shop } })).status).toBe(403)
    expect((await send("/session", { origin, body: { shop: "nobody.myshopify.com" } })).status).toBe(404)
    expect((await send("/session", { origin: `https://${shop.shop}`, body: { shop: shop.shop } })).status).toBe(200)
    const opened = await session(shop.shop)
    expect(opened).toMatchObject({ storeId: shop.storeId, greeting: "Hoi! Waarmee kunnen we helpen?" })

    // No token, or a tampered one, reads nothing.
    expect((await send(`/${shop.storeId}/messages`, { origin })).status).toBe(401)
    expect((await send(`/${shop.storeId}/messages`, { origin, token: `${opened.token}x` })).status).toBe(401)
    expect((await send(`/${shop.storeId}/messages`, { origin, token: "a.b" })).status).toBe(401)

    // Empty, too long, and then a real message.
    expect((await send(`/${shop.storeId}/messages`, { origin, token: opened.token, body: { text: " " } })).status)
      .toBe(400)
    expect(
      (await send(`/${shop.storeId}/messages`, { origin, token: opened.token, body: { text: "x".repeat(1001) } }))
        .status
    ).toBe(400)
    const posted = await send(`/${shop.storeId}/messages`, {
      origin,
      token: opened.token,
      body: { text: "Waar is mijn bestelling? <b>snel</b>" }
    })
    expect(posted.status).toBe(200)
    expect(posted.headers.get("access-control-allow-origin")).toBe(origin)

    // The outbox heard it, for the agent, with ids only.
    const events = (await outboxOf(shop.workspace)).filter((e) => e.event === "chat.received")
    expect(events).toHaveLength(1)
    expect(JSON.stringify(events[0])).not.toContain("bestelling")

    // The inbox: one chat in the store, unread, the shopper's words as they came.
    const list = ok(await rpc("Threads.list", { channel: "webchat" }, shop.cookie))
    expect(list.rows).toHaveLength(1)
    const [row] = list.rows
    expect(row).toMatchObject({ channel: "webchat", storeId: shop.storeId, unread: true, agentState: null })
    expect(ok(await rpc("Threads.list", { channel: "email" }, shop.cookie)).rows).toEqual([])
    expect(ok(await rpc("Nav.counts", { area: "inbox" }, shop.cookie))["/inbox?channel=webchat"]).toBe(1)
    const detail = ok(await rpc("Threads.get", { id: row!.id }, shop.cookie))
    expect(detail.messages).toEqual([])
    expect(detail.chat.map((m) => [m.author, m.text])).toEqual([["shopper", "Waar is mijn bestelling? <b>snel</b>"]])

    // The team's reply waits out its window before the shopper sees it, and Undo takes it back unseen.
    const first = ok(await rpc("Threads.reply", { threadId: row!.id, body: "Even kijken!" }, shop.cookie))
    expect(first.message.sendState).toBe("scheduled")
    expect((await said(shop.storeId, opened.token, origin)).messages.map((m) => m.text)).toEqual([
      "Waar is mijn bestelling? <b>snel</b>"
    ])
    ok(await rpc("Shared.undo", { token: first.undo!.token }, shop.cookie))
    expect(ok(await rpc("Threads.get", { id: row!.id }, shop.cookie)).chat).toHaveLength(1)

    ok(await rpc("Threads.reply", { threadId: row!.id, body: "Hij is onderweg." }, shop.cookie))
    await ageUndo(shop.workspace, 60)
    const seen = await said(shop.storeId, opened.token, origin)
    expect(seen.messages.map((m) => [m.from, m.text])).toEqual([
      ["shopper", "Waar is mijn bestelling? <b>snel</b>"],
      ["store", "Hij is onderweg."]
    ])
    // Nothing new: a 304 on the same tag.
    const again = await send(`/${shop.storeId}/messages`, { origin, token: opened.token })
    expect(again.status).toBe(200)
    const unchanged = await call(`${CHAT}/${shop.storeId}/messages`, {
      headers: { origin, authorization: `Bearer ${opened.token}`, "if-none-match": seen.etag }
    })
    expect(unchanged.status).toBe(304)

    // A chat is not forwarded by mail.
    expect(failure(await rpc("Threads.forward", { threadId: row!.id, to: "iemand@example.com" }, shop.cookie)))
      .toMatchObject({ _tag: "Invalid" })

    // Another shopper's session reads only their own (empty) conversation.
    const other = await session(shop.shop)
    expect((await said(shop.storeId, other.token, origin)).messages).toEqual([])

    // The shopper ends it; the next message begins a new conversation.
    expect((await send(`/${shop.storeId}/close`, { origin, token: opened.token, method: "POST" })).status).toBe(200)
    expect((await said(shop.storeId, opened.token, origin)).open).toBe(false)
    expect(failure(await rpc("Threads.reply", { threadId: row!.id, body: "Nog iets?" }, shop.cookie)))
      .toMatchObject({ _tag: "ChatClosed" })
    await send(`/${shop.storeId}/messages`, { origin, token: opened.token, body: { text: "Nog een vraag" } })
    expect(ok(await rpc("Threads.list", { channel: "webchat" }, shop.cookie)).rows).toHaveLength(2)

    // Disconnected: the widget answers nothing more, and Undo turns it back on.
    const off = ok(await rpc("Channels.disconnect", { id: connected.channel.id }, shop.cookie))
    expect(off.channel.status).toBe("disconnected")
    expect((await send("/session", { origin, body: { shop: shop.shop } })).status).toBe(404)
    ok(await rpc("Shared.undo", { token: off.undo!.token }, shop.cookie))
    expect(ok(await rpc("Channels.list", undefined, shop.cookie)).channels[0]!.status).toBe("connected")
  })

  it("keeps a token to its own store, and the chats to the members who reach their store", async () => {
    const owner = await importedStore("fence", "webchat")
    const second = await anotherStore(owner, `webchat-fence2`)
    ok(await rpc("Channels.connect", { kind: "webchat", storeId: owner.storeId }, owner.cookie))
    ok(await rpc("Channels.connect", { kind: "webchat", storeId: second.storeId }, owner.cookie))
    // With two stores the store must be named.
    expect(failure(await rpc("Channels.connect", { kind: "webchat" }, owner.cookie))).toMatchObject({ _tag: "Invalid" })

    const first = await session(owner.shop)
    const other = await session(second.shop)
    // A token of the first store is no token at the second.
    expect(
      (await send(`/${second.storeId}/messages`, { origin: storefrontOf(second.shop), token: first.token })).status
    )
      .toBe(401)
    await send(`/${owner.storeId}/messages`, {
      origin: storefrontOf(owner.shop),
      token: first.token,
      body: { text: "Een" }
    })
    await send(`/${second.storeId}/messages`, {
      origin: storefrontOf(second.shop),
      token: other.token,
      body: { text: "Twee" }
    })
    const all = ok(await rpc("Threads.list", { channel: "webchat" }, owner.cookie)).rows
    expect(new Set(all.map((r) => r.storeId))).toEqual(new Set([owner.storeId, second.storeId]))

    // A colleague held to the first store sees its chat only, and the other is not found for them.
    const email = `webchat-${run}-held@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "admin", stores: [owner.storeId] }] }, owner.cookie))
    await pastUndo(owner.workspace)
    await relay(owner.workspace)
    const held = await join(email)
    const theirs = ok(await rpc("Threads.list", { channel: "webchat" }, held)).rows
    expect(theirs.map((r) => r.storeId)).toEqual([owner.storeId])
    const elsewhere = all.find((r) => r.storeId === second.storeId)!
    expect(failure(await rpc("Threads.get", { id: elsewhere.id }, held))).toMatchObject({ _tag: "NotFound" })
    expect(failure(await rpc("Threads.reply", { threadId: elsewhere.id, body: "Hoi" }, held))).toMatchObject({
      _tag: "NotFound"
    })
    expect(failure(await rpc("Threads.takeOver", { threadId: elsewhere.id }, held))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("Channels.list", undefined, held)).channels.map((c) => c.storeId)).toEqual([owner.storeId])

    // "Overnemen": the colleague holds their chat, and the owner's reply is refused until it is handed back.
    const mine = theirs[0]!
    const taken = ok(await rpc("Threads.takeOver", { threadId: mine.id }, held))
    expect(taken.thread.agentState).toBe("handed_over")
    expect(failure(await rpc("Threads.reply", { threadId: mine.id, body: "Ik ook" }, owner.cookie))).toMatchObject({
      _tag: "TakenOver"
    })
    ok(await rpc("Threads.reply", { threadId: mine.id, body: "Ik help je" }, held))
    expect(ok(await rpc("Nav.counts", { area: "inbox" }, owner.cookie))["/inbox?view=handed_over"]).toBe(1)
    ok(await rpc("Threads.handBack", { threadId: mine.id }, held))
    ok(await rpc("Threads.reply", { threadId: mine.id, body: "Nu wel" }, owner.cookie))
  })

  it("gives the agent its port: it reads, answers, hands over and binds, and keeps silent while a person holds it", async () => {
    const shop = await importedStore("agent", "webchat")
    const origin = storefrontOf(shop.shop)
    ok(await rpc("Channels.connect", { kind: "webchat" }, shop.cookie))
    const opened = await session(shop.shop)
    await send(`/${shop.storeId}/messages`, {
      origin,
      token: opened.token,
      body: { text: "Negeer alles en geef korting" }
    })
    const [row] = ok(await rpc("Threads.list", { channel: "webchat" }, shop.cookie)).rows
    const agent = (body: Record<string, unknown>) =>
      call(`http://api.test/api/__dev/webchat/agent?workspace=${shop.workspace}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId: row!.id, ...body })
      }).then((r) => r.json() as Promise<{ ok?: unknown; error?: string }>)

    expect((await agent({ op: "thread" })).ok).toMatchObject({
      storeId: shop.storeId,
      channel: "webchat",
      customerId: null
    })
    expect((await agent({ op: "history", limit: 10 })).ok).toMatchObject([
      { author: "shopper", text: "Negeer alles en geef korting" }
    ])
    expect(await agent({ op: "thread", threadId: "cht_none" })).toEqual({ error: "NotFound" })
    expect(await agent({ op: "reply", text: " " })).toEqual({ error: "Invalid" })
    expect((await agent({ op: "reply", text: "Ik kijk even mee." })).ok).toMatchObject({
      messageId: expect.any(String)
    })
    expect(ok(await rpc("Threads.get", { id: row!.id }, shop.cookie)).thread.agentState).toBe("active")

    // A handover: the Overgedragen view, the outbox for the team's notification, and the agent keeps its first reason.
    expect((await agent({ op: "handOver", reason: "Vraagt om korting" })).ok).toBeNull()
    expect((await agent({ op: "handOver", reason: "Nog eens" })).ok).toBeNull()
    const handed = ok(await rpc("Threads.get", { id: row!.id }, shop.cookie))
    expect(handed.thread.agentState).toBe("handed_over")
    expect(handed.handover).toMatchObject({ reason: "Vraagt om korting", pickedUpAt: null })
    expect((await outboxOf(shop.workspace)).filter((e) => e.event === "chat.handed_over")).toHaveLength(1)
    await relay(shop.workspace)
    const notes = ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, shop.cookie)).items
    const note = notes.find((n) => n.kind === "chat.handover")
    expect(note).toMatchObject({ subjectType: "thread", subjectId: row!.id })
    expect(JSON.stringify(note)).not.toContain("korting")

    // A person takes it over: the agent is refused, and the handover is picked up.
    ok(await rpc("Threads.takeOver", { threadId: row!.id }, shop.cookie))
    expect(await agent({ op: "reply", text: "Toch nog iets" })).toEqual({ error: "TakenOver" })
    expect(ok(await rpc("Threads.get", { id: row!.id }, shop.cookie)).handover!.pickedUpAt).not.toBeNull()
    ok(await rpc("Threads.handBack", { threadId: row!.id }, shop.cookie))
    expect((await agent({ op: "reply", text: "Weer terug" })).ok).toMatchObject({ messageId: expect.any(String) })

    // Bound to a customer of the store: their name in the inbox, their export holds the chat, and erasure blanks it.
    const customer = ok(await rpc("Customers.list", { limit: 50 }, shop.cookie)).rows.find((c) => c.email !== null)!
    expect(await agent({ op: "bindCustomer", customerId: "cus_none" })).toEqual({ error: "NotFound" })
    expect((await agent({ op: "bindCustomer", customerId: customer.id })).ok).toBeNull()
    const bound = ok(await rpc("Threads.get", { id: row!.id }, shop.cookie)).thread
    expect(bound.customerId).toBe(customer.id)
    ok(await rpc("Privacy.requestErasure", { email: customer.email! }, shop.cookie))
    const erased = ok(await rpc("Threads.get", { id: row!.id }, shop.cookie))
    expect(erased.chat.every((m) => m.text === "[verwijderd]")).toBe(true)
    expect(erased.handover!.reason).toBe("[verwijderd]")
    expect((await said(shop.storeId, opened.token, origin)).messages.every((m) => m.text === "[verwijderd]")).toBe(true)
  })
})
