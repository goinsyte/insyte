import { runInDurableObject } from "cloudflare:test"
import { env } from "cloudflare:workers"
import { describe, expect, it } from "vitest"
import { ROOM_MEMBER, RoomDurableObject } from "../src/platform/Room.ts"
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

/** An upgrade straight to a room, as the API Worker forwards it, for `member`. */
const upgrade = (memberId: string) =>
  new Request("http://room.test/", { headers: { upgrade: "websocket", [ROOM_MEMBER]: memberId } })

/** A tab joined through `answer` (a room's `fetch`); the hello's `quiet` once it came. */
const join = async (answer: Promise<Response> | Response) => {
  const response = await answer
  expect(response.status).toBe(101)
  const frames: Array<{ type: string; [field: string]: unknown }> = []
  response.webSocket!.addEventListener("message", (e) => frames.push(JSON.parse(String(e.data))))
  response.webSocket!.accept()
  await until(() => frames.some((f) => f.type === "hello"), "hello")
  return { socket: response.webSocket!, quiet: frames.find((f) => f.type === "hello")!["quiet"] as number }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

  /*
   * The hello's `quiet` (how long since the room last sent a frame a tab refetches on), straight on rooms of their own
   * that nothing else sends to, so each number is the room's own reckoning.
   */
  describe("how long the room has been quiet", () => {
    let rooms = 0
    const room = () => env.ROOMS.getByName(`ws:quiet-${Date.now()}-${rooms++}`)
    it("counts from the room's start, says when a frame went out, and leaves typing out", async () => {
      const stub = room()
      // Never sent anything: a room that has just started cannot know, so it says "just now".
      const first = await join(stub.fetch(upgrade("m_1")))
      expect(first.quiet).toBeGreaterThanOrEqual(0)
      expect(first.quiet).toBeLessThan(250)
      // Quiet since: counted from that start, not from some time long before.
      await wait(300)
      const second = await join(stub.fetch(upgrade("m_2")))
      expect(second.quiet).toBeGreaterThanOrEqual(300)
      expect(second.quiet).toBeLessThan(5_000)
      // Someone typing changes nothing a tab reads again.
      await stub.broadcast({ v: 1, type: "chat.typing", conversationId: "c_1", principalId: "p_1" })
      const typed = await join(stub.fetch(upgrade("m_3")))
      expect(typed.quiet).toBeGreaterThanOrEqual(300)
      // A change goes out: the next tab hears it was just now.
      const before = Date.now()
      await stub.broadcast({ v: 1, type: "records.changed", kind: "role", ids: [] })
      const late = await join(stub.fetch(upgrade("m_4")))
      expect(late.quiet).toBeLessThanOrEqual(Date.now() - before)
      for (const t of [first, second, typed, late]) t.socket.close(1000, "done")
    })

    it("wakes over sockets from before it kept the time, and still says a quiet a tab can read", async () => {
      const stub = room()
      const old = await join(stub.fetch(upgrade("m_old")))
      await wait(300)
      await runInDurableObject(stub, async (_room: RoomDurableObject, state) => {
        // The sockets as the code before kept them, which a room hibernated over a deploy wakes with.
        for (const ws of state.getWebSockets()) ws.serializeAttachment({ memberId: "m_old", joinedAt: Date.now() })
        // Woken: a new instance over the same sockets, as the runtime makes one.
        const woken = new RoomDurableObject(state, env)
        const tab = await join(woken.fetch(upgrade("m_new")))
        expect(Number.isFinite(tab.quiet)).toBe(true)
        expect(tab.quiet).toBeLessThan(250)
        // What the new socket keeps is a time too, for the next wake.
        for (const ws of state.getWebSockets()) {
          const kept = ws.deserializeAttachment() as { memberId: string; lastFrameAt?: number }
          if (kept.memberId === "m_new") expect(Number.isFinite(kept.lastFrameAt)).toBe(true)
        }
        tab.socket.close(1000, "done")
      })
      old.socket.close(1000, "done")
    })

    it("wakes over its sockets with the time of its last frame", async () => {
      const stub = room()
      const tab = await join(stub.fetch(upgrade("m_1")))
      await stub.broadcast({ v: 1, type: "records.changed", kind: "role", ids: [] })
      await wait(300)
      await runInDurableObject(stub, async (_room: RoomDurableObject, state) => {
        const woken = new RoomDurableObject(state, env)
        const next = await join(woken.fetch(upgrade("m_2")))
        expect(next.quiet).toBeGreaterThanOrEqual(300)
        expect(next.quiet).toBeLessThan(5_000)
        next.socket.close(1000, "done")
      })
      tab.socket.close(1000, "done")
    })
  })
})
