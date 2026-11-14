import type StripeSdk from "stripe"

/*
 * Stripe's SDK (`stripe`, pinned), loaded on first use and never with a module that imports this one: the API Worker
 * reaches it only from the adapters, which load on the first billing call (ADR-0041 §3). On Workers it runs over
 * `fetch` and SubtleCrypto. A load that fails is that call's failure; the next call loads again.
 */

type Sdk = typeof StripeSdk

let loading: Promise<Sdk> | undefined

export const loadSdk = (): Promise<
  Sdk
> => (loading ??= import("stripe").then((m) => m.default).catch((error: unknown) => {
  loading = undefined
  throw error
}))

/** Stripe's tolerance for a signed delivery's age, in seconds: its libraries' default. */
const TOLERANCE_S = 300

/**
 * Whether `header` (`Stripe-Signature`) signs `body` with `secret`, as Stripe's SDK checks it: a `v1` HMAC of
 * `t.body`, no older than five minutes at `now`.
 */
export const verifySignature = async (secret: string, body: Uint8Array, header: string, now: Date) => {
  const Stripe = await loadSdk()
  try {
    await Stripe.webhooks.constructEventAsync(
      // The SDK reads a `Uint8Array` as the raw bytes; its types say `Buffer`.
      body as unknown as string,
      header,
      secret,
      TOLERANCE_S,
      Stripe.createSubtleCryptoProvider(),
      now.getTime()
    )
    return true
  } catch {
    return false
  }
}

/** A `Stripe-Signature` header for `payload`, as Stripe writes it: what the tests sign their deliveries with. */
export const testSignature = async (secret: string, payload: string, at = new Date()) => {
  const Stripe = await loadSdk()
  return Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
    timestamp: Math.floor(at.getTime() / 1000),
    cryptoProvider: Stripe.createSubtleCryptoProvider()
  })
}
