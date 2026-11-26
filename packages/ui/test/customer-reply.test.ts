import { describe, expect, it } from "vitest"
import type { Ticket } from "../src/app/lib/types/domain.ts"
import { draftFor, sendFor } from "../src/app/tickets/customer-reply.ts"

/*
 * A ticket's answer to the shopper: Insyte's draft and the mail land in the composer of the ticket they were for,
 * never in another one that opened meanwhile, and Undo of the mail gives the words back.
 */

const ticket = (id: string): Ticket => ({
  id,
  number: "#1",
  title: "Waar blijft mijn pakket",
  description: "",
  status: "intake",
  priority: "medium",
  tags: [],
  assignee_ids: [],
  created_at: "2026-11-26T00:00:00.000Z",
  updated_at: "2026-11-26T00:00:00.000Z"
})

const nothing = () => {}

/** A promise to answer later, as a slow model or mailbox does. */
const later = <A>() => {
  let answer!: (a: A) => void
  const promise = new Promise<A>((resolve) => (answer = resolve))
  return { promise, answer }
}

describe("Insyte's draft", () => {
  it("opens the composer of the ticket it was asked for", async () => {
    const put: Array<string | null> = []
    expect(await draftFor("tkt_a", () => "tkt_a", async () => "Hoi Anna", (t) => put.push(t))).toBe(true)
    expect(put).toEqual(["Hoi Anna"])
  })

  it("is dropped when another ticket opened before it came", async () => {
    let open = "tkt_a"
    const put: Array<string | null> = []
    const slow = later<string | undefined>()
    const done = draftFor("tkt_a", () => open, () => slow.promise, (t) => put.push(t))
    open = "tkt_b"
    slow.answer("Hoi Anna, je bestelling #1003 …")
    expect(await done).toBe(false)
    expect(put).toEqual([])
  })

  it("leaves the composer as it was when none came", async () => {
    const put: Array<string | null> = []
    expect(await draftFor("tkt_a", () => "tkt_a", async () => undefined, (t) => put.push(t))).toBe(true)
    expect(put).toEqual([])
  })
})

describe("the answer mailed", () => {
  it("sends the words, closes the composer, and Undo puts them back", async () => {
    const put: Array<string | null> = []
    const sent: Array<string | undefined> = []
    let undone = nothing
    const went = await sendFor(ticket("tkt_a"), "Hij is onderweg.", () => "tkt_a", async (_t, body, onUndone) => {
      sent.push(body)
      undone = onUndone
      return true
    }, (t) => put.push(t))
    expect(went).toBe(true)
    expect(sent).toEqual(["Hij is onderweg."])
    expect(put).toEqual([null])
    undone()
    expect(put).toEqual([null, "Hij is onderweg."])
  })

  it("keeps the words when it did not go", async () => {
    const put: Array<string | null> = []
    expect(await sendFor(ticket("tkt_a"), "Hoi", () => "tkt_a", async () => false, (t) => put.push(t))).toBe(false)
    expect(put).toEqual([])
  })

  it("touches no other ticket's composer, also on Undo", async () => {
    let open = "tkt_a"
    const put: Array<string | null> = []
    let undone = nothing
    const went = await sendFor(ticket("tkt_a"), undefined, () => open, async (_t, _body, onUndone) => {
      open = "tkt_b"
      undone = onUndone
      return true
    }, (t) => put.push(t))
    expect(went).toBe(true)
    undone()
    expect(put).toEqual([])
  })
})
