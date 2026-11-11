import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The inbox (steps 13.1–13.2, M11 steps 1–2) with the forwarding mailbox: a mail at `support-<slug>@…` becomes a
 * thread (through the dev route, down the `email()` handler's path), its answers join it, the same mail twice is one
 * message; the team replies, forwards and writes, each sent once its undo window has passed and not at all when undone;
 * folders and counts follow archive, spam, the Prullenbak, a snooze and an assignment; a thread becomes a ticket and
 * Undo takes it away again. Gmail and Outlook are not available yet, and a read-only role reads but does not send.
 */

const DOMAIN = "in.goinsyte.com"

const deliver = async (to: string, raw: string) => {
  const response = await call("http://api.test/api/__dev/mail/inbound", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to, raw })
  })
  return {
    status: response.status,
    body: await response.json() as { threadId: string; messageId: string; duplicate: boolean }
  }
}

const captured = async (to: string) =>
  (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}`)).json() as {
    mails: Array<
      { kind: string; sender: string | null; reference: string | null; subject: string | null; bodyText: string | null }
    >
  }).mails.filter((m) => m.kind === "support.message")

const mime = (lines: Record<string, string>, body: string) =>
  [...Object.entries(lines).map(([k, v]) => `${k}: ${v}`), "MIME-Version: 1.0", "", body].join("\r\n")

describe("the inbox", () => {
  const people = { owner: "", view: "" }
  let workspace = ""
  let ownerId = ""
  let forwarding = ""
  let mailboxId = ""
  const customer = `klant-${run}@voorbeeld.nl`

  beforeAll(async () => {
    const owner = await person("inbox-owner", "Inbox B.V.")
    people.owner = owner.cookie
    const me = ok(await sessionMe(owner.cookie)).principals[0]!
    workspace = me.workspaceId
    ownerId = me.id
    const email = `inbox-${run}-view@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "view", stores: "all" }] }, owner.cookie))
    await pastUndo(workspace)
    await relay(workspace)
    people.view = await join(email)
    await relay(workspace)
  }, 120_000)

  it("gives the workspace a forwarding address, and leaves Gmail and Outlook for later", async () => {
    expect(
      failure(
        await rpc("Mailboxes.connect", { provider: "gmail", address: "x@voorbeeld.nl", label: "X" }, people.owner)
      )
    )
      .toMatchObject({ _tag: "ProviderUnavailable", provider: "gmail" })
    const box = ok(
      await rpc(
        "Mailboxes.connect",
        { provider: "forward", address: "Support@Inbox-BV.nl", label: "Inbox B.V." },
        people.owner
      )
    )
    expect(box).toMatchObject({
      provider: "forward",
      address: "support@inbox-bv.nl",
      isDefault: true,
      status: "connected"
    })
    expect(box.forwardingAddress).toMatch(
      new RegExp(`^support-team-${run}-inboxowner@${DOMAIN.replaceAll(".", "\\.")}$`)
    )
    forwarding = box.forwardingAddress!
    mailboxId = box.id
    expect(
      failure(
        await rpc(
          "Mailboxes.connect",
          { provider: "forward", address: "support@inbox-bv.nl", label: "Twee" },
          people.owner
        )
      )
    )
      .toMatchObject({ _tag: "Conflict" })
    ok(await rpc("Mailboxes.setSignature", { id: box.id, signature: "Groet,\nTeam Inbox" }, people.owner))
    expect(failure(await rpc("Mailboxes.setSignature", { id: box.id, signature: "" }, people.view))).toMatchObject({
      _tag: "Forbidden"
    })
    expect(ok(await rpc("Mailboxes.list", undefined, people.view)).map((m) => m.id)).toEqual([box.id])
  })

  it("makes a thread of a mail, joins its answers to it and keeps a mail delivered twice once", async () => {
    expect((await deliver(`nobody@${DOMAIN}`, mime({ From: customer, To: "x", Subject: "x" }, "x"))).status).toBe(404)
    const raw = mime({
      From: `"Sofie de Vries" <${customer}>`,
      To: `Inbox B.V. <support@inbox-bv.nl>`,
      Subject: "=?UTF-8?Q?Waar_is_mijn_pakket=3F?=",
      "Message-ID": `<eerste-${run}@voorbeeld.nl>`,
      Date: "Tue, 10 Nov 2026 09:00:00 +0100",
      "Content-Type": "text/plain; charset=utf-8"
    }, "Hoi,\r\n\r\nMijn bestelling #1001 is nog niet binnen.\r\n\r\nSofie")
    const first = await deliver(forwarding.toUpperCase(), raw)
    expect(first.status).toBe(200)
    expect(first.body.duplicate).toBe(false)
    expect((await deliver(forwarding, raw)).body).toMatchObject({ threadId: first.body.threadId, duplicate: true })

    const list = ok(await rpc("Threads.list", {}, people.owner))
    expect(list.rows).toHaveLength(1)
    expect(list.rows[0]).toMatchObject({
      id: first.body.threadId,
      mailboxId,
      subject: "Waar is mijn pakket?",
      preview: "Hoi, Mijn bestelling #1001 is nog niet binnen. Sofie",
      unread: true,
      hasInbound: true
    })
    expect(list.rows[0]!.participants).toEqual([
      { name: "Sofie de Vries", email: customer, team: false },
      { name: "Inbox B.V.", email: "support@inbox-bv.nl", team: true }
    ])
    expect(list.counts).toMatchObject({ all: 1, unassigned: 1, mine: 0, byMailbox: { [mailboxId]: 1 } })
    expect(ok(await rpc("Nav.counts", { area: "inbox" }, people.owner))).toMatchObject({
      "/inbox": 1,
      "/inbox?folder=unassigned": 1,
      [`/inbox?mailbox=${mailboxId}`]: 1
    })

    // Reading it is the view role's too; it is not theirs to answer.
    ok(await rpc("Threads.markRead", { ids: [first.body.threadId], read: true }, people.view))
    expect(ok(await rpc("Threads.get", { id: first.body.threadId }, people.view)).thread.unread).toBe(false)
    expect(failure(await rpc("Threads.reply", { threadId: first.body.threadId, body: "Hoi" }, people.view)))
      .toMatchObject({ _tag: "Forbidden" })

    // Her answer to it, quoting it, joins the thread and makes it unread again.
    const answer = await deliver(
      forwarding,
      mime({
        From: customer,
        To: "support@inbox-bv.nl",
        Subject: "Re: Waar is mijn pakket?",
        "Message-ID": `<tweede-${run}@voorbeeld.nl>`,
        "In-Reply-To": `<eerste-${run}@voorbeeld.nl>`,
        References: `<eerste-${run}@voorbeeld.nl>`
      }, "Nog steeds niets.\r\n\r\nOp 11 nov. 2026 schreef Sofie:\r\n> Hoi,")
    )
    expect(answer.body.threadId).toBe(first.body.threadId)
    const detail = ok(await rpc("Threads.get", { id: first.body.threadId }, people.owner))
    expect(detail.thread).toMatchObject({ unread: true, preview: "Nog steeds niets." })
    expect(detail.messages.map((m) => m.direction)).toEqual(["inbound", "inbound"])
  })

  it("sends a reply once its undo window has passed, threaded, and an undone one not at all", async () => {
    const [thread] = ok(await rpc("Threads.list", {}, people.owner)).rows
    const undone = ok(await rpc("Threads.reply", { threadId: thread!.id, body: "Verkeerd bericht" }, people.owner))
    expect(undone.message).toMatchObject({ direction: "outbound", kind: "reply", sendState: "scheduled" })
    ok(await rpc("Shared.undo", { token: undone.undo.token }, people.owner))
    expect(ok(await rpc("Threads.get", { id: thread!.id }, people.owner)).messages).toHaveLength(2)

    const sent = ok(await rpc("Threads.reply", { threadId: thread!.id, body: "We zoeken het uit." }, people.owner))
    expect(sent.message).toMatchObject({
      subject: "Re: Waar is mijn pakket?",
      to: [{ name: "Sofie de Vries", email: customer }],
      bodyText: "We zoeken het uit.\n\nGroet,\nTeam Inbox"
    })
    await pastUndo(workspace)
    await relay(workspace)
    const mails = await captured(customer)
    expect(mails).toHaveLength(1)
    expect(mails[0]).toMatchObject({
      sender: "Inbox B.V.",
      reference: sent.message.id,
      subject: "Re: Waar is mijn pakket?",
      bodyText: "We zoeken het uit.\n\nGroet,\nTeam Inbox"
    })
    const after = ok(await rpc("Threads.get", { id: thread!.id }, people.owner))
    expect(after.messages.map((m) => m.sendState)).toEqual([null, null, "sent"])
    // Delivered again, it is not sent twice.
    await relay(workspace)
    expect(await captured(customer)).toHaveLength(1)

    // Her answer to our reply finds the thread by our own Message-ID.
    const again = await deliver(
      forwarding,
      mime({
        From: customer,
        To: "support@inbox-bv.nl",
        Subject: "Re: Waar is mijn pakket?",
        "Message-ID": `<derde-${run}@voorbeeld.nl>`,
        "In-Reply-To": `<${sent.message.id}@${DOMAIN}>`
      }, "Dank je!")
    )
    expect(again.body.threadId).toBe(thread!.id)
  })

  it("forwards a thread and writes a new mail, from the default mailbox", async () => {
    const [thread] = ok(await rpc("Threads.list", {}, people.owner)).rows
    const colleague = `collega-${run}@voorbeeld.nl`
    const fwd = ok(
      await rpc(
        "Threads.forward",
        { threadId: thread!.id, to: colleague, note: "Kun jij hiernaar kijken?" },
        people.owner
      )
    )
    expect(fwd.message.subject).toBe("Fwd: Waar is mijn pakket?")
    expect(fwd.message.bodyText).toContain("---------- Doorgestuurd bericht ----------")
    const other = `nieuw-${run}@voorbeeld.nl`
    const composed = ok(
      await rpc("Threads.compose", { to: other, subject: "Je retour", body: "Je retour is binnen." }, people.owner)
    )
    expect(composed.thread).toMatchObject({ subject: "Je retour", assigneeId: ownerId, unread: false })
    const undone = ok(await rpc("Threads.compose", { to: other, subject: "Fout", body: "Oeps" }, people.owner))
    ok(await rpc("Shared.undo", { token: undone.undo.token }, people.owner))
    expect(failure(await rpc("Threads.get", { id: undone.thread.id }, people.owner))).toMatchObject({
      _tag: "NotFound"
    })
    await pastUndo(workspace)
    await relay(workspace)
    expect((await captured(colleague)).map((m) => m.subject)).toEqual(["Fwd: Waar is mijn pakket?"])
    expect((await captured(other)).map((m) => m.subject)).toEqual(["Je retour"])
    expect(failure(await rpc("Threads.compose", { to: other, subject: "x", body: "  " }, people.owner)))
      .toMatchObject({ _tag: "Invalid", fields: { body: "required" } })
  })

  it("moves threads between the folders, each with its undo, and counts them", async () => {
    const make = async (tag: string) =>
      (await deliver(
        forwarding,
        mime({
          From: `iemand-${tag}-${run}@voorbeeld.nl`,
          To: "support@inbox-bv.nl",
          Subject: tag,
          "Message-ID": `<${tag}-${run}@x>`
        }, tag)
      )).body.threadId
    const [archived, spam, trashed, snoozed, mine] = [
      await make("archief"),
      await make("spam"),
      await make("prullenbak"),
      await make("later"),
      await make("mijn")
    ]
    ok(await rpc("Threads.archive", { ids: [archived] }, people.owner))
    ok(await rpc("Threads.spam", { ids: [spam] }, people.owner))
    const trash = ok(await rpc("Threads.trash", { ids: [trashed] }, people.owner))
    ok(await rpc("Threads.snooze", { ids: [snoozed], until: Date.now() + 3_600_000 }, people.owner))
    ok(await rpc("Threads.assign", { id: mine, memberId: ownerId }, people.owner))
    ok(await rpc("Threads.star", { id: mine, starred: true }, people.owner))

    const counts = ok(await rpc("Threads.list", {}, people.owner)).counts
    // Waar is mijn pakket, Je retour and Mijn in the inbox.
    expect(counts).toMatchObject({ all: 3, mine: 2, archive: 1, spam: 1, trash: 1 })
    expect(ok(await rpc("Threads.list", { folder: "trash" }, people.owner)).rows.map((r) => r.id)).toEqual([trashed])
    expect(ok(await rpc("Threads.list", { folder: "all", filters: ["starred"] }, people.owner)).rows.map((r) => r.id))
      .toEqual([mine])
    expect(ok(await rpc("Threads.list", { q: "prullenbak" }, people.owner)).rows.map((r) => r.id)).toEqual([trashed])

    ok(await rpc("Shared.undo", { token: trash.undo!.token }, people.owner))
    expect(ok(await rpc("Threads.list", { folder: "trash" }, people.owner)).rows).toHaveLength(0)
    // New mail on an archived thread brings it back.
    await deliver(
      forwarding,
      mime({
        From: `iemand-archief-${run}@voorbeeld.nl`,
        To: "support@inbox-bv.nl",
        Subject: "Re: archief",
        "Message-ID": `<archief-2-${run}@x>`,
        "In-Reply-To": `<archief-${run}@x>`
      }, "nog iets")
    )
    expect(ok(await rpc("Threads.list", { folder: "archive" }, people.owner)).rows).toHaveLength(0)
    ok(await rpc("Threads.putBack", { ids: [spam, snoozed] }, people.owner))
    expect(ok(await rpc("Threads.list", { folder: "all" }, people.owner)).counts.all).toBe(7)
  })

  it("makes a ticket of a thread, and Undo takes it away again", async () => {
    const [thread] = ok(await rpc("Threads.list", { q: "pakket" }, people.owner)).rows
    const undone = ok(await rpc("Threads.linkTicket", { threadId: thread!.id }, people.owner))
    expect(undone).toMatchObject({ created: true, ticketNumber: 1 })
    ok(await rpc("Shared.undo", { token: undone.undo!.token }, people.owner))
    expect(failure(await rpc("Tickets.get", { id: undone.ticketId }, people.owner))).toMatchObject({ _tag: "NotFound" })
    expect(ok(await rpc("Threads.get", { id: thread!.id }, people.owner)).thread.ticketId).toBeNull()

    const linked = ok(await rpc("Threads.linkTicket", { threadId: thread!.id }, people.owner))
    expect(linked.created).toBe(true)
    const ticket = ok(await rpc("Tickets.get", { id: linked.ticketId }, people.owner)).ticket
    expect(ticket).toMatchObject({ title: "Waar is mijn pakket?", source: "email", status: "intake" })
    // Asked again, it is the same ticket.
    expect(ok(await rpc("Threads.linkTicket", { threadId: thread!.id }, people.owner))).toMatchObject({
      ticketId: linked.ticketId,
      created: false
    })
    expect(ok(await rpc("Threads.list", { folder: "linked" }, people.owner)).rows.map((r) => r.id)).toEqual([
      thread!.id
    ])
  })

  it("keeps a mail's attachments and its HTML, and reads a mail that is HTML only", async () => {
    const boundary = `b-${run}`
    const raw = [
      `From: ${customer}`,
      "To: support@inbox-bv.nl",
      "Subject: Foto van de schade",
      `Message-ID: <foto-${run}@voorbeeld.nl>`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=iso-8859-1",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "<p>De doos is kapot, zie de foto. Groet, Sof=EDe</p>",
      `--${boundary}`,
      "Content-Type: image/png; name=schade.png",
      "Content-Disposition: attachment; filename=schade.png",
      "Content-Transfer-Encoding: base64",
      "",
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      `--${boundary}--`,
      ""
    ].join("\r\n")
    const { body } = await deliver(forwarding, raw)
    const detail = ok(await rpc("Threads.get", { id: body.threadId }, people.owner))
    expect(detail.thread.hasAttachments).toBe(true)
    expect(detail.messages[0]).toMatchObject({
      bodyText: "De doos is kapot, zie de foto. Groet, Sofíe",
      hasHtml: true,
      attachments: [{ name: "schade.png", mime: "image/png", size: 70 }]
    })
  })
})
