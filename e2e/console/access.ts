import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  BrowserContextOptions,
  PlaywrightWorkerArgs,
  Route
} from "@playwright/test"

/*
 * Past Cloudflare Access on a preview with the CI service token, and nowhere else. The token's headers used to be the
 * project's `extraHTTPHeaders`, which a browser sends on every request: fonts, Turnstile, Sentry and any other origin
 * the page reaches would have been handed the secret. Here a context adds them on the preview's own origin only, and
 * the API request contexts, which only ever ask the preview, follow no redirect off it. The values are never logged.
 */

const headers = (): Record<string, string> | undefined => {
  const id = process.env.CF_ACCESS_CLIENT_ID
  const secret = process.env.CF_ACCESS_CLIENT_SECRET
  return id === undefined || secret === undefined
    ? undefined
    : { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": secret }
}

/** Whether the run goes through Access (a preview with the token), which also means no trace: it would record them. */
export const throughAccess = headers() !== undefined

/** The page, its context or the browser closed under a route still in flight: the test is over. */
const closedUnder = (error: unknown) =>
  error instanceof Error && (error.name === "TargetClosedError" || /has been closed|Test ended/.test(error.message))

/**
 * A route handler that cannot put a request's headers in a log. Playwright's error for a failed `route.fetch`,
 * `route.continue` or `route.fallback` lists every header it sent in its call log (the session cookie, a chat's
 * `authorization`, the Access token), and CI's log and report are public. A route still in flight when its page or
 * context closes is let go quietly; any other failure is rethrown as an error naming only the method and the path.
 */
export const guarded = (handler: (route: Route) => Promise<unknown>) => async (route: Route): Promise<void> => {
  try {
    await handler(route)
  } catch (error) {
    if (closedUnder(error)) return
    const request = route.request()
    const name = error instanceof Error ? error.name : "Error"
    // No `cause`: the cause is the error with the headers, and a reporter would print it.
    // oxlint-disable-next-line preserve-caught-error
    throw new Error(`the route for ${request.method()} ${new URL(request.url()).pathname} failed (${name})`)
  }
}

/** Adds the token's headers to the context's requests to `baseURL`'s origin, and to no other. */
export async function admit(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  const access = headers()
  if (access === undefined || baseURL === undefined) return
  const origin = new URL(baseURL).origin
  await context.route(
    (url) => url.origin === origin,
    guarded((route) => route.continue({ headers: { ...route.request().headers(), ...access } }))
  )
}

/**
 * The headers of a request the page's own API context sends to the preview (`page.request`, which shares the page's
 * cookies but not its routes): the token added on a preview, and no redirect followed off it.
 */
export const onPreview = (
  extra: Record<string, string> = {}
): { headers: Record<string, string>; maxRedirects?: number } => {
  const access = headers()
  return access === undefined ? { headers: extra } : { headers: { ...extra, ...access }, maxRedirects: 0 }
}

/** A browser of its own, as the project's contexts are: the base URL, and on a preview the admission. */
export async function newContext(browser: Browser, baseURL: string | undefined): Promise<BrowserContext> {
  const options: BrowserContextOptions = baseURL === undefined ? {} : { baseURL }
  const context = await browser.newContext(options)
  await admit(context, baseURL)
  return context
}

/** The API request context for the preview: the token on its requests, and no redirect followed to another origin. */
export async function previewRequest(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string | undefined
): Promise<APIRequestContext> {
  const access = headers()
  return playwright.request.newContext({
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(access === undefined ? {} : { extraHTTPHeaders: access, maxRedirects: 0 })
  })
}
