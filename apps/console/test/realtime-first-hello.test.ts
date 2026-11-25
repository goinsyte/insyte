import { documentAge, missedBeforeHello } from "@insyte/api/Frames"
import { Effect, Fiber, Layer } from "effect"
import { Reactivity } from "effect/reactivity"
import { Socket } from "effect/socket"
import { describe, expect, it, vi } from "vitest"
import { connection } from "../src/data/realtime.ts"
import { PORTAL } from "../src/data/supplier-portal.ts"
import { connection as portalConnection } from "../src/data/supplier-realtime.ts"
import { TEAM } from "../src/data/team.ts"

/*
 * A tab reads its page (on the server, or by its first queries) before its socket joins, so a frame the room sends in
 * between never reaches it. The hello says how long the room has been quiet; the tab's first socket refetches what it
 * shows when that is shorter than the page has been open, and keeps what it has when the room was quiet longer. The
 * supplier portal's socket follows the same rule.
 */

type Listener = (event: Socket.WebSocketEvent) => void

/** A socket that is open at once, receives `frames`, then closes, so the connection ends once it has read them. */
const socketSaying = (frames: ReadonlyArray<unknown>) =>
  Layer.succeed(Socket.WebSocketConstructor)(() => {
    const listeners = new Map<string, Set<Listener>>()
    const emit = (type: string, event: Socket.WebSocketEvent) => {
      for (const listener of listeners.get(type) ?? []) listener(event)
    }
    setTimeout(() => {
      for (const frame of frames) emit("message", { type: "message", data: JSON.stringify(frame) })
      emit("close", { type: "close", code: 1000, reason: "" })
    }, 1)
    return {
      readyState: 1,
      addEventListener: (type, listener) => {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(listener))
      },
      removeEventListener: (type, listener) => {
        listeners.get(type)?.delete(listener)
      },
      close: () => {},
      send: () => {}
    }
  })

/** Runs `run` to its end over a socket that says `hello`; how often `keys` were refetched, and who it heard is here. */
const over = <E>(
  keys: ReadonlyArray<string>,
  hello: Record<string, unknown>,
  run: Effect.Effect<unknown, E, Reactivity.Reactivity | Socket.WebSocketConstructor>
) =>
  Effect.gen(function*() {
    const reactivity = yield* Reactivity.Reactivity
    let refetched = 0
    reactivity.registerUnsafe(keys, () => refetched++)
    yield* Fiber.await(yield* Effect.forkChild(run))
    return refetched
  }).pipe(
    Effect.provide([Reactivity.layer, socketSaying([{ v: 1, type: "hello", presence: [], ...hello }])]),
    Effect.runPromise
  )

const present: Array<ReadonlyArray<string>> = []
const heard = { present: (ids: ReadonlyArray<string>) => present.push(ids), typing: () => {} }
const url = "ws://console.test/api/realtime"

/** Whether a tab's socket whose hello says `hello` refetched the Team page. */
const refetchesTeam = async (hello: Record<string, unknown>, reconnected = false) =>
  (await over(TEAM, hello, connection(url, reconnected, heard))) > 0

/** Whether a portal's socket whose hello says `hello` refetched the portal. */
const refetchesPortal = async (hello: Record<string, unknown>, reconnected = false) =>
  (await over(PORTAL, hello, portalConnection(url, reconnected))) > 0

describe("the first hello on a tab", () => {
  it("refetches when the room sent a frame as the page loaded", async () => {
    expect(await refetchesTeam({ quiet: 0 })).toBe(true)
  })

  it("keeps the page when the room was quiet for longer than the page has been open", async () => {
    expect(await refetchesTeam({ quiet: Number.MAX_SAFE_INTEGER })).toBe(false)
  })

  it("refetches when the room cannot say, and still hears who is here", async () => {
    expect(await refetchesTeam({})).toBe(true)
    present.length = 0
    expect(await refetchesTeam({ quiet: null, presence: [{ memberId: "m_1", since: 1 }] })).toBe(true)
    expect(present).toEqual([["m_1"]])
  })

  it("refetches after a gap however quiet the room was", async () => {
    expect(await refetchesTeam({ quiet: Number.MAX_SAFE_INTEGER }, true)).toBe(true)
  })
})

describe("the first hello on the supplier portal", () => {
  it("refetches the portal when the room sent a frame as it loaded, or cannot say", async () => {
    expect(await refetchesPortal({ quiet: 0 })).toBe(true)
    expect(await refetchesPortal({ quiet: null })).toBe(true)
  })

  it("keeps the portal when the room was quiet longer, but not after a gap", async () => {
    expect(await refetchesPortal({ quiet: Number.MAX_SAFE_INTEGER })).toBe(false)
    expect(await refetchesPortal({ quiet: Number.MAX_SAFE_INTEGER }, true)).toBe(true)
  })
})

/** A hello, with how long the room says it has been quiet. */
const hello = (quiet?: number | null) =>
  ({ v: 1, type: "hello", presence: [], ...(quiet === undefined ? {} : { quiet }) }) as const

describe("missedBeforeHello", () => {
  it("compares the room's quiet with how long the page has been open, with a second's slack", () => {
    expect(missedBeforeHello(hello(1_500), 2_000)).toBe(true)
    expect(missedBeforeHello(hello(2_500), 2_000)).toBe(true)
    expect(missedBeforeHello(hello(3_500), 2_000)).toBe(false)
    expect(missedBeforeHello(hello(), 2_000)).toBe(true)
    expect(missedBeforeHello(hello(null), 2_000)).toBe(true)
  })

  it("counts the document's age by the wall clock too, which keeps running while a device sleeps", () => {
    // A `performance.now()` that stood still while the device slept.
    const now = vi.spyOn(performance, "now").mockReturnValue(0)
    try {
      expect(documentAge()).toBeGreaterThan(0)
    } finally {
      now.mockRestore()
    }
  })
})
