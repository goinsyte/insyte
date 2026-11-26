import { describe, expect, it } from "vitest"
import { type Polled, settleDelivery } from "../src/settings/webhook-settle.ts"

/*
 * A test send on Instellingen → Webhooks: once its attempt is in, the endpoint's header and its delivery row read again,
 * so they show the failure (or the success) at once instead of the state from before the attempt.
 */

const now = () => Promise.resolve()

const pending: Polled = { delivery: { outcome: "pending", attempts: 0 } }
const failed: Polled = { delivery: { outcome: "failed", attempts: 1 } }

describe("settling a webhook test send", () => {
  it("reads the page again once the attempt is in", async () => {
    const answers = [pending, pending, failed]
    const order: Array<string> = []
    const result = await settleDelivery(
      () => {
        order.push("poll")
        return Promise.resolve(answers.shift())
      },
      () => order.push("reRead"),
      now
    )
    expect(result).toBe(failed)
    expect(order).toEqual(["poll", "poll", "poll", "reRead"])
  })

  it("reads the page again when it gives up waiting", async () => {
    let polls = 0
    let reReads = 0
    const result = await settleDelivery(
      () => {
        polls++
        return Promise.resolve(pending)
      },
      () => reReads++,
      now
    )
    expect(result).toBe(pending)
    expect(polls).toBe(20)
    expect(reReads).toBe(1)
  })

  it("keeps the last answer when a later read fails", async () => {
    const answers: Array<Polled | undefined> = [undefined, { delivery: { outcome: "delivered", attempts: 1 } }]
    const result = await settleDelivery(() => Promise.resolve(answers.shift()), () => undefined, now)
    expect(result?.delivery.outcome).toBe("delivered")
  })
})
