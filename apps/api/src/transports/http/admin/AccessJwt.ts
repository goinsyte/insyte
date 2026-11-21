/*
 * Cloudflare Access's JWT (`Cf-Access-Jwt-Assertion`), verified, never trusted for being there (M18, the staff
 * admin). Access signs it RS256 with the team's keys (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`);
 * it is the staff application's only when its `aud` holds that application's audience tag, the team's only when
 * `iss` is the team's domain, and current only between `nbf` and `exp`. A service token's JWT names no address,
 * so it is no person of the team.
 */

export type Refusal =
  | "missing"
  | "malformed"
  | "algorithm"
  | "unknown_key"
  | "signature"
  | "audience"
  | "issuer"
  | "expired"
  | "not_yet_valid"
  | "no_email"

export type Verdict =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly reason: Refusal }

export interface SigningKey extends JsonWebKey {
  readonly kid?: string
}

export interface VerifyOptions {
  /** `https://<team>.cloudflareaccess.com`: the token's `iss`, and where its keys are. */
  readonly issuer: string
  /** The staff application's audience tag. */
  readonly audience: string
  /** The team's keys; `fresh` asks past any cache (a key it did not know yet). */
  readonly keys: (fresh: boolean) => Promise<ReadonlyArray<SigningKey>>
  /** Seconds since the epoch; now by default. */
  readonly now?: number
}

/** Clock skew allowed on `nbf` and `exp`, in seconds. */
const SKEW = 30

const decoder = new TextDecoder()

const base64url = (part: string): Uint8Array<ArrayBuffer> => {
  const padded = part.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(part.length / 4) * 4, "=")
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const json = (part: string): Record<string, unknown> | undefined => {
  try {
    const value: unknown = JSON.parse(decoder.decode(base64url(part)))
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

const refuse = (reason: Refusal): Verdict => ({ ok: false, reason })

/** The team's domain as an origin: `team.cloudflareaccess.com`, with or without its scheme or a trailing slash. */
export const issuerOf = (team: string): string => {
  const host = team.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "")
  return host === "" ? "" : `https://${host}`
}

export const verifyAccessJwt = async (token: string | null | undefined, options: VerifyOptions): Promise<Verdict> => {
  if (token === null || token === undefined || token === "") return refuse("missing")
  const parts = token.split(".")
  if (parts.length !== 3 || parts.some((p) => !/^[\w-]+$/.test(p))) return refuse("malformed")
  const [head, body, signature] = parts as [string, string, string]
  const header = json(head)
  const claims = json(body)
  if (header === undefined || claims === undefined) return refuse("malformed")
  if (header["alg"] !== "RS256") return refuse("algorithm")
  const kid = header["kid"]
  if (typeof kid !== "string") return refuse("unknown_key")
  let key = (await options.keys(false)).find((k) => k.kid === kid)
  if (key === undefined) key = (await options.keys(true)).find((k) => k.kid === kid)
  if (key === undefined) return refuse("unknown_key")
  let valid = false
  try {
    const { kid: _, ...jwk } = key
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      { ...jwk, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    )
    valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      base64url(signature),
      new TextEncoder().encode(`${head}.${body}`)
    )
  } catch {
    valid = false
  }
  if (!valid) return refuse("signature")
  const aud = claims["aud"]
  const audiences = Array.isArray(aud) ? aud : [aud]
  if (options.audience === "" || !audiences.includes(options.audience)) return refuse("audience")
  if (options.issuer === "" || claims["iss"] !== options.issuer) return refuse("issuer")
  const now = options.now ?? Math.floor(Date.now() / 1000)
  const exp = claims["exp"]
  if (typeof exp !== "number" || exp + SKEW <= now) return refuse("expired")
  const nbf = claims["nbf"]
  if (typeof nbf === "number" && nbf - SKEW > now) return refuse("not_yet_valid")
  const email = claims["email"]
  if (typeof email !== "string" || !email.includes("@")) return refuse("no_email")
  return { ok: true, email: email.trim().toLowerCase() }
}

/**
 * The team's keys, kept for ten minutes per isolate, and asked again for a key not among them (a rotation), at most
 * once a minute: a token naming a made-up key does not make every request fetch them.
 */
const KEEP_MS = 10 * 60_000
const FRESH_MS = 60_000
let cached: { readonly issuer: string; readonly at: number; readonly keys: ReadonlyArray<SigningKey> } | undefined

export const accessKeys = (issuer: string) => async (fresh: boolean): Promise<ReadonlyArray<SigningKey>> => {
  const age = cached?.issuer === issuer ? Date.now() - cached.at : Number.POSITIVE_INFINITY
  if (age < (fresh ? FRESH_MS : KEEP_MS)) return cached!.keys
  // Not followed: keys from wherever a redirect points are no team's. (Workers takes no `redirect: "error"`; a 3xx
  // under `manual` is simply not `ok`.)
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { redirect: "manual" })
  if (!response.ok) return cached?.issuer === issuer ? cached.keys : []
  const body = (await response.json()) as { readonly keys?: ReadonlyArray<SigningKey> }
  const keys = Array.isArray(body.keys) ? body.keys : []
  cached = { issuer, at: Date.now(), keys }
  return keys
}
