import type { QueueList } from "@insyte/modules/queue/domain/Queue"
import { describe, expect, it } from "vitest"
import { needsOf } from "../src/data/queue.ts"

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
