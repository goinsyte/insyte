/*
 * What may not ship where (08 §2, "Bundle"), as pure functions with planted-violation tests. The console's browser
 * bundle carries no server code: no `cloudflare:` module, no SQL, no database role, no Effect SQL client. The API
 * bundle stays far below Cloudflare's limit (64 MiB): the alarm rings at 10 MiB gzipped.
 */

const SERVER_MARKERS: ReadonlyArray<{ readonly pattern: RegExp; readonly what: string }> = [
  { pattern: /cloudflare:(workers|sockets|workflows|email)/, what: "a cloudflare: module" },
  { pattern: /\bcreate\s+table\b/i, what: "DDL" },
  { pattern: /set_config\(/, what: "the RLS context" },
  { pattern: /insyte_(owner|app)\b/, what: "a database role" },
  { pattern: /~effect\/sql\//, what: "Effect's SQL client" },
  { pattern: /@insyte\/modules\/[^"']*\/(server|tables)/, what: "a server ring" }
]

export const checkClientBundle = (files: ReadonlyArray<{ readonly name: string; readonly content: string }>) =>
  files.flatMap(({ name, content }) =>
    SERVER_MARKERS.filter((m) => m.pattern.test(content)).map((m) => `${name}: ${m.what} in the browser bundle`)
  )

export const API_GZIP_LIMIT = 10 * 1024 * 1024

export const checkApiSize = (gzipBytes: number) =>
  gzipBytes > API_GZIP_LIMIT
    ? [`the API bundle is ${(gzipBytes / 1024 / 1024).toFixed(1)} MiB gzipped, over the 10 MiB alarm`]
    : []

/*
 * The demo seam in the product (M18, "Demo seam"). The console installs no data source (ADR-0026), so a fixture, a
 * demo source or a demo handler in its bundle is dead weight at best and the reference's data at worst, and a module
 * that reads a seam binding reads `undefined`. The build writes the modules each bundle renders
 * (`apps/console/dist/modules.<environment>.json`, the `insyte:module-list` plugin); these rules read that list.
 */

/** A module of the design reference: its fixtures, its demo sources and handlers, its own app. */
const DEMO_MODULE = /(^|\/)(apps\/design\/|fixtures\/|mock-data\/)|(^|\/|-)demo(-|\.|\/)/

export const checkNoDemoModules = (environment: string, modules: ReadonlyArray<string>) =>
  modules.filter((m) => DEMO_MODULE.test(m)).map((m) => `${m}: a demo module in the console's ${environment} bundle`)

/** The seam's own module, `packages/ui/src/data-source/index.ts`, however a file names it. */
const SEAM = "packages/ui/src/data-source/index.ts"

const resolveSpecifier = (file: string, specifier: string): string | undefined => {
  if (specifier === "@insyte/ui/data-source") return SEAM
  if (!specifier.startsWith(".")) return undefined
  const parts = file.split("/").slice(0, -1)
  for (const step of specifier.split("/")) {
    if (step === "..") parts.pop()
    else if (step !== ".") parts.push(step)
  }
  const path = parts.join("/").replace(/\.ts$/, "")
  return path === "packages/ui/src/data-source" || path === "packages/ui/src/data-source/index" ? SEAM : undefined
}

/** The seam bindings one source file reads (value imports only; a type import reads nothing at run time). */
export const seamReadsOf = (file: string, source: string): ReadonlyArray<string> =>
  [...source.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)].flatMap((m) =>
    m[1] !== undefined || resolveSpecifier(file, m[3]!) !== SEAM ? [] : m[2]!
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "" && !part.startsWith("type "))
      .map((part) => part.split(/\s+as\s+/)[0]!)
  )

type SeamStatus = "demo" | "api" | "code" | "demo-only"

/**
 * Every binding the console's bundle still reads, against the cut-over list: one marked `api` may not be read at all,
 * and any other still read must be named in `left` with the files that read it, so the list can only shrink.
 * A `left` entry that no longer matches the bundle fails too: a binding fixed is a row deleted.
 */
export const checkSeamReads = (
  reads: ReadonlyMap<string, ReadonlyArray<string>>,
  cutover: Readonly<Record<string, { readonly status: SeamStatus }>>,
  left: Readonly<Record<string, ReadonlyArray<string>>>
) => {
  const errors: Array<string> = []
  for (const [binding, files] of reads) {
    const status = cutover[binding]?.status
    if (status === "api") {
      errors.push(`${binding} is cut over, yet the console bundle reads it: ${files.join(", ")}`)
      continue
    }
    const allowed = left[binding] ?? []
    const extra = files.filter((f) => !allowed.includes(f))
    if (extra.length > 0) errors.push(`${binding} is read in the console bundle by ${extra.join(", ")}`)
  }
  for (const [binding, files] of Object.entries(left)) {
    const stale = files.filter((f) => !(reads.get(binding) ?? []).includes(f))
    if (stale.length > 0) errors.push(`${binding}: ${stale.join(", ")} no longer reads it; delete the row`)
  }
  return errors
}
