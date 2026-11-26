import { Exit } from "effect"
import { AtomRegistry } from "effect/reactivity"
import { describe, expect, it } from "vitest"
import { inTurn } from "../src/data/in-turn.ts"
import { prefWrites } from "../src/frame/pref-writes.ts"

/*
 * A preference section's writes (`usePrefSection`): the server takes a write only over the version it holds
 * (`Prefs.patch`, `stale_version` otherwise), so a second quick change must go over the first one's answer, not over
 * the version both were asked at.
 */

/** `Prefs.patch` as the server answers it, a little later. */
function server() {
  const state = { value: "start", version: 1, sent: [] as Array<[string, number]> }
  const send = async (value: string, baseVersion: number) => {
    state.sent.push([value, baseVersion])
    await new Promise((resolve) => setTimeout(resolve, 5))
    if (baseVersion !== state.version) return Exit.fail("stale_version")
    state.value = value
    state.version += 1
    return Exit.succeed({ version: state.version })
  }
  return { state, send }
}

function writer(send: ReturnType<typeof server>["send"]) {
  const registry = AtomRegistry.make()
  const atom = {}
  const refused: Array<true> = []
  const write = prefWrites<string>({
    version: { current: 1 },
    lane: (run) => inTurn(registry, atom, run),
    send,
    refused: () => refused.push(true)
  })
  return { write, refused }
}

describe("a preference section's writes", () => {
  it("land both when the second is asked while the first is out", async () => {
    const { state, send } = server()
    const { write, refused } = writer(send)
    const first = write("a")
    await new Promise((resolve) => setTimeout(resolve, 1))
    await Promise.all([first, write("b")])
    expect(state.sent).toEqual([["a", 1], ["b", 2]])
    expect(state).toMatchObject({ value: "b", version: 3 })
    expect(refused).toEqual([])
  })

  it("send only the newest of those still waiting: a section saves whole", async () => {
    const { state, send } = server()
    const { write, refused } = writer(send)
    const first = write("a")
    await new Promise((resolve) => setTimeout(resolve, 1))
    await Promise.all([first, write("b"), write("c")])
    expect(state.sent).toEqual([["a", 1], ["c", 2]])
    expect(state.value).toBe("c")
    expect(refused).toEqual([])
  })

  it("read the frame again when another tab wrote in between", async () => {
    const { state, send } = server()
    const { write, refused } = writer(send)
    state.version = 5
    await write("a")
    expect(state.value).toBe("start")
    expect(refused).toEqual([true])
  })
})
