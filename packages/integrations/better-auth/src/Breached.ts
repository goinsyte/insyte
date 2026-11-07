/*
 * Have I Been Pwned's range API, k-anonymously (M2.3): only the first five hex characters of the password's SHA-1
 * leave the Worker, and the answer is every suffix with that prefix, compared here. Ours rather than better-auth's
 * plugin because that one fails closed: an HIBP outage would stop every sign-up. This one fails open after 1.5 s.
 */

const RANGE = "https://api.pwnedpasswords.com/range/"

const sha1Hex = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()
}

/** Whether the password appears in a known breach. `false` when HIBP does not answer in time or at all. */
export const isBreached = async (
  password: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 1500
): Promise<boolean> => {
  const hash = await sha1Hex(password)
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  try {
    // `Add-Padding` makes every answer about the same size, so the response's length says nothing either.
    const response = await fetcher(`${RANGE}${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!response.ok) return false
    const body = await response.text()
    return body.split("\n").some((line) => {
      const [candidate, count] = line.trim().split(":")
      return candidate === suffix && Number(count) > 0
    })
  } catch {
    return false
  }
}
