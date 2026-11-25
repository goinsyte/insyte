import { missedBeforeHello } from "@insyte/api/Frames"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { Reactivity } from "effect/reactivity"
import { Socket } from "effect/socket"
import { describe, expect, it } from "vitest"
import { KEYS } from "../src/data/developer.ts"
import { connection } from "../src/data/realtime.ts"
import { TEAM } from "../src/data/team.ts"

/*
 * A tab reads its page (on the server, or by its first queries) before its socket joins, so a frame the room sends in
 * between never reaches it. The hello says how long the room has been quiet; the tab's first socket refetches what it
 * shows when that is shorter than the page has been loading, and keeps what it has when the room was quiet longer.
 */

type Listener = (event: Socket.WebSocketEvent) => void

/** A socket that is open at once and receives `frames`, one batch each, in order. */
const socketSaying = (frames: ReadonlyArray<unknown>) =>
  Layer.succeed(Socket.WebSocketConstructor)(() => {
    const listeners = new Map<string, Set<Listener>>()
    frames.forEach((frame, i) =>
      setTimeout(() => {
        for (const listener of listeners.get("message") ?? []) {
          listener({ type: "message", data: JSON.stringify(frame) })
        }
      }, i + 1)
    )
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

const heard = { present: () => {}, typing: () => {} }

/**
 * Whether a socket whose hello says `quiet` refetched the Team page. A later frame (an API key changed) marks the
 * hello's batch as done, so the answer never waits on a timer.
 */
const refetchesTeam = (hello: Record<string, unknown>, reconnected = false) =>
  Effect.gen(function*() {
    const reactivity = yield* Reactivity.Reactivity
    let team = 0
    const after = yield* Deferred.make<void>()
    reactivity.registerUnsafe(TEAM, () => team++)
    reactivity.registerUnsafe(KEYS, () => Deferred.doneUnsafe(after, Effect.void))
    const fiber = yield* Effect.forkChild(connection("ws://console.test/api/realtime", reconnected, heard))
    yield* Deferred.await(after)
    yield* Fiber.interrupt(fiber)
    return team > 0
  }).pipe(
    Effect.provide([
      Reactivity.layer,
      socketSaying([
        { v: 1, type: "hello", presence: [], ...hello },
        { v: 1, type: "records.changed", kind: "api_key", ids: [] }
      ])
    ]),
    Effect.runPromise
  )

describe("the first hello on a tab", () => {
  it("refetches when the room sent a frame as the page loaded", async () => {
    expect(await refetchesTeam({ quiet: 0 })).toBe(true)
  })

  it("keeps the page when the room was quiet for longer than the page has been loading", async () => {
    expect(await refetchesTeam({ quiet: Number.MAX_SAFE_INTEGER })).toBe(false)
  })

  it("refetches when the room cannot say", async () => {
    expect(await refetchesTeam({})).toBe(true)
  })

  it("refetches after a gap however quiet the room was", async () => {
    expect(await refetchesTeam({ quiet: Number.MAX_SAFE_INTEGER }, true)).toBe(true)
  })
})

/** A hello, with how long the room says it has been quiet. */
const hello = (quiet?: number) =>
  ({ v: 1, type: "hello", presence: [], ...(quiet === undefined ? {} : { quiet }) }) as const

describe("missedBeforeHello", () => {
  it("compares the room's quiet with how long the page has been loading, with a second's slack", () => {
    expect(missedBeforeHello(hello(1_500), 2_000)).toBe(true)
    expect(missedBeforeHello(hello(2_500), 2_000)).toBe(true)
    expect(missedBeforeHello(hello(3_500), 2_000)).toBe(false)
    expect(missedBeforeHello(hello(), 2_000)).toBe(true)
  })
})
