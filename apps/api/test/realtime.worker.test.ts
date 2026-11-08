import { describe, expect, it } from "vitest"
import { ok, person, relay } from "./journeys.ts"
import { call, rpc, sessionMe } from "./support.ts"

/*
 * Realtime on the server (step 7.2, M5.1, ADR-0013): a tab's socket through `/api/realtime` joins its workspace's room,
 * named by the session, never by the client; the first frame says who is here; a write recorded in the workspace
 * reaches that room as `records.changed` (ids only), and no other room.
 */

/** A tab: the socket and every frame it received. */
const open = async (cookie: string) => {
  const response = await call("http://api.test/api/realtime", { headers: { upgrade: "websocket", cookie } })
  expect(response.status).toBe(101)
  const socket = response.webSocket!
  const frames: Array<{ type: string; [field: string]: unknown }> = []
  socket.addEventListener("message", (e) => frames.push(JSON.parse(String(e.data))))
  socket.accept()
  return { socket, frames }
}

/** The frame a role change sends. */
const isRole = (f: { type: string; [field: string]: unknown }) => f.type === "records.changed" && f["kind"] === "role"

const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 50; i++) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`waited for ${what}`)
}

describe("realtime", () => {
  it("refuses a request that is no upgrade, and an upgrade without a session", async () => {
    expect((await call("http://api.test/api/realtime")).status).toBe(426)
    expect((await call("http://api.test/api/realtime", { headers: { upgrade: "websocket" } })).status).toBe(401)
  })

  it("joins the workspace's room, says who is here, and sends its changes there only", async () => {
    const owner = await person("rt-owner", "Live B.V.")
    const other = await person("rt-other", "Ander B.V.")
    const workspace = ok(await sessionMe(owner.cookie)).principals[0]!.workspaceId
    const memberId = ok(await sessionMe(owner.cookie)).principals[0]!.id

    const tab = await open(owner.cookie)
    const elsewhere = await open(other.cookie)
    await until(() => tab.frames.some((f) => f.type === "hello"), "hello")
    expect(tab.frames[0]).toMatchObject({ v: 1, type: "hello", presence: [{ memberId }] })

    // A second tab of the same person: no presence change for the first.
    const second = await open(owner.cookie)
    await until(() => second.frames.some((f) => f.type === "hello"), "the second hello")
    expect(tab.frames.filter((f) => f.type === "presence")).toHaveLength(0)

    // A recorded change in Live B.V. reaches its room.
    const role = ok(await rpc("Roles.create", { label: "Retourbalie", from: "service" }, owner.cookie))
    await relay(workspace)
    await until(() => tab.frames.some(isRole), "records.changed for the role")
    const changed = tab.frames.find(isRole)
    expect(changed).toMatchObject({ v: 1, kind: "role", ids: [expect.any(String)] })
    expect(JSON.stringify(changed)).not.toContain("Retourbalie")
    expect(changed!["ids"]).toEqual([role.id])
    expect(second.frames.some(isRole)).toBe(true)
    // Ander B.V.'s tab heard nothing of it (its own workspace's changes are its own business).
    expect(JSON.stringify(elsewhere.frames)).not.toContain(role.id)
    expect(elsewhere.frames.some(isRole)).toBe(false)

    for (const t of [tab, second, elsewhere]) t.socket.close(1000, "done")
  })
})
