import { describe, expect, it } from "vitest"
import { askStream } from "../src/data/ask.ts"

/*
 * Vraag Insyte's two places (M15 step 3): the page and the top bar's panel each ask through their own call, so a question
 * on one never interrupts an answer streaming on the other; each place keeps the same call across renders.
 */

describe("a question's call", () => {
  it("is the page's own and the panel's own", () => {
    expect(askStream("page")).not.toBe(askStream("panel"))
    expect(askStream("page")).toBe(askStream("page"))
    expect(askStream("panel")).toBe(askStream("panel"))
  })
})
