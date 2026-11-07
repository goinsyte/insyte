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
