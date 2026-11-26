import type {
  APIRequestContext,
  APIResponse,
  Browser,
  BrowserContext,
  BrowserContextOptions,
  Page,
  PlaywrightWorkerArgs,
  Request,
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

/** The calls of an API request context that send a request. */
const SENDS: ReadonlySet<PropertyKey> = new Set(["delete", "fetch", "get", "head", "patch", "post", "put"])

/** A call as an error may name it: the method and the path, no query string (an address, a token). */
const callOf = (method: string, url: string) => `${method.toUpperCase()} ${new URL(url, "http://e2e.invalid").pathname}`

/**
 * What a failed call may say: its method, its path and why, in a word. Playwright's own error lists, in its call log,
 * every header the request sent and the response's `set-cookie` (the session cookie, the Access token), so only the
 * first line's status (a `failOnStatusCode` refusal) or a network error's code is kept, else the error's name.
 */
const failedCall = (call: string, error: unknown): Error => {
  const first = error instanceof Error ? (error.message.split("\n")[0] ?? "") : ""
  const why = /^[\w.]+: (\d{3})\b/.exec(first)?.[1] ?? /\b(E[A-Z]{3,})\b/.exec(first)?.[1] ??
    (error instanceof Error ? error.name : "Error")
  return new Error(`${call} failed (${why})`)
}

/**
 * A response whose `json()` cannot put its body in a log: on a body that is not JSON (Access's sign-in page, a 500's
 * page) the parser's error quotes the start of the text, and a captured mail's body carries its sign-in and invitation
 * links. Rethrown naming the call and the status only. `text()` and `body()` are the journey's to print, or not.
 */
const sealedResponse = (response: APIResponse, call: string): APIResponse =>
  new Proxy(response, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target)
      if (typeof value !== "function") return value
      if (key !== "json") return value.bind(target)
      const json = async () => {
        try {
          return await value.call(target)
        } catch {
          const failed = new Error(`${call}: the body is not JSON (${target.status()})`)
          Error.captureStackTrace(failed, json)
          throw failed
        }
      }
      return json
    }
  })

/**
 * An API request context whose failed calls cannot put a request's headers in a log, as `guarded` does for routes: a
 * call that throws is rethrown as an error naming only the method, the path and why, and its response's `json()` the
 * same (`sealedResponse`). Every API context the journeys use goes through this (`previewRequest`, `pageRequest`,
 * `plainRequest`; `bun run e2e:requests` holds them to it).
 */
function sealed(api: APIRequestContext): APIRequestContext {
  return new Proxy(api, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target)
      if (typeof value !== "function") return value
      if (!SENDS.has(key)) return value.bind(target)
      const send = async (urlOrRequest: string | Request, options?: { method?: string }) => {
        const call = typeof urlOrRequest === "string"
          ? callOf(key === "fetch" ? (options?.method ?? "GET") : String(key), urlOrRequest)
          : callOf(options?.method ?? urlOrRequest.method(), urlOrRequest.url())
        try {
          return sealedResponse(await value.call(target, urlOrRequest, options), call)
        } catch (error) {
          const failed = failedCall(call, error)
          // The stack starts at the journey's own line, which the report then shows, not this one.
          Error.captureStackTrace(failed, send)
          // No `cause`: the cause is the error with the headers, and a reporter would print it.
          // oxlint-disable-next-line preserve-caught-error
          throw failed
        }
      }
      return send
    }
  })
}

/** The page's own API context (`page.request`: the page's cookies, not its routes), sealed. */
export const pageRequest = (page: Page): APIRequestContext => sealed(page.request)

/** An API context of its own, for a host that is not the preview (no Access token on it), sealed. */
export async function plainRequest(
  playwright: PlaywrightWorkerArgs["playwright"],
  options: Parameters<PlaywrightWorkerArgs["playwright"]["request"]["newContext"]>[0]
): Promise<APIRequestContext> {
  return sealed(await playwright.request.newContext(options))
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

/**
 * The API request context for the preview, sealed: the token on its requests, and no redirect followed to another
 * origin.
 */
export async function previewRequest(
  playwright: PlaywrightWorkerArgs["playwright"],
  baseURL: string | undefined
): Promise<APIRequestContext> {
  const access = headers()
  return sealed(
    await playwright.request.newContext({
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(access === undefined ? {} : { extraHTTPHeaders: access, maxRedirects: 0 })
    })
  )
}
