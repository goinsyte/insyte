import { WEBHOOK_BACKOFF_MINUTES } from "@insyte/domain/Webhooks"

/*
 * The rules every delivery follows (M19.4, api.md §7), free of I/O: which URLs Insyte posts to, how a body is signed,
 * and when the next attempt is. An endpoint takes https only, on a public name or address: no loopback, private,
 * link-local, carrier-grade NAT or multicast target, no `localhost` or internal suffix, no credentials in the URL. The
 * names are checked again on every attempt, after resolving them, and a redirect is never followed.
 */

export type UrlRefusal = "format" | "http" | "private" | "credentials" | "port"

const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp", ".test"]

const octets = (ip: string): ReadonlyArray<number> | undefined => {
  const parts = ip.split(".")
  if (parts.length !== 4) return undefined
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : Number.NaN))
  return nums.every((n) => n >= 0 && n <= 255) ? nums : undefined
}

const privateV4 = ([a = 0, b = 0, c = 0]: ReadonlyArray<number>): boolean =>
  a === 0 || a === 10 || a === 127 || a >= 224 ||
  (a === 100 && b >= 64 && b <= 127) ||
  (a === 169 && b === 254) ||
  (a === 172 && b >= 16 && b <= 31) ||
  (a === 192 && b === 168) ||
  (a === 192 && b === 0 && (c === 0 || c === 2)) ||
  (a === 198 && (b === 18 || b === 19)) ||
  (a === 198 && b === 51 && c === 100) ||
  (a === 203 && b === 0 && c === 113)

/** An IPv6 address as its eight groups, or `undefined` when it is not one. */
const groups = (ip: string): ReadonlyArray<number> | undefined => {
  const text = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]!
  if (!text.includes(":")) return undefined
  // A trailing dotted quad (`::ffff:10.0.0.1`) is two groups.
  const v4 = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text)
  let body = text
  if (v4 !== null) {
    const q = octets(v4[1]!)
    if (q === undefined) return undefined
    body = `${text.slice(0, -v4[1]!.length)}${((q[0]! << 8) | q[1]!).toString(16)}:${
      ((q[2]! << 8) | q[3]!).toString(16)
    }`
  }
  const [head = "", tail, extra] = body.split("::")
  if (extra !== undefined) return undefined
  const left = head === "" ? [] : head.split(":")
  const right = tail === undefined || tail === "" ? [] : tail.split(":")
  const missing = 8 - left.length - right.length
  if (tail === undefined ? missing !== 0 : missing < 1) return undefined
  const all = [...left, ...Array.from({ length: tail === undefined ? 0 : missing }, () => "0"), ...right]
  const nums = all.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? Number.parseInt(g, 16) : Number.NaN))
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : undefined
}

/** An address no webhook may reach: loopback, private, link-local, shared, reserved, documentation, multicast. */
export const isPrivateAddress = (ip: string): boolean => {
  const v4 = octets(ip)
  if (v4 !== undefined) return privateV4(v4)
  const g = groups(ip)
  if (g === undefined) return true
  const [a = 0, b = 0, , , , f = 0, h1 = 0, h2 = 0] = g
  const zeroHead = g.slice(0, 5).every((n) => n === 0)
  // `::`, `::1`, and IPv4 inside IPv6 (mapped `::ffff:`, compatible `::`, NAT64 `64:ff9b::`).
  if (zeroHead && (f === 0 || f === 0xffff)) {
    if (f === 0 && h1 === 0 && h2 <= 1) return true
    return privateV4([h1 >> 8, h1 & 0xff, h2 >> 8, h2 & 0xff])
  }
  if (a === 0x64 && b === 0xff9b) return privateV4([h1 >> 8, h1 & 0xff, h2 >> 8, h2 & 0xff])
  return (a & 0xfe00) === 0xfc00 || (a & 0xffc0) === 0xfe80 || (a & 0xff00) === 0xff00 || a === 0x2001 && b === 0xdb8 ||
    a === 0 || (a === 0x2002 && privateV4([b >> 8, b & 0xff, g[2]! >> 8, g[2]! & 0xff]))
}

const isAddress = (host: string) => octets(host) !== undefined || groups(host) !== undefined

/** Why Insyte would not post to this URL, or `undefined` when it may (before resolving its name). */
export const urlRefusal = (raw: string): UrlRefusal | undefined => {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return "format"
  }
  if (url.protocol === "http:") return "http"
  if (url.protocol !== "https:") return "format"
  if (url.username !== "" || url.password !== "") return "credentials"
  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  if (host === "") return "format"
  if (isAddress(host)) return isPrivateAddress(host) ? "private" : undefined
  if (!host.includes(".")) return "private"
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return "private"
  if (url.port !== "" && url.port !== "443" && url.port !== "8443" && Number(url.port) < 1024) return "port"
  return undefined
}

/** The name an attempt resolves before it posts, or the address itself; `undefined` for a URL that is not one. */
export const hostOf = (raw: string): { readonly host: string; readonly literal: boolean } | undefined => {
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^\[|\]$/g, "")
    return { host, literal: isAddress(host) }
  } catch {
    return undefined
  }
}

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("")

/** `hex(hmac-sha256(secret, t + "." + body))`, the `v1` of `Insyte-Signature`. */
export const signature = async (secret: string, timestamp: number, body: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)))
}

/** `t=<unix>,v1=<hex>[,v1=<hex>]`: the new secret's signature first, the previous one's during a rotation. */
export const signatureHeader = (timestamp: number, signatures: ReadonlyArray<string>) =>
  [`t=${timestamp}`, ...signatures.map((s) => `v1=${s}`)].join(",")

/** How long after the n-th failed attempt (1-based) the next one goes. */
export const backoffMs = (attempt: number): number =>
  (WEBHOOK_BACKOFF_MINUTES[Math.min(attempt, WEBHOOK_BACKOFF_MINUTES.length) - 1] ?? 1) * 60_000

/** A short stable id from parts: the same event to the same endpoint is the same delivery, however often it is relayed. */
export const derivedId = async (prefix: string, ...parts: ReadonlyArray<string>): Promise<string> => {
  const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\u0000"))))
  return `${prefix}_${digest.slice(0, 26)}`
}

/** Headers an endpoint may not set: Insyte's own and the ones HTTP or the platform owns. */
export const isForbiddenHeader = (name: string): boolean => {
  const n = name.trim().toLowerCase()
  return n.startsWith("insyte-") || n.startsWith("cf-") || n.startsWith("x-forwarded-") || [
    "host",
    "content-type",
    "content-length",
    "user-agent",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "upgrade",
    "proxy-authorization",
    "proxy-connection",
    "cookie",
    "x-real-ip"
  ].includes(n)
}

export const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/

/** A header value `fetch` can send: tab, the visible ASCII and space, and Latin-1 bytes; no line breaks, no NUL. */
export const HEADER_VALUE = /^[\t\x20-\x7e\x80-\xff]*$/
