/*
 * Cloudflare Turnstile, checked on the server (M2.2): the token the widget gave the browser goes to `siteverify` with
 * the widget's secret, and only a `success` answer counts. Unlike the breached-password check this one fails closed:
 * a check that cannot be made is a check not passed, and the visitor can simply try again.
 *
 * Previews and local runs use Cloudflare's published test keys (`1x…AA` always passes), so a browser test can get a
 * token without solving anything; staging and production have their own widget (`infra/app.ts`).
 */

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export interface Verification {
  readonly success: boolean
  /** Cloudflare's reasons when it refuses (`invalid-input-response`, `timeout-or-duplicate`, …), for the log. */
  readonly errors: ReadonlyArray<string>
}

/** Whether a widget token is genuine, single-use and for this secret's widget. */
export const verifyTurnstile = async (
  input: { readonly secret: string; readonly token: string; readonly remoteIp?: string | undefined },
  fetcher: typeof fetch = fetch,
  timeoutMs = 3000
): Promise<Verification> => {
  if (input.token.length === 0 || input.token.length > 2048) {
    return { success: false, errors: ["missing-input-response"] }
  }
  const form = new FormData()
  form.append("secret", input.secret)
  form.append("response", input.token)
  if (input.remoteIp !== undefined) form.append("remoteip", input.remoteIp)
  try {
    const response = await fetcher(SITEVERIFY, { method: "POST", body: form, signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok) return { success: false, errors: [`siteverify-${response.status}`] }
    const body = await response.json() as { success?: unknown; "error-codes"?: unknown }
    return {
      success: body.success === true,
      errors: Array.isArray(body["error-codes"]) ? body["error-codes"].map(String) : []
    }
  } catch (error) {
    return { success: false, errors: [`siteverify-unreachable: ${String(error)}`] }
  }
}
