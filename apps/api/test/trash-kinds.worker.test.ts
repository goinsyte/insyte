import { beforeAll, describe, expect, it } from "vitest"
import { failure, join, ok, pastUndo, person, relay, run } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * More kinds in the Prullenbak (W11.4): an automation, a sheet, a course, a webhook endpoint and a cost line, each
 * removed by its own page, are listed with who removed them, put back through their own slice with an undo that puts
 * them in the trash again, purged for good, and swept after 30 days. A sheet is its owner's alone; each kind takes its
 * own area's level (and a cost line `costs.write`); a webhook endpoint for every store does not come back for someone
 * held to one store. What was removed before its kind joined the trash has its 30 days from that moment.
 */

/**
 * The workspace's items as if removed `age` days earlier, and (`joined`) the kinds of 0101 as if they joined the
 * Prullenbak that many days ago, then the daily sweep for the workspace.
 */
const sweep = async (workspace: string, days: { readonly age: number; readonly joined?: number }) =>
  (await (await call(
    `http://api.test/api/__dev/trash/sweep?workspace=${workspace}&age=${days.age}${
      days.joined === undefined ? "" : `&joined=${days.joined}`
    }`,
    { method: "POST" }
  )).json()) as { purged: number }

const DAY = 86_400_000

const endpoint = (url: string, description = "") => ({
  url,
  description,
  events: ["order.cancelled"],
  apiVersion: "2026-10-01",
  stores: "all" as const,
  headers: [],
  retry: 3 as const,
  active: true
})

const trash = async (cookie: string) => ok(await rpc("Trash.list", undefined, cookie)).items

describe("more kinds in the Prullenbak", () => {
  const people = { owner: "", tidy: "", admin: "" }
  let workspace = ""

  /** One of each new kind, removed by the owner on its own page. */
  const removedSet = async (tag: string) => {
    const automation = ok(await rpc("Automations.create", { name: `Flow ${tag}` }, people.owner)).automation!
      .automation.id
    ok(await rpc("Automations.remove", { id: automation }, people.owner))
    const sheet = ok(await rpc("Sheets.create", { template: "blank", title: `Blad ${tag}` }, people.owner)).sheet.id
    ok(await rpc("Sheets.remove", { ids: [sheet] }, people.owner))
    const chapter = ok(await rpc("CourseChapters.add", { title: `Hoofdstuk ${tag}` }, people.owner)).id!
    const catalogue = ok(await rpc("Courses.list", undefined, people.owner))
    const moduleId = catalogue.chapters.find((c) => c.id === chapter)!.modules[0]!.id
    const course = ok(
      await rpc("Courses.create", { title: `Cursus ${tag}`, chapterId: chapter, moduleId }, people.owner)
    )
      .id!
    ok(await rpc("Courses.remove", { ids: [course] }, people.owner))
    const webhook = ok(
      await rpc("Webhooks.create", endpoint(`https://trash.webhooks.example/${tag}?token=geheim`), people.owner)
    ).endpoint.id
    ok(await rpc("Webhooks.remove", { id: webhook }, people.owner))
    const cost = ok(
      await rpc("Costs.create", { name: `Post ${tag}`, kind: "fixed", amountPerMonthMinor: 5_000 }, people.owner)
    ).id
    ok(await rpc("Costs.remove", { id: cost }, people.owner))
    return { automation, sheet, course, webhook, cost }
  }

  beforeAll(async () => {
    const owner = await person("trash-kinds", "Prullenbak B.V.")
    people.owner = owner.cookie
    workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const seed = await call("http://api.test/api/__dev/stores/seed", {
      method: "POST",
      headers: { cookie: owner.cookie }
    })
    const { storeId } = await seed.json() as { storeId: string }
    // Opruimer: Instellingen · Bewerken, every new kind's area at Bekijken (Integraties at Bewerken), one store only.
    const made = ok(await rpc("Roles.create", { label: "Opruimer", from: null }, owner.cookie))
    const role = made.roles.roles.find((r) => r.id === made.id)!
    ok(
      await rpc("Roles.update", {
        id: made.id,
        levels: { ...role.levels, settings: 2, automations: 1, data: 1, courses: 1, integrations: 2, analytics: 1 },
        specials: role.specials,
        refundLimit: null,
        stores: [storeId]
      }, owner.cookie)
    )
    const invited = [
      { email: `trash-${run}-tidy@invited.test`, roleId: made.id },
      { email: `trash-${run}-admin@invited.test`, roleId: "admin" }
    ]
    ok(
      await rpc("Invitations.send", {
        rows: invited.map((i) => ({ email: i.email, roleId: i.roleId, stores: "all" as const }))
      }, owner.cookie)
    )
    await pastUndo(workspace)
    await relay(workspace)
    people.tidy = await join(invited[0]!.email)
    people.admin = await join(invited[1]!.email)
  }, 120_000)

  it("lists each kind with who removed it, and puts each back through its own slice with its undo", async () => {
    const set = await removedSet("terug")
    const listed = await trash(people.owner)
    const byId = new Map(listed.map((i) => [i.id, i]))
    expect(byId.get(set.automation)).toMatchObject({ kind: "automation", title: "Flow terug" })
    expect(byId.get(set.sheet)).toMatchObject({ kind: "sheet", title: "Blad terug" })
    expect(byId.get(set.course)).toMatchObject({ kind: "course", title: "Cursus terug" })
    // An endpoint without a description is its URL's host only: a path or query can hold a token.
    expect(byId.get(set.webhook)).toMatchObject({ kind: "webhook", title: "trash.webhooks.example" })
    expect(byId.get(set.cost)).toMatchObject({ kind: "cost_line", title: "Post terug" })
    for (const id of Object.values(set)) {
      expect(byId.get(id)!.deletedBy).toBe("Persoon trash-kinds")
      expect(byId.get(id)!.purgeAt - byId.get(id)!.deletedAt).toBe(30 * 86_400_000)
    }

    const ids = Object.values(set)
    const back = ok(await rpc("Trash.restore", { ids }, people.owner))
    expect(back.restored).toEqual(ids)
    expect(back.undo).toHaveLength(5)
    const left = (await trash(people.owner)).map((i) => i.id)
    for (const id of ids) expect(left).not.toContain(id)
    expect(ok(await rpc("Automations.get", { id: set.automation }, people.owner)).automation.name).toBe("Flow terug")
    expect(ok(await rpc("Sheets.get", { id: set.sheet }, people.owner)).title).toBe("Blad terug")
    expect(JSON.stringify(ok(await rpc("Courses.list", undefined, people.owner)))).toContain(set.course)
    expect(ok(await rpc("Webhooks.list", undefined, people.owner)).map((e) => e.id)).toContain(set.webhook)
    expect(ok(await rpc("Costs.list", {}, people.owner)).lines.map((l) => l.id)).toContain(set.cost)

    // Ongedaan maken: each slice's own undo puts its item in the trash again.
    for (const ticket of back.undo) ok(await rpc("Shared.undo", { token: ticket.token }, people.owner))
    expect((await trash(people.owner)).map((i) => i.id)).toEqual(expect.arrayContaining(ids))
    expect(ok(await rpc("Webhooks.list", undefined, people.owner)).map((e) => e.id)).not.toContain(set.webhook)

    // Clean up for the next tests.
    ok(await rpc("Trash.purge", { ids }, people.owner))
  })

  it("shows a sheet to its owner only, and holds each kind to its own area's level", async () => {
    const set = await removedSet("rechten")
    const admin = (await trash(people.admin)).map((i) => i.id)
    expect(admin).toEqual(expect.arrayContaining([set.automation, set.course, set.webhook, set.cost]))
    expect(admin).not.toContain(set.sheet)
    expect(failure(await rpc("Trash.restore", { ids: [set.sheet] }, people.admin))).toMatchObject({
      _tag: "NotFound",
      entity: "trash_item"
    })
    expect(failure(await rpc("Trash.purge", { ids: [set.sheet] }, people.admin))).toMatchObject({ _tag: "NotFound" })

    // Opruimer sees a course only at Cursussen · Bewerken, and puts nothing back that their role could not remove.
    const tidy = (await trash(people.tidy)).map((i) => i.id)
    expect(tidy).toEqual(expect.arrayContaining([set.automation, set.webhook, set.cost]))
    expect(tidy).not.toContain(set.course)
    expect(tidy).not.toContain(set.sheet)
    expect(failure(await rpc("Trash.restore", { ids: [set.automation] }, people.tidy))).toMatchObject({
      _tag: "Forbidden",
      permission: "automations",
      level: 3
    })
    expect(failure(await rpc("Trash.restore", { ids: [set.cost] }, people.tidy))).toMatchObject({
      _tag: "Forbidden",
      permission: "costs.write"
    })
    // Two kinds at once: one refused puts neither back.
    expect(failure(await rpc("Trash.restore", { ids: [set.webhook, set.automation] }, people.tidy))).toMatchObject({
      _tag: "Forbidden"
    })
    // An endpoint for every store does not come back for someone held to one.
    expect(failure(await rpc("Trash.restore", { ids: [set.webhook] }, people.tidy))).toMatchObject({
      _tag: "Conflict",
      reason: "out_of_reach"
    })
    expect((await trash(people.owner)).map((i) => i.id)).toEqual(expect.arrayContaining(Object.values(set)))
    expect(failure(await rpc("Trash.purge", { ids: [set.automation] }, people.tidy))).toMatchObject({
      _tag: "Forbidden"
    })

    // The owner purges them all: gone from their pages, and from the trash.
    expect(ok(await rpc("Trash.purge", { ids: Object.values(set) }, people.owner))).toEqual({ purged: 5 })
    expect(failure(await rpc("Automations.get", { id: set.automation }, people.owner))).toMatchObject({
      _tag: "NotFound"
    })
    expect(failure(await rpc("Sheets.get", { id: set.sheet }, people.owner))).toMatchObject({ _tag: "SheetNotFound" })
    expect(JSON.stringify(ok(await rpc("Courses.list", undefined, people.owner)))).not.toContain(set.course)
    expect(ok(await rpc("Costs.list", {}, people.owner)).lines.map((l) => l.id)).not.toContain(set.cost)
    expect(ok(await rpc("Webhooks.list", undefined, people.owner)).map((e) => e.id)).not.toContain(set.webhook)
    expect(await trash(people.owner)).toEqual([])
  })

  it("sweeps every kind past its 30 days, and keeps what did not pass them", async () => {
    const old = await removedSet("oud")
    // The kinds joined long before: these count from their removal, 31 days ago.
    expect(await sweep(workspace, { age: 31, joined: 60 })).toEqual({ purged: 5 })
    expect(failure(await rpc("Automations.get", { id: old.automation }, people.owner))).toMatchObject({
      _tag: "NotFound"
    })
    const fresh = await removedSet("vers")
    expect(await sweep(workspace, { age: 0, joined: 0 })).toEqual({ purged: 0 })
    expect((await trash(people.owner)).map((i) => i.id).toSorted()).toEqual(Object.values(fresh).toSorted())
    expect(ok(await rpc("Trash.empty", undefined, people.owner)).purged).toBe(5)
    expect(await trash(people.owner)).toEqual([])
  })

  it("gives what was removed before its kind joined the trash 30 days from that moment", async () => {
    const before = Object.values(await removedSet("voor"))
    try {
      // Removed 40 days before the kinds joined, a day ago: still in the trash, with 29 days to go.
      expect(await sweep(workspace, { age: 41, joined: 1 })).toEqual({ purged: 0 })
      const listed = (await trash(people.owner)).filter((i) => before.includes(i.id))
      expect(listed).toHaveLength(5)
      for (const item of listed) {
        expect(Math.round((Date.now() - item.deletedAt) / DAY)).toBe(41)
        expect(Math.round((item.purgeAt - Date.now()) / DAY)).toBe(29)
      }
      // Day 30 of the kinds in the trash has passed: gone.
      expect(await sweep(workspace, { age: 0, joined: 31 })).toEqual({ purged: 5 })
      expect(await trash(people.owner)).toEqual([])
      expect(failure(await rpc("Sheets.get", { id: before[1]! }, people.owner))).toMatchObject({
        _tag: "SheetNotFound"
      })
    } finally {
      // The join moment is the stage's: back to now for whoever sweeps next.
      await sweep(workspace, { age: 0, joined: 0 })
    }
  })
})
