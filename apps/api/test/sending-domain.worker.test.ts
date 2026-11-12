import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * E-mail en domein on the server (M17 step 20.1c), through the Worker over Resend's recorded twin: without a website
 * there is no domain to make; with one, the first read makes it at Resend and shows its four records, none found; a
 * check again counts and finds them as the twin's DNS fills in, until the domain is verified. The senders save over
 * their version (a check in between does not make the save stale), "Mails van Insyte" must be on the domain and
 * "Antwoorden naar" a connected mailbox, Undo puts them back, and a read-only colleague reads but neither checks nor
 * saves. A shopper's mail goes from Insyte until the domain is verified and from the brand's address after. A key that
 * cannot manage domains shows the page as not available, with no records.
 */

const captured = async (to: string) =>
  (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}`)).json() as {
    mails: Array<{ kind: string; sender: string | null; from?: string | null; replyTo?: string | null }>
  }).mails.filter((m) => m.kind === "support.message")

const setWebsite = async (cookie: string, website: string) => {
  const brand = ok(await rpc("WorkspaceSettings.get", { section: "brand" }, cookie))
  if (brand.section !== "brand") throw new Error("brand")
  ok(
    await rpc("WorkspaceSettings.save", {
      section: "brand",
      value: { ...brand.value, website },
      baseVersion: brand.version
    }, cookie)
  )
}

describe("the sending domain", () => {
  let owner = ""
  let viewer = ""
  let workspace = ""
  const domain = `sd-${run}.nl`

  beforeAll(async () => {
    const o = await person("domain-owner", "Domein B.V.")
    owner = o.cookie
    workspace = ok(await sessionMe(owner)).principals[0]!.workspaceId
    const email = `domain-${run}-view@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "view", stores: "all" }] }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    viewer = await join(email)
  }, 120_000)

  it("has no domain to make without a website, and no sender to keep off one", async () => {
    expect(ok(await rpc("SendingDomain.get", undefined, owner))).toMatchObject({
      state: "no_domain",
      domain: null,
      records: [],
      verified: false,
      senders: { from: "", replyTo: "" },
      version: 0
    })
    expect(
      failure(await rpc("SendingDomain.saveSenders", { from: "info@elders.nl", replyTo: "", baseVersion: 0 }, owner))
    ).toMatchObject({ _tag: "Invalid", fields: { from: "no_domain" } })
  })

  it("makes the website's domain at Resend on the first read and shows its four records, none found", async () => {
    await setWebsite(owner, `https://www.${domain}/shop`)
    const first = ok(await rpc("SendingDomain.get", undefined, owner))
    expect(first).toMatchObject({ state: "ready", domain, verified: false, checks: 0, checkedAt: null })
    expect(first.records.map((r) => [r.id, r.type, r.name, r.status])).toEqual([
      ["mx", "MX", "send", "missing"],
      ["spf", "TXT", "send", "missing"],
      ["dkim", "TXT", "resend._domainkey", "missing"],
      ["dmarc", "TXT", "_dmarc", "missing"]
    ])
    expect(first.records[3]!.value).toBe("v=DMARC1; p=none;")
    // A second read reads the same domain: it is made once, and said once.
    expect(ok(await rpc("SendingDomain.get", undefined, viewer))).toMatchObject({ domain, checks: 0 })
    const made = (await outboxOf(workspace)).filter((e) =>
      e.event === "records.changed" && e.payload["kind"] === "sending_domain"
    )
    expect(made).toHaveLength(1)
  })

  it("keeps the senders on the domain and answers in a connected mailbox", async () => {
    const before = ok(await rpc("SendingDomain.get", undefined, owner))
    const save = (from: string, replyTo: string, baseVersion = before.version) =>
      rpc("SendingDomain.saveSenders", { from, replyTo, baseVersion }, owner)
    expect(failure(await save(`service@elders.nl`, ""))).toMatchObject({ fields: { from: "not_on_domain" } })
    expect(failure(await save(`service@${domain}`, `support@${domain}`))).toMatchObject({
      fields: { replyTo: "not_a_mailbox" }
    })
    expect(failure(await rpc("SendingDomain.saveSenders", { from: "", replyTo: "", baseVersion: 0 }, viewer)))
      .toMatchObject({ _tag: "Forbidden" })
    ok(await rpc("Mailboxes.connect", { provider: "forward", address: `support@${domain}`, label: "Domein" }, owner))
    const saved = ok(await save(` Service@${domain.toUpperCase()} `, `Support@${domain}`))
    expect(saved.domain).toMatchObject({
      state: "ready",
      domain,
      senders: { from: `service@${domain}`, replyTo: `support@${domain}` },
      version: before.version + 1
    })
    expect(saved.domain.records).toHaveLength(4)
    expect(failure(await save(`hallo@${domain}`, "", before.version))).toMatchObject({
      _tag: "Conflict",
      reason: "stale_version"
    })
    // The section reads the same through WorkspaceSettings, with the domain it is on.
    expect(ok(await rpc("WorkspaceSettings.get", { section: "domain_senders" }, viewer))).toMatchObject({
      value: { from: `service@${domain}`, replyTo: `support@${domain}` },
      domain,
      version: saved.domain.version
    })
  })

  it("sends a shopper's mail from Insyte until the domain is verified, and from the brand's address after", async () => {
    const to = `domein-koper-${run}@voorbeeld.nl`
    ok(await rpc("Threads.compose", { to, subject: "Eerste", body: "Nog van Insyte." }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    expect((await captured(to))[0]).toMatchObject({ sender: "Domein", from: null })

    expect(failure(await rpc("SendingDomain.verify", undefined, viewer))).toMatchObject({ _tag: "Forbidden" })
    const version = ok(await rpc("SendingDomain.get", undefined, owner)).version
    const once = ok(await rpc("SendingDomain.verify", undefined, owner))
    expect(once).toMatchObject({ checks: 1, verified: false })
    expect(once.checkedAt).toBeTypeOf("number")
    expect(once.records.map((r) => r.status)).toEqual(["pending", "pending", "found", "missing"])
    const twice = ok(await rpc("SendingDomain.verify", undefined, owner))
    expect(twice).toMatchObject({ checks: 2, verified: true, version })
    expect(twice.records.every((r) => r.status === "found")).toBe(true)

    ok(await rpc("Threads.compose", { to, subject: "Tweede", body: "Van het eigen domein." }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    expect((await captured(to))[0]).toMatchObject({ sender: "Domein", from: `service@${domain}` })

    // A check between reading and saving does not make the save stale.
    const later = ok(
      await rpc("SendingDomain.saveSenders", { from: `hallo@${domain}`, replyTo: "", baseVersion: version }, owner)
    )
    expect(later.domain).toMatchObject({ verified: true, checks: 2, senders: { from: `hallo@${domain}` } })
    // Undo puts the senders back and leaves the domain as it was checked.
    ok(await rpc("Shared.undo", { token: later.undo.token }, owner))
    expect(ok(await rpc("SendingDomain.get", undefined, owner))).toMatchObject({
      verified: true,
      checks: 2,
      senders: { from: `service@${domain}`, replyTo: `support@${domain}` }
    })
  })

  it("shows the page as not available where the key cannot manage domains, with no record", async () => {
    const other = await person("domain-restricted", "Beperkt B.V.")
    await setWebsite(other.cookie, `https://restricted-${run}.nl`)
    expect(ok(await rpc("SendingDomain.get", undefined, other.cookie))).toMatchObject({
      state: "unavailable",
      domain: `restricted-${run}.nl`,
      records: [],
      verified: false
    })
    expect(ok(await rpc("SendingDomain.verify", undefined, other.cookie))).toMatchObject({
      state: "unavailable",
      records: []
    })
  })
})
