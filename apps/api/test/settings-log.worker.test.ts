import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * The Logboek and the Prullenbak (M17 step 20.1a). The Logboek: each settings save as a line per changed field, with
 * who, the page and what it was and became; narrowed by period, person and page; the people and pages as facets; the
 * CSV for a role with Exporteren; another workspace's lines never. The Prullenbak: a ticket in the trash with who put it
 * there, back through Tickets' own put-back with its undo, purged for good, emptied, and swept after 30 days; a role
 * below Instellingen · Bewerken refused; another workspace's items never.
 */

const ageAndSweep = async (workspace: string, days: number) =>
  (await (await call(`http://api.test/api/__dev/trash/sweep?workspace=${workspace}&age=${days}`, {
    method: "POST"
  })).json()) as { purged: number }

describe("the Logboek and the Prullenbak", () => {
  const people = { owner: "", view: "", service: "", other: "" }
  let workspace = ""
  let ownerKey = ""

  beforeAll(async () => {
    const owner = await person("log-owner", "Logboek B.V.")
    people.owner = owner.cookie
    const me = ok(await sessionMe(owner.cookie)).principals[0]!
    workspace = me.workspaceId
    ownerKey = `member:${me.id}`
    const colleagues = (["view", "service"] as const).map((role) => ({
      role,
      email: `log-${run}-${role}@invited.test`
    }))
    ok(
      await rpc("Invitations.send", {
        rows: colleagues.map((c) => ({ email: c.email, roleId: c.role, stores: "all" as const }))
      }, owner.cookie)
    )
    await pastUndo(workspace)
    await relay(workspace)
    for (const c of colleagues) people[c.role] = await join(c.email)
    people.other = (await person("log-other", "Andere Winkel B.V.")).cookie
  }, 120_000)

  it("lists every settings save as a line per field, newest first, with the page and who", async () => {
    expect(ok(await rpc("Audit.list", { category: "settings" }, people.owner)).lines).toEqual([])
    const regional = ok(await rpc("Workspaces.getRegional", undefined, people.owner))
    ok(
      await rpc("Workspaces.saveRegional", {
        ...regional,
        language: "en-GB",
        weekStart: "sun",
        timezone: "Europe/London"
      }, people.owner)
    )
    ok(await rpc("Workspaces.setRetention", { days: 180 }, people.owner))

    const page = ok(await rpc("Audit.list", { category: "settings" }, people.owner))
    expect(page.next).toBeNull()
    expect(page.lines.map((l) => [l.page, l.field, l.before, l.after])).toEqual([
      ["Account", "Gegevens leesbaar houden voor", "90 dagen", "180 dagen"],
      ["Regio", "Taal", "Nederlands", "Engels (VK)"],
      ["Regio", "Week begint op", "Maandag", "Zondag"],
      ["Regio", "Tijdzone", "Europe/Amsterdam", "Europe/London"]
    ])
    expect(page.lines[0]).toMatchObject({
      actor: { key: ownerKey, name: "Persoon log-owner" },
      path: "/settings/profile"
    })
    expect(page.lines[1]!.path).toBe("/settings/regional")

    const facets = ok(await rpc("Audit.facets", undefined, people.owner))
    expect(facets.actors).toEqual([{ key: ownerKey, name: "Persoon log-owner" }])
    expect(facets.pages).toEqual([{ id: "account", label: "Account" }, { id: "regional", label: "Regio" }])

    const regio = ok(await rpc("Audit.list", { category: "settings", page: "regional", days: 7 }, people.owner))
    expect(regio.lines.map((l) => l.field)).toEqual(["Taal", "Week begint op", "Tijdzone"])
    const nobody = ok(await rpc("Audit.list", { category: "settings", actor: "member:mem_none" }, people.owner))
    expect(nobody.lines).toEqual([])
    expect(failure(await rpc("Audit.list", { category: "settings", cursor: "geen" }, people.owner))).toMatchObject({
      _tag: "Invalid",
      fields: { cursor: "invalid" }
    })
    expect(failure(await rpc("Audit.list", { category: "settings", actor: "zonder-soort" }, people.owner)))
      .toMatchObject({ _tag: "Invalid", fields: { actor: "invalid" } })
  })

  it("reads to Instellingen · Bekijken, exports with Exporteren, and never another workspace's lines", async () => {
    expect(ok(await rpc("Audit.list", { category: "settings" }, people.view)).lines.length).toBe(4)
    expect(failure(await rpc("Audit.list", { category: "settings" }, people.service))).toMatchObject({
      _tag: "Forbidden",
      permission: "settings"
    })
    expect(failure(await rpc("Audit.export", { category: "settings" }, people.view))).toMatchObject({
      _tag: "Forbidden",
      permission: "data.export"
    })
    const file = ok(await rpc("Audit.export", { category: "settings", page: "regional" }, people.owner))
    expect(file.filename).toMatch(/^logboek-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(file).toMatchObject({ lines: 3, truncated: false })
    const rows = file.csv.trim().split("\r\n")
    expect(rows[0]).toBe("Wanneer,Wie,Pagina,Wat,Was,Werd")
    expect(rows[1]!.split(",")[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    expect(rows.slice(1).map((r) => r.split(",").slice(1))).toEqual([
      ["Persoon log-owner", "Regio", "Taal", "Nederlands", "Engels (VK)"],
      ["Persoon log-owner", "Regio", "Week begint op", "Maandag", "Zondag"],
      ["Persoon log-owner", "Regio", "Tijdzone", "Europe/Amsterdam", "Europe/London"]
    ])

    expect(ok(await rpc("Audit.list", { category: "settings" }, people.other)).lines).toEqual([])
    expect(ok(await rpc("Audit.facets", undefined, people.other))).toEqual({ actors: [], pages: [] })
  })

  it("holds a trashed ticket with who put it there, and puts it back through Tickets with its undo", async () => {
    const ticket = ok(await rpc("Tickets.create", { title: "Dubbele bestelling" }, people.owner)).tickets[0]!
    ok(await rpc("Tickets.trash", { ids: [ticket.id] }, people.owner))

    const listed = ok(await rpc("Trash.list", undefined, people.owner)).items
    expect(listed).toHaveLength(1)
    expect(listed[0]).toMatchObject({
      id: ticket.id,
      kind: "ticket",
      title: "Dubbele bestelling",
      deletedBy: "Persoon log-owner"
    })
    expect(listed[0]!.purgeAt - listed[0]!.deletedAt).toBe(30 * 86_400_000)

    const back = ok(await rpc("Trash.restore", { ids: [ticket.id] }, people.owner))
    expect(back.restored).toEqual([ticket.id])
    expect(back.undo).toHaveLength(1)
    expect(ok(await rpc("Tickets.get", { id: ticket.id }, people.owner)).ticket.deletedAt).toBeNull()
    expect(ok(await rpc("Trash.list", undefined, people.owner)).items).toEqual([])
    // Ongedaan maken: Tickets' own undo puts it in the trash again.
    ok(await rpc("Shared.undo", { token: back.undo[0]!.token }, people.owner))
    expect(ok(await rpc("Trash.list", undefined, people.owner)).items.map((i) => i.id)).toEqual([ticket.id])

    expect(failure(await rpc("Trash.restore", { ids: ["tkt_none"] }, people.owner))).toMatchObject({
      _tag: "NotFound",
      entity: "trash_item"
    })
  })

  it("purges for good, empties, and is refused below Instellingen · Bewerken and to other workspaces", async () => {
    const make = async (title: string) => {
      const t = ok(await rpc("Tickets.create", { title }, people.owner)).tickets[0]!
      ok(await rpc("Tickets.trash", { ids: [t.id] }, people.owner))
      return t
    }
    const first = await make("Weg ermee")
    const second = await make("Ook weg")

    for (const role of ["view", "service"] as const) {
      expect(failure(await rpc("Trash.list", undefined, people[role]))).toMatchObject({
        _tag: "Forbidden",
        permission: "settings",
        level: 2
      })
      expect(failure(await rpc("Trash.purge", { ids: [first.id] }, people[role]))).toMatchObject({
        _tag: "Forbidden"
      })
    }
    expect(ok(await rpc("Trash.list", undefined, people.other)).items).toEqual([])
    expect(failure(await rpc("Trash.purge", { ids: [first.id] }, people.other))).toMatchObject({ _tag: "NotFound" })

    expect(ok(await rpc("Trash.purge", { ids: [first.id] }, people.owner))).toEqual({ purged: 1 })
    expect(failure(await rpc("Tickets.get", { id: first.id }, people.owner))).toMatchObject({ _tag: "NotFound" })
    const left = ok(await rpc("Trash.list", undefined, people.owner)).items.map((i) => i.id)
    expect(left).toContain(second.id)
    expect(left).not.toContain(first.id)

    expect(ok(await rpc("Trash.empty", undefined, people.owner)).purged).toBe(left.length)
    expect(ok(await rpc("Trash.list", undefined, people.owner)).items).toEqual([])
    expect(failure(await rpc("Tickets.get", { id: second.id }, people.owner))).toMatchObject({ _tag: "NotFound" })
  })

  it("sweeps what passed its 30 days, and keeps what did not", async () => {
    const old = ok(await rpc("Tickets.create", { title: "Van vorige maand" }, people.owner)).tickets[0]!
    ok(await rpc("Tickets.trash", { ids: [old.id] }, people.owner))
    expect(await ageAndSweep(workspace, 31)).toEqual({ purged: 1 })
    expect(failure(await rpc("Tickets.get", { id: old.id }, people.owner))).toMatchObject({ _tag: "NotFound" })

    const fresh = ok(await rpc("Tickets.create", { title: "Van vandaag" }, people.owner)).tickets[0]!
    ok(await rpc("Tickets.trash", { ids: [fresh.id] }, people.owner))
    expect(await ageAndSweep(workspace, 0)).toEqual({ purged: 0 })
    expect(ok(await rpc("Trash.list", undefined, people.owner)).items.map((i) => i.id)).toEqual([fresh.id])
  })
})
