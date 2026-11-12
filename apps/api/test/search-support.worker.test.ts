import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * `Search.records` over customer service (M11 step 6): tickets by number, title and description; mail threads by
 * subject, correspondent and text; chat messages by their words. Each kind answers only what the role may open: nothing
 * for a role without Klantenservice (finance), a DM only for its two, nothing from a deleted message, an archived
 * channel, the Prullenbak or spam, and nothing from another workspace. Within a kind the best match comes first.
 */

const deliver = async (to: string, raw: string) => {
  const response = await call("http://api.test/api/__dev/mail/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, raw })
  })
  expect(response.status).toBe(200)
  return (await response.json() as { threadId: string }).threadId
}

const mime = (lines: Record<string, string>, body: string) =>
  [...Object.entries(lines).map(([k, v]) => `${k}: ${v}`), "MIME-Version: 1.0", "", body].join("\r\n")

type Role = "owner" | "service" | "view" | "finance"

describe("searching tickets, mail and chats", () => {
  const people = {} as Record<Role, string>
  let serviceId = ""
  let other = ""
  const ids = {
    ticket: "",
    ticketNumber: 0,
    described: "",
    trashed: "",
    thread: "",
    bodyThread: "",
    trashedThread: "",
    channelMessage: "",
    reply: "",
    parent: "",
    dmMessage: "",
    deleted: "",
    archived: "",
    general: "",
    dm: ""
  }

  const search = (role: Role | "other", q: string, kinds?: Array<"ticket" | "thread" | "message">, limit?: number) =>
    rpc("Search.records", {
      q,
      ...(kinds === undefined ? {} : { kinds }),
      ...(limit === undefined ? {} : { limit })
    }, role === "other" ? other : people[role])

  beforeAll(async () => {
    const owner = await person("search-owner", "Zoeken B.V.")
    people.owner = owner.cookie
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const colleagues = (["service", "view", "finance"] as const).map((role) => ({
      role,
      email: `search-${run}-${role}@invited.test`
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

    // Tickets: one by its title, one by its description only, one in the Prullenbak.
    const made = ok(await rpc("Tickets.create", { title: "Zeeland pakket kwijt" }, people.owner)).tickets[0]!
    ids.ticket = made.id
    ids.ticketNumber = made.number
    ids.described = ok(
      await rpc("Tickets.create", { title: "Levering vertraagd", description: "Klant woont in Zeeland" }, people.owner)
    ).tickets[0]!.id
    ids.trashed = ok(await rpc("Tickets.create", { title: "Zeeland dubbel" }, people.owner)).tickets[0]!.id
    ok(await rpc("Tickets.trash", { ids: [ids.trashed] }, people.owner))

    // Mail: a thread by its subject, one by its text only, and one in the Prullenbak.
    const box = ok(
      await rpc(
        "Mailboxes.connect",
        { provider: "forward", address: "support@zoeken-bv.nl", label: "Zoeken" },
        people.owner
      )
    )
    const to = box.forwardingAddress!
    const from = `Marit Visser <marit-${run}@voorbeeld.nl>`
    ids.thread = await deliver(
      to,
      mime({
        From: from,
        To: to,
        Subject: "Zeeland: waar blijft mijn pakket?",
        "Message-ID": `<s1-${run}@voorbeeld.nl>`
      }, "Hoi")
    )
    ids.bodyThread = await deliver(
      to,
      mime(
        { From: from, To: to, Subject: "Vraag over retour", "Message-ID": `<s2-${run}@voorbeeld.nl>` },
        "Ik woon in Zeeland en wil iets terugsturen."
      )
    )
    ids.trashedThread = await deliver(
      to,
      mime({ From: from, To: to, Subject: "Zeeland spam", "Message-ID": `<s3-${run}@voorbeeld.nl>` }, "Weg ermee")
    )
    ok(await rpc("Threads.trash", { ids: [ids.trashedThread] }, people.owner))

    // Chats: #algemeen with a message and an answer kept to its thread, a DM between the owner and service, a message
    // taken back, and a channel archived with its messages.
    ids.general = ok(await rpc("Chats.list", undefined, people.owner)).conversations[0]!.id
    ids.channelMessage = ok(
      await rpc(
        "Chats.send",
        { conversationId: ids.general, body: "De zending naar Zeeland is vertraagd" },
        people.view
      )
    ).message.id
    ids.parent = ok(await rpc("Chats.send", { conversationId: ids.general, body: "Wie pakt dit op?" }, people.owner))
      .message.id
    ids.reply = ok(
      await rpc(
        "Chats.send",
        { conversationId: ids.general, body: "Ik bel de klant in Zeeland", replyTo: ids.parent },
        people.service
      )
    ).message.id
    ids.dm = ok(await rpc("Chats.openDm", { memberId: serviceId }, people.owner)).id
    ids.dmMessage = ok(
      await rpc("Chats.send", { conversationId: ids.dm, body: "Onder ons: Zeeland gaat mis" }, people.owner)
    ).message.id
    ids.deleted = ok(await rpc("Chats.send", { conversationId: ids.general, body: "Zeeland typfout" }, people.owner))
      .message.id
    ok(await rpc("Chats.deleteMessage", { messageId: ids.deleted }, people.owner))
    const channel = ok(await rpc("Chats.createChannel", { name: "Oud kanaal" }, people.service))
    ids.archived = ok(
      await rpc(
        "Chats.send",
        { conversationId: channel.conversation.id, body: "Zeeland in het archief" },
        people.service
      )
    ).message.id
    ok(await rpc("Shared.undo", { token: channel.undo!.token }, people.service))

    // Another workspace with the same words.
    const elsewhere = await person("search-other", "Elders B.V.")
    other = elsewhere.cookie
    ok(await rpc("Tickets.create", { title: "Zeeland elders" }, other))
    const otherGeneral = ok(await rpc("Chats.list", undefined, other)).conversations[0]!.id
    ok(await rpc("Chats.send", { conversationId: otherGeneral, body: "Zeeland elders" }, other))
  }, 180_000)

  it("finds tickets, threads and messages by their words, each opening where it lives", async () => {
    const hits = ok(await search("owner", "zeeland"))
    const of = (kind: string) => hits.filter((h) => h.kind === kind)
    expect(of("ticket").map((h) => h.id)).toEqual([ids.ticket, ids.described])
    expect(of("ticket")[0]).toMatchObject({
      title: `#${ids.ticketNumber}`,
      subtitle: "Zeeland pakket kwijt",
      href: `/tickets/${ids.ticket}`
    })
    expect(of("thread").map((h) => h.id)).toEqual([ids.thread, ids.bodyThread])
    expect(of("thread")[0]).toMatchObject({
      title: "Zeeland: waar blijft mijn pakket?",
      subtitle: "Marit Visser",
      href: `/inbox?thread=${ids.thread}`
    })
    // Newest first; the deleted message and the archived channel's are not there.
    expect(of("message").map((h) => h.id)).toEqual([ids.dmMessage, ids.reply, ids.channelMessage])
    expect(of("message")[2]).toMatchObject({
      title: "De zending naar Zeeland is vertraagd",
      subtitle: `#algemeen · search-${run}-view`,
      href: `/chats?id=${ids.general}&message=${ids.channelMessage}`
    })
    // An answer kept to its thread opens on the message it answers; a DM is named after the other one.
    expect(of("message")[1]!.href).toBe(`/chats?id=${ids.general}&message=${ids.parent}`)
    expect(of("message")[0]!.subtitle).toBe(`search-${run}-service · Persoon search-owner`)
  })

  it("puts a ticket's number first, and keeps to the limit per kind", async () => {
    const byNumber = ok(await search("owner", `#${ids.ticketNumber}`, ["ticket"]))
    expect(byNumber[0]!.id).toBe(ids.ticket)
    expect(ok(await search("owner", String(ids.ticketNumber), ["ticket"]))[0]!.id).toBe(ids.ticket)
    const one = ok(await search("owner", "zeeland", ["ticket", "thread", "message"], 1))
    expect(one.map((h) => h.kind)).toEqual(["ticket", "thread", "message"])
    expect(ok(await search("owner", "   ", ["ticket"]))).toEqual([])
  })

  it("shows a DM only to its two, and nothing of customer service to a role without it", async () => {
    const view = ok(await search("view", "zeeland"))
    expect(view.filter((h) => h.kind === "message").map((h) => h.id)).toEqual([ids.reply, ids.channelMessage])
    expect(view.filter((h) => h.kind === "ticket")).toHaveLength(2)
    expect(view.filter((h) => h.kind === "thread")).toHaveLength(2)
    const service = ok(await search("service", "zeeland", ["message"]))
    expect(service.map((h) => h.id)).toContain(ids.dmMessage)
    // Finance cannot read the inbox, the tickets or the chats: the search says nothing, rather than refusing.
    expect(ok(await search("finance", "zeeland"))).toEqual([])
    expect(failure(await rpc("Chats.list", undefined, people.finance))).toMatchObject({ _tag: "Forbidden" })
  })

  it("never reaches into another workspace", async () => {
    const mine = ok(await search("owner", "elders"))
    expect(mine).toEqual([])
    const theirs = ok(await search("other", "zeeland"))
    expect(theirs.map((h) => [h.kind, h.title])).toEqual([["ticket", "#1"], ["message", "Zeeland elders"]])
    const known = new Set(Object.values(ids))
    expect(theirs.filter((h) => known.has(h.id))).toEqual([])
  })
})
