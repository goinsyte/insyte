import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, outboxOf, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * E-mail en domein on the server (M17 step 20.1c), through the Worker over Resend's recorded twin. Reading makes
 * nothing: "Domein instellen" (Bewerken) claims the name and makes it at Resend, with its four records, none found; a
 * check again counts and finds them as the twin's DNS fills in, until the domain is verified. One name is one
 * workspace's: another's, or one made at Resend before the claim, is taken; a set-up whose answer was lost is picked up
 * again; a claim never verified is let go by the daily re-check; "Domein verwijderen" lets it go at once. The senders
 * save over their version (a check in between does not make the save stale), "Mails van Insyte" must be on the domain
 * and "Antwoorden naar" a connected mailbox, Undo puts them back, and a read-only colleague reads but changes nothing.
 * A shopper's mail goes from Insyte until the domain is verified and from the brand's address after; refused there all
 * the same (the domain lapsed), it goes again from Insyte, and the domain is not tried until it is found verified again.
 */

const captured = async (to: string) =>
  (await (await call(`http://api.test/api/__dev/mail?to=${encodeURIComponent(to)}`)).json() as {
    mails: Array<{ kind: string; sender: string | null; from?: string | null; replyTo?: string | null }>
  }).mails.filter((m) => m.kind === "support.message")

const dev = async (path: string) => (await call(`http://api.test/api/__dev/${path}`, { method: "POST" })).json()

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

const workspaceOf = async (cookie: string) => ok(await sessionMe(cookie)).principals[0]!.workspaceId

const domainEvents = async (workspace: string) =>
  (await outboxOf(workspace)).filter((e) => e.event === "records.changed" && e.payload["kind"] === "sending_domain")

describe("the sending domain", () => {
  let owner = ""
  let viewer = ""
  let workspace = ""
  const domain = `sd-${run}.nl`

  beforeAll(async () => {
    const o = await person("domain-owner", "Domein B.V.")
    owner = o.cookie
    workspace = await workspaceOf(owner)
    const email = `domain-${run}-view@invited.test`
    ok(await rpc("Invitations.send", { rows: [{ email, roleId: "view", stores: "all" }] }, owner))
    await pastUndo(workspace)
    await relay(workspace)
    viewer = await join(email)
  }, 120_000)

  it("offers the website's domain to set up and makes nothing on a read", async () => {
    expect(ok(await rpc("SendingDomain.get", undefined, owner))).toMatchObject({
      state: "unclaimed",
      domain: null,
      records: [],
      verified: false,
      senders: { from: "", replyTo: "" },
      version: 0
    })
    expect(
      failure(await rpc("SendingDomain.saveSenders", { from: "info@elders.nl", replyTo: "", baseVersion: 0 }, owner))
    ).toMatchObject({ _tag: "Invalid", fields: { from: "no_domain" } })
    await setWebsite(owner, `https://www.${domain}/shop`)
    expect(ok(await rpc("SendingDomain.get", undefined, viewer))).toMatchObject({
      state: "unclaimed",
      domain,
      records: []
    })
    expect(await domainEvents(workspace)).toHaveLength(0)
  }, 120_000)

  it("sets the domain up only for who may change the settings, and only a real domain", async () => {
    expect(failure(await rpc("SendingDomain.setUp", { name: domain }, viewer))).toMatchObject({ _tag: "Forbidden" })
    expect(failure(await rpc("SendingDomain.setUp", { name: "geen domein" }, owner))).toMatchObject({
      _tag: "Invalid",
      fields: { domain: "format" }
    })
    expect(failure(await rpc("SendingDomain.setUp", { name: "mail.goinsyte.com" }, owner))).toMatchObject({
      _tag: "Invalid"
    })
    expect(failure(await rpc("SendingDomain.remove", undefined, viewer))).toMatchObject({ _tag: "Forbidden" })
  }, 120_000)

  it("makes the domain at Resend on Domein instellen and shows its four records, none found", async () => {
    const first = ok(await rpc("SendingDomain.setUp", { name: `https://www.${domain}` }, owner))
    expect(first).toMatchObject({ state: "ready", domain, verified: false, checks: 0, checkedAt: null })
    expect(first.records.map((r) => [r.id, r.type, r.name, r.status])).toEqual([
      ["mx", "MX", "send", "missing"],
      ["spf", "TXT", "send", "missing"],
      ["dkim", "TXT", "resend._domainkey", "missing"],
      ["dmarc", "TXT", "_dmarc", "missing"]
    ])
    expect(first.records[3]!.value).toBe("v=DMARC1; p=none;")
    // Set up already: a second set-up and a read show the same domain, made once and said once.
    expect(ok(await rpc("SendingDomain.setUp", { name: domain }, owner))).toMatchObject({ domain, checks: 0 })
    expect(ok(await rpc("SendingDomain.get", undefined, viewer))).toMatchObject({ state: "ready", domain })
    expect(await domainEvents(workspace)).toHaveLength(1)
  }, 120_000)

  it("keeps the senders on the domain and answers in a connected mailbox", async () => {
    const before = ok(await rpc("SendingDomain.get", undefined, owner))
    const save = (from: string, replyTo: string, baseVersion = before.version) =>
      rpc("SendingDomain.saveSenders", { from, replyTo, baseVersion }, owner)
    expect(failure(await save(`service@elders.nl`, ""))).toMatchObject({ fields: { from: "not_on_domain" } })
    expect(failure(await save(`a>"<b@${domain}`, ""))).toMatchObject({ fields: { from: "format" } })
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
  }, 120_000)

  it(
    "sends a shopper's mail from Insyte until the domain is verified, and from the brand's address after",
    async () => {
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
    },
    120_000
  )

  it(
    "sends again from Insyte when Resend refuses the brand's address, and stops trying it until it is verified",
    async () => {
      const to = `domein-terugval-${run}@voorbeeld.nl`
      await dev(`mail/refuse-sender?domain=${domain}`)
      ok(await rpc("Threads.compose", { to, subject: "Geweigerd", body: "Toch aangekomen." }, owner))
      await pastUndo(workspace)
      await relay(workspace)
      // The mail went, from Insyte's address in the store's name.
      expect((await captured(to))[0]).toMatchObject({ sender: "Domein", from: null })
      // Marked not verified: with Resend taking the address again, the next mail still does not try it…
      await dev(`mail/refuse-sender?domain=${domain}&off=1`)
      ok(await rpc("Threads.compose", { to, subject: "Daarna", body: "Nog van Insyte." }, owner))
      await pastUndo(workspace)
      await relay(workspace)
      expect((await captured(to))[0]).toMatchObject({ from: null })
      // …until the page reads Resend again and finds it verified.
      expect(ok(await rpc("SendingDomain.get", undefined, owner))).toMatchObject({ verified: true })
      ok(await rpc("Threads.compose", { to, subject: "Weer", body: "Van het eigen domein." }, owner))
      await pastUndo(workspace)
      await relay(workspace)
      expect((await captured(to))[0]).toMatchObject({ from: `service@${domain}` })
    },
    120_000
  )

  it("lets one workspace's name be no one else's, nor one made at Resend before the claim", async () => {
    const other = await person("domain-squat", "Ander B.V.")
    expect(ok(await rpc("SendingDomain.setUp", { name: domain }, other.cookie))).toMatchObject({
      state: "taken",
      domain,
      records: []
    })
    expect(ok(await rpc("SendingDomain.get", undefined, other.cookie))).toMatchObject({ state: "unclaimed" })
    const elsewhere = `elsewhere-${run}.nl`
    expect(ok(await rpc("SendingDomain.setUp", { name: elsewhere }, other.cookie))).toMatchObject({ state: "taken" })
    // The refused claim is not kept: another name is free to set up.
    expect(ok(await rpc("SendingDomain.setUp", { name: `eigen-${run}.nl` }, other.cookie))).toMatchObject({
      state: "ready",
      domain: `eigen-${run}.nl`
    })
  }, 120_000)

  it("picks up a set-up whose answer was lost, as this workspace's own", async () => {
    const lost = await person("domain-lost", "Verloren B.V.")
    const name = `lost-${run}.nl`
    expect(ok(await rpc("SendingDomain.setUp", { name }, lost.cookie))).toMatchObject({ state: "failed", records: [] })
    // The claim stands, so the page offers the same name again…
    expect(ok(await rpc("SendingDomain.get", undefined, lost.cookie))).toMatchObject({
      state: "unclaimed",
      domain: name
    })
    // …and the next try finds the domain Resend made for it, rather than calling it taken.
    const again = ok(await rpc("SendingDomain.setUp", { name }, lost.cookie))
    expect(again).toMatchObject({ state: "ready", domain: name })
    expect(again.records).toHaveLength(4)
  }, 120_000)

  it("takes the domain away on Domein verwijderen, so another can be set up", async () => {
    const changer = await person("domain-change", "Wissel B.V.")
    const first = `eerst-${run}.nl`
    ok(await rpc("SendingDomain.setUp", { name: first }, changer.cookie))
    expect(ok(await rpc("SendingDomain.remove", undefined, changer.cookie))).toMatchObject({
      state: "unclaimed",
      records: [],
      verified: false
    })
    const audit = await domainEvents(await workspaceOf(changer.cookie))
    expect(audit).toHaveLength(2)
    expect(ok(await rpc("SendingDomain.setUp", { name: `daarna-${run}.nl` }, changer.cookie))).toMatchObject({
      state: "ready",
      domain: `daarna-${run}.nl`
    })
    // The first name is free again, at Resend too.
    const next = await person("domain-next", "Volgende B.V.")
    expect(ok(await rpc("SendingDomain.setUp", { name: first }, next.cookie))).toMatchObject({ state: "ready" })
  }, 120_000)

  it("re-checks a verified domain daily, and lets a claim never verified go after two weeks", async () => {
    const lapsing = await person("domain-lapse", "Verval B.V.")
    const lapsingWs = await workspaceOf(lapsing.cookie)
    ok(await rpc("SendingDomain.setUp", { name: `lapse-${run}.nl` }, lapsing.cookie))
    ok(await rpc("SendingDomain.verify", undefined, lapsing.cookie))
    expect(ok(await rpc("SendingDomain.verify", undefined, lapsing.cookie))).toMatchObject({ verified: true })
    // Verified once, a claim is never let go for its age.
    await dev(`sending-domain/age?workspace=${lapsingWs}&days=30`)
    expect(await dev(`sending-domain/recheck?workspace=${lapsingWs}`)).toEqual({ outcome: "checked" })
    const lapsed = ok(await rpc("SendingDomain.get", undefined, lapsing.cookie))
    expect(lapsed).toMatchObject({ state: "ready", verified: false })
    expect(lapsed.records.find((r) => r.id === "dkim")).toMatchObject({ status: "missing", reason: "failed" })

    const idle = await person("domain-idle", "Stil B.V.")
    const idleWs = await workspaceOf(idle.cookie)
    const name = `stil-${run}.nl`
    ok(await rpc("SendingDomain.setUp", { name }, idle.cookie))
    expect(await dev(`sending-domain/recheck?workspace=${idleWs}`)).toEqual({ outcome: "checked" })
    await dev(`sending-domain/age?workspace=${idleWs}&days=15`)
    expect(await dev(`sending-domain/recheck?workspace=${idleWs}`)).toEqual({ outcome: "released" })
    expect(ok(await rpc("SendingDomain.get", undefined, idle.cookie))).toMatchObject({
      state: "unclaimed",
      records: []
    })
    // Let go at Resend as well: set up again, it is made anew.
    expect(ok(await rpc("SendingDomain.setUp", { name }, idle.cookie))).toMatchObject({ state: "ready", checks: 0 })
  }, 120_000)

  it("shows the page as not available where the key cannot manage domains, with no record", async () => {
    const other = await person("domain-restricted", "Beperkt B.V.")
    await setWebsite(other.cookie, `https://restricted-${run}.nl`)
    expect(ok(await rpc("SendingDomain.setUp", { name: `restricted-${run}.nl` }, other.cookie))).toMatchObject({
      state: "unavailable",
      domain: `restricted-${run}.nl`,
      records: [],
      verified: false
    })
    // Nothing was kept of it: the page offers it again.
    expect(ok(await rpc("SendingDomain.get", undefined, other.cookie))).toMatchObject({ state: "unclaimed" })
  }, 120_000)
})
