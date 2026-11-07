/*
 * Which licences may ship (08 §2, "Licences"): permissive ones only, in every production dependency of a deployed app.
 * An SPDX expression passes when every `AND` part has an allowed `OR` alternative.
 */

const ALLOWED = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "Apache-2.0",
  "MPL-2.0",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0"
])

/**
 * Packages allowed by name, each for a reason that does not stretch to code. A new entry is a decision in a diff.
 */
const EXCEPTIONS: ReadonlyArray<{ readonly name: RegExp; readonly licence: string; readonly because: string }> = [
  { name: /^@fontsource(-variable)?\//, licence: "OFL-1.1", because: "a font licence, for the font files we serve" },
  { name: /^caniuse-lite$/, licence: "CC-BY-4.0", because: "browser support data, used at build time, attributed" }
]

export const isExcepted = (name: string, licence: string): boolean =>
  EXCEPTIONS.some((e) => e.name.test(name) && e.licence === licence)

export const isAllowed = (expression: string): boolean =>
  expression
    .replace(/[()]/g, "")
    .split(/\s+AND\s+/i)
    .every((part) => part.split(/\s+OR\s+/i).some((id) => ALLOWED.has(id.trim())))

/** A package.json's licence, in the shapes found in the wild: a string, `{ type }`, or a `licenses` array. */
export const licenceOf = (pkg: { license?: unknown; licenses?: unknown }): string | undefined => {
  const field = pkg.license ?? pkg.licenses
  if (typeof field === "string") return field
  if (Array.isArray(field)) return field.map((l: { type?: string }) => l.type).filter(Boolean).join(" OR ")
  if (field !== null && typeof field === "object" && "type" in field) return String((field as { type: unknown }).type)
  return undefined
}
