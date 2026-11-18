/*
 * The log scrubber (17 §6, 08 §6): the second line behind "log ids, never people". A log line may carry ids, enums,
 * counts and causes; it may not carry an address, a name, a phone number, a token or a message's words. The first line
 * is the code, which logs ids. This one runs in the logger itself, on every line the Workers write: a field whose name
 * says it holds a person's data or a secret is replaced whole, and an e-mail address, a phone number, a bearer token, a
 * known key format or a secret in a URL's query is masked wherever it appears in a string, causes and stacks included.
 */

export const REDACTED = "<redacted>"

/** Field names that hold a person's data, a message's words or a secret, at any depth. */
const SECRET_FIELD =
  /^(e-?mails?|(?:customer|shopper|contact|first|last|full|display|billing|shipping)_?names?|phones?|phone_?number|address(?:es)?|address[12]|street|zip|postcode|body|html|text|subject|snippet|preview|notes?|content|prompt|answer|reply|password|token|access_?token|refresh_?token|secret|client_?secret|api_?key|authorization|cookie|set-cookie|signature|hmac)$/i

const MASKS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi, "<email>"],
  [/\bBearer\s+[\w.~+/=-]+/gi, `Bearer ${REDACTED}`],
  // Insyte's API keys, Stripe's and Shopify's tokens, webhook signing secrets, Resend's keys.
  [/\b(?:ins_live|sk_live|sk_test|rk_live|rk_test|whsec|shpat|shpca|shpss|shppa|re)_[A-Za-z0-9_]{8,}/g, REDACTED],
  [/([?&](?:token|code|state|key|signature|hmac)=)[^&\s"']+/gi, `$1${REDACTED}`],
  [/\+\d[\d\s().-]{7,}\d/g, "<phone>"]
]

const maskString = (value: string) => MASKS.reduce((s, [pattern, mask]) => s.replace(pattern, mask), value)

/** A value with every secret field replaced and every string masked. Pure; cycles are cut. */
export const scrubValue = (value: unknown, seen: WeakSet<object> = new WeakSet()): unknown => {
  if (typeof value === "string") return maskString(value)
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, seen))
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, SECRET_FIELD.test(key) ? REDACTED : scrubValue(v, seen)])
  )
}

/**
 * A structured log line (Effect's `formatStructured`), scrubbed. The line's own fields (`message`, `level`, `cause`,
 * `annotations`, `spans`) keep their names; what is inside them is scrubbed.
 */
export const scrubLog = <A extends { readonly message: unknown; readonly annotations: Record<string, unknown> }>(
  line: A
): A => ({
  ...line,
  message: scrubValue(line.message),
  cause: "cause" in line && typeof line.cause === "string"
    ? maskString(line.cause)
    : (line as { cause?: unknown }).cause,
  annotations: scrubValue(line.annotations) as Record<string, unknown>
})
