import type { QueueList } from "@insyte/modules/queue/domain/Queue"
import { describe, expect, it } from "vitest"
import { needsOf, queueCountsIn } from "../src/data/queue.ts"

/*
 * Vraag Insyte's welcome names how many things wait on the person ("3 zaken wachten op jou"), as Start's hero counts
 * them: the open rows that are red or amber. Nothing while the queue is unread or refused, so the line stays out.
 */
describe("Vraag Insyte's waiting count", () => {
  it("is Start's needs-you figure, or nothing while the queue is not read", () => {
    const list = { counts: { needsYou: 3, drawn: 1, all: 7 } } as unknown as QueueList
    expect(needsOf(list)).toBe(3)
    expect(needsOf({ counts: { needsYou: 0, drawn: 0, all: 0 } } as unknown as QueueList)).toBe(0)
    expect(needsOf(undefined)).toBeNull()
  })
})

/*
 * The frame's queue figures (the panel's "Wacht op jou" and "Voorstellen klaar", the top bar's proposals) come with the
 * frame, by store: the store in view picks its own and the storeless rows, every store all of them.
 */
describe("the frame's queue figures", () => {
  const byStore = [
    { storeId: "sto_a", needsYou: 2, drawn: 1 },
    { storeId: "sto_b", needsYou: 5, drawn: 0 },
    { storeId: null, needsYou: 1, drawn: 1 }
  ]

  it("are one store's and the storeless rows, or all of them, and none while the store in view is unknown", () => {
    expect(queueCountsIn(byStore, "sto_a")).toEqual({ needsYou: 3, drawn: 2 })
    expect(queueCountsIn(byStore, null)).toEqual({ needsYou: 8, drawn: 2 })
    expect(queueCountsIn([], null)).toEqual({ needsYou: 0, drawn: 0 })
    expect(queueCountsIn(byStore, undefined)).toBeUndefined()
  })
})
