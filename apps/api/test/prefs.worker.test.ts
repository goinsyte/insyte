import { describe, expect, it } from "vitest"
import { failure, ok, person } from "./journeys.ts"
import { rpc } from "./support.ts"

/*
 * A member's own corner on the server (step 7.1, M4.2): preferences per section with a version, so a second tab that
 * wrote in between is told rather than overwritten; recents trimmed and newest first; saved views with names unique
 * per list; to-dos. Removing either is undone by restoring it.
 */

const group = (field: string, value: string) => ({
  kind: "group" as const,
  id: "g1",
  join: "and" as const,
  children: [{ kind: "rule" as const, id: "r1", field, op: "is", value: [value] }]
})

describe("preferences, views, to-dos and recents", () => {
  let owner = { email: "", cookie: "" }

  it("writes a section over the version it read, and refuses a stale one", async () => {
    owner = await person("prefs-owner", "Voorkeur B.V.")
    expect(ok(await rpc("Prefs.get", undefined, owner.cookie))).toMatchObject({ sections: {}, recents: [] })

    const board = { layout: ["queue", "todo"], density: "compact" }
    expect(ok(await rpc("Prefs.patch", { section: "board", value: board, baseVersion: 0 }, owner.cookie))).toEqual({
      value: board,
      version: 1
    })
    // A second tab that read before the first wrote.
    expect(failure(await rpc("Prefs.patch", { section: "board", value: {}, baseVersion: 0 }, owner.cookie)))
      .toMatchObject(
        { _tag: "Conflict", reason: "stale_version" }
      )
    expect(
      ok(
        await rpc(
          "Prefs.patch",
          { section: "board", value: { ...board, density: "roomy" }, baseVersion: 1 },
          owner.cookie
        )
      ).version
    )
      .toBe(2)
    const prefs = ok(await rpc("Prefs.get", undefined, owner.cookie))
    expect(prefs.sections["board"]).toEqual({ value: { ...board, density: "roomy" }, version: 2 })

    const huge = { blob: "x".repeat(40_000) }
    expect(failure(await rpc("Prefs.patch", { section: "home", value: huge, baseVersion: 0 }, owner.cookie)))
      .toMatchObject({
        _tag: "Invalid",
        fields: { value: "too_large" }
      })
  })

  it("keeps recents newest first, one per page, the label as last seen", async () => {
    ok(await rpc("Prefs.recordVisit", { path: "/settings/team", kind: "settings", label: "Team" }, owner.cookie))
    ok(await rpc("Prefs.recordVisit", { path: "/settings/roles", kind: "settings", label: "Rollen" }, owner.cookie))
    const recents = ok(
      await rpc(
        "Prefs.recordVisit",
        { path: "/settings/team", kind: "settings", label: "Team en rollen" },
        owner.cookie
      )
    )
    expect(recents.map((r) => [r.path, r.label])).toEqual([
      ["/settings/team", "Team en rollen"],
      ["/settings/roles", "Rollen"]
    ])
    for (let i = 0; i < 25; i++) {
      ok(await rpc("Prefs.recordVisit", { path: `/orders/ord_${i}`, kind: "order", label: `SO-${i}` }, owner.cookie))
    }
    const shown = ok(await rpc("Prefs.get", undefined, owner.cookie)).recents
    expect(shown).toHaveLength(20)
    expect(shown[0]!.path).toBe("/orders/ord_24")
  })

  it("saves views with a name unique per list, renames, pins, removes and restores them", async () => {
    const saved = ok(
      await rpc(
        "Views.save",
        { listKey: "orders", name: "Vertraagd bij Linyi", filter: group("supplier", "linyi") },
        owner.cookie
      )
    )
    expect(saved).toEqual([expect.objectContaining({ listKey: "orders", name: "Vertraagd bij Linyi", pinned: false })])
    const id = saved[0]!.id
    expect(failure(
      await rpc("Views.save", { listKey: "orders", name: "vertraagd bij linyi", filter: group("x", "y") }, owner.cookie)
    )).toMatchObject({ _tag: "ViewNameTaken" })
    // The same name on another list is fine.
    expect(
      ok(
        await rpc(
          "Views.save",
          { listKey: "tickets", name: "Vertraagd bij Linyi", filter: group("x", "y") },
          owner.cookie
        )
      )
    )
      .toHaveLength(2)

    expect(ok(await rpc("Views.togglePin", { id }, owner.cookie)).find((v) => v.id === id)?.pinned).toBe(true)
    expect(ok(await rpc("Views.rename", { id, name: "Linyi te laat" }, owner.cookie)).find((v) => v.id === id)?.name)
      .toBe("Linyi te laat")
    const updated = ok(await rpc("Views.update", { id, filter: group("supplier", "allure") }, owner.cookie))
    expect(updated.find((v) => v.id === id)?.filter.children[0]).toMatchObject({ value: ["allure"] })

    expect(ok(await rpc("Views.remove", { id }, owner.cookie)).map((v) => v.id)).not.toContain(id)
    // A new view took the name in the meantime: putting the old one back would clash.
    ok(await rpc("Views.save", { listKey: "orders", name: "Linyi te laat", filter: group("a", "b") }, owner.cookie))
    expect(failure(await rpc("Views.restore", { id }, owner.cookie))).toMatchObject({ _tag: "ViewNameTaken" })
    expect(failure(await rpc("Views.update", { id: "view_none", filter: group("a", "b") }, owner.cookie)))
      .toMatchObject({
        _tag: "NotFound"
      })
  })

  it("adds, ticks off, removes and restores to-dos", async () => {
    expect(failure(await rpc("Todos.add", { text: "  ", due: "morgen" }, owner.cookie))).toMatchObject({
      _tag: "Invalid",
      fields: { text: "required", due: "format" }
    })
    ok(await rpc("Todos.add", { text: "Bel Linyi over SO-12218", due: "2026-11-10" }, owner.cookie))
    const two = ok(await rpc("Todos.add", { text: "Retouren nalopen", due: null }, owner.cookie))
    expect(two.map((t) => t.text)).toEqual(["Retouren nalopen", "Bel Linyi over SO-12218"])
    const call = two[1]!
    expect(call.due).toBe("2026-11-10")

    const ticked = ok(await rpc("Todos.toggle", { id: call.id }, owner.cookie))
    expect(ticked.at(-1)).toMatchObject({ id: call.id, done: true })
    expect(ticked.at(-1)!.doneAt).toBeGreaterThan(0)
    expect(ok(await rpc("Todos.remove", { id: call.id }, owner.cookie))).toHaveLength(1)
    expect(ok(await rpc("Todos.restore", { id: call.id }, owner.cookie))).toHaveLength(2)
  })
})
