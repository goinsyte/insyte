/*
 * The console journeys' API calls (`e2e/console/`), as pure functions with planted-violation tests. Playwright's error
 * for a failed API call, and `toBeOK`'s message, list every header the request sent and the response's `set-cookie`
 * (the session cookie, the Access token), and CI's log is public. So every API context a journey uses is one
 * `access.ts` sealed: `previewRequest` (the `request` fixture), `pageRequest(page)` or `plainRequest`. Only
 * `access.ts` itself reaches Playwright's contexts.
 */

export interface E2eFile {
  readonly path: string
  readonly source: string
}

/** The file that seals the contexts, and so the one that may reach them. */
const SEALER = "e2e/console/access.ts"

/** Comments blanked (newlines kept, so a line number stays right): a comment may name what the code may not use. */
const code = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, (c, before: string) => before + " ".repeat(c.length - before.length))

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length

const RULES: ReadonlyArray<{ readonly pattern: RegExp; readonly why: string }> = [
  {
    // `page.request`, `context.request`, `playwright.request`: an unsealed context. `route.request()` is a call.
    pattern: /\.request\b(?!\s*\()/g,
    why: "an API context that is not sealed: use pageRequest(page), the request fixture or plainRequest (access.ts)"
  },
  {
    // The same, as `page["request"]` or `const { request } = context`. A test's own `async ({ request }) =>` is the
    // fixture, and is not followed by `=`.
    pattern: /\[\s*["'`]request["'`]\s*\]|\{[^{}()]*\brequest\b[^{}()]*\}\s*=(?![=>])/g,
    why: "an API context that is not sealed: use pageRequest(page), the request fixture or plainRequest (access.ts)"
  },
  {
    pattern: /import\s*\{[^}]*\brequest\b[^}]*\}\s*from\s*"@playwright\/test"/g,
    why: "Playwright's own request factory: use plainRequest (access.ts)"
  },
  {
    pattern: /\.toBeOK\(/g,
    why: "toBeOK's failure prints the request's call log, headers and all: check status() or ok() instead"
  }
]

/** A test or fixture that takes the `request` fixture: `async ({ page, request }) =>`. */
const TAKES_REQUEST = /\(\s*\{[^(){}]*\brequest\b[^(){}]*\}/
/** The `request` fixture defined in the file, through `previewRequest`. */
const DEFINES_REQUEST = /\brequest:\s*async\b/
const SEALS_REQUEST = /\brequest:\s*async\b[^]*?\bpreviewRequest\(/
/** The journeys' shared `test`, whose `request` fixture is `previewRequest`'s. */
const SHARED_TEST = /import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*"(?:\.\.?\/)+founder\.ts"/

export const checkE2eRequests = (files: ReadonlyArray<E2eFile>): Array<string> =>
  files.filter((f) => f.path !== SEALER).flatMap(({ path, source }) => {
    const text = code(source)
    const found = RULES.flatMap(({ pattern, why }) =>
      [...text.matchAll(pattern)].map((m) => `${path}:${lineOf(text, m.index)}: ${why}`)
    )
    if (DEFINES_REQUEST.test(text) && !SEALS_REQUEST.test(text)) {
      found.push(`${path}: its request fixture does not come from previewRequest (access.ts)`)
    } else if (TAKES_REQUEST.test(text) && !DEFINES_REQUEST.test(text) && !SHARED_TEST.test(text)) {
      found.push(
        `${path}: takes Playwright's own request fixture: define it with previewRequest or use founder.ts's test`
      )
    }
    return found
  })
