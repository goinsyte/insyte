/*
 * A test send's or a redelivery's result, for Instellingen → Webhooks: the delivery is asked for until its attempt is
 * in, and then the endpoints and their deliveries are read again. The write that started it refreshed them while the
 * attempt was still out, so without the second read the header kept "In orde" and the row 0 attempts.
 */

/** A delivery's state as the poll reads it. */
export interface Polled {
  readonly delivery: { readonly outcome: string; readonly attempts: number }
}

const SETTLED = new Set(["delivered", "failed", "cancelled"])

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Asks `read` until the delivery has settled or made an attempt, for at most twenty asks (about fifteen seconds), then
 * calls `reRead` once, whatever came back: the attempt may have landed between the last ask and the give-up.
 */
export async function settleDelivery<A extends Polled>(
  read: () => Promise<A | undefined>,
  reRead: () => void,
  pause: (ms: number) => Promise<void> = sleep
): Promise<A | undefined> {
  let last: A | undefined
  for (let i = 0; i < 20; i++) {
    await pause(i === 0 ? 400 : 750)
    const polled = await read()
    if (polled !== undefined) {
      last = polled
      if (SETTLED.has(last.delivery.outcome) || last.delivery.attempts > 0) break
    }
  }
  reRead()
  return last
}
