import { beforeAll, describe, expect, it } from "vitest"
import { ageUndo, cookiesOf, failure, join, ok, password, pastUndo, person, post, relay, run } from "./journeys.ts"
import { rpc, sessionMe } from "./support.ts"

/*
 * Chats (step 13.4, M11 step 4): the team's `#algemeen` from the first look; messages paged, threaded, reacted to,
 * edited, taken back with Undo and pinned; a DM only its two can open; a mention that tells the teammate unless they
 * muted the conversation; a new channel with its own Undo; and the commands that post a card: `/ticket` at once with an
 * Undo that takes the ticket away again, `/annuleren` only on a confirm, and a refund refused until M13 has one. A
 * card's Undo holds five minutes for whoever ran it, from any of their sessions (13.4c).
 */

const inbox = async (cookie: string) =>
  ok(await rpc("Notifications.list", { tab: "inbox", cursor: null }, cookie)).items

describe("chats", () => {
  const people = { owner: "", service: "", view: "", finance: "" }
  let workspace = ""
  let ownerId = ""
  let ownerEmail = ""
  let serviceId = ""
  let general = ""

  beforeAll(async () => {
    const owner = await person("chats-owner", "Chats B.V.")
    people.owner = owner.cookie
    ownerEmail = owner.email
    const me = ok(await sessionMe(owner.cookie)).principals[0]!
    workspace = me.workspaceId
    ownerId = me.id
    const colleagues = (["service", "view", "finance"] as const).map((role) => ({
      role,
      email: `chats-${run}-${role}@invited.test`
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

  it("starts every team with #algemeen, and refuses a role without Klantenservice", async () => {
    const list = ok(await rpc("Chats.list", undefined, people.owner))
    expect(list.conversations).toHaveLength(1)
    expect(list.conversations[0]).toMatchObject({ kind: "channel", name: "algemeen", unread: 0, pinned: false })
    general = list.conversations[0]!.id
    // Made once: a second look, by a teammate, sees the same channel.
    expect(ok(await rpc("Chats.list", undefined, people.view)).conversations.map((c) => c.id)).toEqual([general])
    expect(failure(await rpc("Chats.list", undefined, people.finance))).toMatchObject({ _tag: "Forbidden" })
  })

  it("posts, pages, threads, reacts, edits, takes back with Undo and pins", async () => {
    const first = ok(
      await rpc("Chats.send", { conversationId: general, body: "  Goedemorgen allemaal  " }, people.owner)
    )
    expect(first.message).toMatchObject({
      body: "Goedemorgen allemaal",
      author: { kind: "member", id: ownerId },
      deleted: false,
      replyCount: 0
    })
    expect(failure(await rpc("Chats.send", { conversationId: general, body: "   " }, people.owner))).toMatchObject({
      _tag: "EmptyMessage"
    })
    for (let i = 1; i <= 3; i++) {
      ok(await rpc("Chats.send", { conversationId: general, body: `Bericht ${i}` }, people.view))
    }

    // The service colleague has not read it yet: four unread, none of them theirs.
    const unread = ok(await rpc("Chats.list", undefined, people.service)).conversations.find((c) => c.id === general)
    expect(unread).toMatchObject({ unread: 4, preview: "Bericht 3" })

    const page = ok(await rpc("Chats.messages", { conversationId: general, limit: 2 }, people.service))
    expect(page.messages.map((m) => m.body)).toEqual(["Bericht 2", "Bericht 3"])
    expect(page.before).not.toBeNull()
    const above = ok(
      await rpc("Chats.messages", { conversationId: general, before: page.before!, limit: 10 }, people.service)
    )
    expect(above.messages.map((m) => m.body)).toEqual(["Goedemorgen allemaal", "Bericht 1"])
    expect(above.before).toBeNull()
    ok(await rpc("Chats.markRead", { conversationId: general }, people.service))
    expect(ok(await rpc("Chats.list", undefined, people.service)).conversations[0]!.unread).toBe(0)

    // A thread: the reply counts on its parent; one also sent to the channel shows in the stream too.
    ok(
      await rpc(
        "Chats.send",
        { conversationId: general, body: "Ik pak het op", replyTo: first.message.id },
        people.service
      )
    )
    ok(
      await rpc("Chats.send", {
        conversationId: general,
        body: "Is opgelost",
        replyTo: first.message.id,
        alsoToChannel: true
      }, people.service)
    )
    const thread = ok(await rpc("Chats.thread", { messageId: first.message.id }, people.owner))
    expect(thread.parent).toMatchObject({ replyCount: 2, replyAuthors: [{ id: serviceId }] })
    expect(thread.replies.map((m) => m.body)).toEqual(["Ik pak het op", "Is opgelost"])
    const stream = ok(await rpc("Chats.messages", { conversationId: general }, people.owner)).messages
    expect(stream.map((m) => m.body)).toEqual([
      "Goedemorgen allemaal",
      "Bericht 1",
      "Bericht 2",
      "Bericht 3",
      "Is opgelost"
    ])

    // Reactions, by emoji with a count and whether it is the reader's own.
    ok(await rpc("Chats.react", { messageId: first.message.id, emoji: "👍", on: true }, people.service))
    const reacted = ok(await rpc("Chats.react", { messageId: first.message.id, emoji: "👍", on: true }, people.view))
    expect(reacted.message.reactions).toEqual([{ emoji: "👍", count: 2, mine: true }])
    const unreacted = ok(await rpc("Chats.react", { messageId: first.message.id, emoji: "👍", on: false }, people.view))
    expect(unreacted.message.reactions).toEqual([{ emoji: "👍", count: 1, mine: false }])

    // Only its author edits or takes back a message; to anyone else it is not there.
    const edited = ok(
      await rpc("Chats.editMessage", { messageId: first.message.id, body: "Goedemorgen team" }, people.owner)
    )
    expect(edited.message).toMatchObject({ body: "Goedemorgen team" })
    expect(edited.message.editedAt).not.toBeNull()
    expect(
      failure(await rpc("Chats.editMessage", { messageId: first.message.id, body: "Overgenomen" }, people.service))
    ).toMatchObject({ _tag: "NotFound" })
    const gone = ok(await rpc("Chats.deleteMessage", { messageId: stream[1]!.id }, people.view))
    expect(gone.message).toMatchObject({ deleted: true, body: "" })
    expect(gone.undo).not.toBeNull()
    ok(await rpc("Shared.undo", { token: gone.undo!.token }, people.view))
    const back = ok(await rpc("Chats.messages", { conversationId: general }, people.owner)).messages
    expect(back.find((m) => m.id === stream[1]!.id)).toMatchObject({ deleted: false, body: "Bericht 1" })

    // A pin in a channel takes Klantenservice · Bewerken.
    expect(
      failure(await rpc("Chats.pinMessage", { messageId: first.message.id, pinned: true }, people.view))
    ).toMatchObject({ _tag: "Forbidden" })
    ok(await rpc("Chats.pinMessage", { messageId: first.message.id, pinned: true }, people.service))
    const pins = ok(await rpc("Chats.pinnedMessages", { conversationId: general }, people.view))
    expect(pins.map((m) => m.id)).toEqual([first.message.id])
  })

  it("keeps a DM between its two, and tells who is named unless they muted it", async () => {
    const dm = ok(await rpc("Chats.openDm", { memberId: serviceId }, people.owner))
    expect(dm).toMatchObject({ kind: "dm", dmMemberId: serviceId })
    // Opened from either side, it is the same conversation.
    expect(ok(await rpc("Chats.openDm", { memberId: ownerId }, people.service)).id).toBe(dm.id)
    expect(failure(await rpc("Chats.openDm", { memberId: ownerId }, people.owner))).toMatchObject({ _tag: "Invalid" })

    ok(await rpc("Chats.send", { conversationId: dm.id, body: "Alleen voor jou" }, people.owner))
    expect(failure(await rpc("Chats.messages", { conversationId: dm.id }, people.view))).toMatchObject({
      _tag: "NotAMember"
    })
    expect(ok(await rpc("Chats.list", undefined, people.view)).conversations.map((c) => c.id)).not.toContain(dm.id)
    const members = ok(await rpc("Chats.members", { conversationId: dm.id }, people.service)).members
    expect(members.map((m) => m.id).toSorted()).toEqual([ownerId, serviceId].toSorted())

    ok(
      await rpc("Chats.send", {
        conversationId: general,
        body: "@Service kun jij #1001 bekijken?",
        mentions: [serviceId]
      }, people.owner)
    )
    await relay(workspace)
    const notes = (await inbox(people.service)).filter((n) => n.kind === "chat.mention")
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      subjectType: "conversation",
      subjectId: general,
      actor: { kind: "member", id: ownerId },
      data: { conversation: "algemeen", comment: "@Service kun jij #1001 bekijken?" }
    })

    const muted = ok(await rpc("Chats.mute", { conversationId: general, muted: true }, people.service))
    expect(muted.muted).toBe(true)
    ok(
      await rpc(
        "Chats.send",
        { conversationId: general, body: "@Service nog een", mentions: [serviceId] },
        people.owner
      )
    )
    await relay(workspace)
    expect((await inbox(people.service)).filter((n) => n.kind === "chat.mention")).toHaveLength(1)
  })

  it("makes a channel by its slug, refuses a taken name, and archives it again on Undo", async () => {
    expect(failure(await rpc("Chats.createChannel", { name: "Retouren" }, people.view))).toMatchObject({
      _tag: "Forbidden"
    })
    const made = ok(
      await rpc("Chats.createChannel", { name: "  #Retouren & Claims ", topic: "Alles over retour" }, people.service)
    )
    expect(made.conversation).toMatchObject({ kind: "channel", name: "retouren-claims", topic: "Alles over retour" })
    expect(failure(await rpc("Chats.createChannel", { name: "retouren claims" }, people.owner))).toMatchObject({
      _tag: "NameTaken",
      name: "retouren-claims"
    })
    ok(await rpc("Shared.undo", { token: made.undo!.token }, people.service))
    expect(ok(await rpc("Chats.list", undefined, people.owner)).conversations.map((c) => c.id)).not.toContain(
      made.conversation.id
    )
  })

  it("runs /ticket at once with its card's Undo, waits for a confirm on /annuleren, and refuses a refund", async () => {
    const ran = ok(
      await rpc(
        "Chats.runCommand",
        { conversationId: general, command: "ticket", arg: "Klant belt over levering" },
        people.owner
      )
    )
    expect(ran.message.action).toMatchObject({ command: "ticket", state: "done", by: "person", error: null })
    expect(ran.message.records).toEqual([{ kind: "ticket", id: expect.any(String) }])
    const ticketId = ran.message.records[0]!.id
    expect(ok(await rpc("Tickets.get", { id: ticketId }, people.owner)).ticket).toMatchObject({
      title: "Klant belt over levering",
      source: "chat"
    })
    expect(ran.undo).not.toBeNull()
    ok(await rpc("Shared.undo", { token: ran.undo!.token }, people.owner))
    expect(failure(await rpc("Tickets.get", { id: ticketId }, people.owner))).toMatchObject({ _tag: "NotFound" })
    const undone = ok(await rpc("Chats.messages", { conversationId: general }, people.owner)).messages
      .find((m) => m.id === ran.message.id)
    expect(undone).toMatchObject({ action: { state: "undone" }, records: [] })

    // A cancellation is irreversible: its card waits, and runs only when someone confirms it.
    const asked = ok(
      await rpc("Chats.runCommand", {
        conversationId: general,
        command: "cancel",
        target: { kind: "order", id: "ord_none" }
      }, people.owner)
    )
    expect(asked.message.action).toMatchObject({ command: "cancel", state: "confirm" })
    expect(asked.undo).toBeNull()
    const declined = ok(await rpc("Chats.declineAction", { actionId: asked.message.action!.id }, people.service))
    expect(declined.message.action).toMatchObject({ state: "declined", decidedBy: { id: serviceId } })
    expect(failure(await rpc("Chats.confirmAction", { actionId: asked.message.action!.id }, people.owner)))
      .toMatchObject({ _tag: "CommandRefused", reason: "decided" })

    const again = ok(
      await rpc("Chats.runCommand", {
        conversationId: general,
        command: "cancel",
        target: { kind: "order", id: "ord_none" }
      }, people.owner)
    )
    const confirmed = ok(await rpc("Chats.confirmAction", { actionId: again.message.action!.id }, people.owner))
    // The order is not there: the card says so in its footer, and nothing else happened.
    expect(confirmed.message.action).toMatchObject({ state: "failed", error: "Dit record bestaat niet meer." })

    expect(
      failure(
        await rpc("Chats.runCommand", {
          conversationId: general,
          command: "refund",
          target: { kind: "order", id: "ord_none" },
          arg: "10"
        }, people.owner)
      )
    ).toMatchObject({ _tag: "CommandRefused", reason: "unavailable" })
    expect(
      failure(await rpc("Chats.runCommand", { conversationId: general, command: "note", arg: "x" }, people.owner))
    ).toMatchObject({ _tag: "CommandRefused", reason: "target_required" })
  })
  it("keeps a card's Undo five minutes for who ran it, from any session, and refuses it after", async () => {
    const ticket = ok(await rpc("Tickets.create", { title: "Retour zonder label" }, people.owner)).tickets[0]!
    const assigned = ok(
      await rpc("Chats.runCommand", {
        conversationId: general,
        command: "assign",
        target: { kind: "ticket", id: ticket.id },
        arg: serviceId
      }, people.owner)
    )
    const action = assigned.message.action!
    expect(action).toMatchObject({ command: "assign", state: "done", createdBy: ownerId })
    // The card's window, not the toast's eight seconds.
    expect(action.undoUntil! - Date.now()).toBeGreaterThan(290_000)
    expect(assigned.undo!.until).toBe(action.undoUntil)

    // A minute on: the assignment's own eight seconds are over and its notice went; the card still holds.
    await pastUndo(workspace)
    await relay(workspace)
    await ageUndo(workspace, 60)

    // Only who ran it: a teammate who can read the card has no undo of theirs to take back.
    expect(failure(await rpc("Chats.undoAction", { actionId: action.id }, people.service))).toMatchObject({
      _tag: "NotFound"
    })
    expect(failure(await rpc("Chats.undoAction", { actionId: action.id }, people.finance))).toMatchObject({
      _tag: "Forbidden"
    })

    // Another session of the same person (another tab or device) takes it back, by the card alone.
    const elsewhere = cookiesOf(await post("/api/auth/sign-in/email", { email: ownerEmail, password }))
    const undone = ok(await rpc("Chats.undoAction", { actionId: action.id }, elsewhere))
    expect(undone.message.action).toMatchObject({ id: action.id, state: "undone", undoUntil: null })
    expect(ok(await rpc("Tickets.get", { id: ticket.id }, people.owner)).ticket.assignees).toEqual([])
    // Once is all: the first tab is told it was taken back already.
    expect(failure(await rpc("Chats.undoAction", { actionId: action.id }, people.owner))).toMatchObject({
      _tag: "CommandRefused",
      reason: "undone"
    })

    // Past the five minutes it is refused, in the card's words, and what the command did stays.
    const made = ok(
      await rpc(
        "Chats.runCommand",
        { conversationId: general, command: "ticket", arg: "Na vijf minuten" },
        people.owner
      )
    )
    await ageUndo(workspace, 301)
    expect(failure(await rpc("Chats.undoAction", { actionId: made.message.action!.id }, people.owner)))
      .toMatchObject({ _tag: "CommandRefused", reason: "undo_expired" })
    expect(ok(await rpc("Tickets.get", { id: made.message.records[0]!.id }, people.owner)).ticket.title).toBe(
      "Na vijf minuten"
    )
    // And a toast's undo keeps its own eight seconds: a message taken back cannot be had again after them.
    const said = ok(await rpc("Chats.send", { conversationId: general, body: "Even weg" }, people.owner))
    const gone = ok(await rpc("Chats.deleteMessage", { messageId: said.message.id }, people.owner))
    expect(gone.undo!.until - Date.now()).toBeLessThan(10_000)
  })
})
