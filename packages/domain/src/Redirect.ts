/*
 * Where a `?redirect=` may send someone after sign-in (M02 decisions). Taken verbatim it is an open redirect, into the
 * Google callback URL too. Only a relative path into the console passes: it starts with one `/`, has no scheme or
 * backslash trick, is at most 512 characters, and its first segment is a console route. The console Worker, the
 * console and the API all call this one function.
 */

/** The console's top-level route segments (the demo's route tree, ADR-0026). */
export const CONSOLE_ROUTES = [
  "dashboard",
  "orders",
  "products",
  "customers",
  "returns",
  "tickets",
  "inbox",
  "chats",
  "chargebacks",
  "suppliers",
  "affiliates",
  "automations",
  "analytics",
  "live",
  "sheets",
  "data",
  "costs",
  "courses",
  "marketplace",
  "notifications",
  "ask",
  "settings",
  "onboarding",
  "invitations",
  "supplier",
  "affiliate"
] as const

/** A tab, newline or other control character: header splitting and scheme tricks start with these. */
const hasControlCharacter = (value: string) =>
  [...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)

export const safeRedirect = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return undefined
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.includes("\\")) {
    return undefined
  }
  if (/^\/[^/]*:/.test(value) || hasControlCharacter(value)) return undefined
  const first = value.slice(1).split(/[/?#]/)[0] ?? ""
  return (CONSOLE_ROUTES as ReadonlyArray<string>).includes(first) ? value : undefined
}
