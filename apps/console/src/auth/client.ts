import type { AuthClient, AuthError, AuthResult } from "@insyte/ui/app/lib/auth-client"
import { authErrorCopy } from "@insyte/ui/app/lib/errors"
import { createAuthClient } from "better-auth/client"
import { identify } from "../observability.ts"

/*
 * The console's auth client: better-auth's, against the API Worker, which the console forwards `/api/*` to (12 §3).
 * It fills the seam the screens import (`@insyte/ui/app/lib/auth-client`), so the sign-in form, the reset dialog and
 * the onboarding head call the same names they call in the design reference.
 *
 * `basePath`, not `baseURL`: a relative `baseURL` throws, and the console has no origin of its own to write down
 * (previews, staging and production each have one). Made on first use rather than at load, because this module loads
 * on the server too, where no screen calls it.
 *
 * Every error leaves here as Dutch copy (`authErrorCopy`); better-auth's English never reaches a screen.
 */

let made: ReturnType<typeof createAuthClient> | undefined
const client = () => (made ??= createAuthClient({ basePath: "/api/auth" }))

/** better-auth's answer, with its error turned into a sentence a person can act on. */
const answer = async <A>(
  call: Promise<{ data: A | null; error: { code?: string | undefined; status?: number } | null }>,
  fallback: string
): AuthResult<A> => {
  // A network failure rejects instead of answering; it is an error like any other, with no code.
  const { data, error } = await call.catch(() => ({ data: null, error: { code: undefined, status: 0 } }))
  if (error === null) return { data, error: null }
  // The edge guards answer 429 with the seconds to wait; any other 429 is a limit too, without them.
  const code = error.status === 429 ? "RATE_LIMITED" : error.code
  const wait = (error as { retryAfterSeconds?: unknown }).retryAfterSeconds
  const failed: AuthError = {
    code,
    message: authErrorCopy(code, fallback, typeof wait === "number" ? wait : undefined)
  }
  return { data: null, error: failed }
}

const TRY_AGAIN = "Er ging iets mis. Probeer het opnieuw."

/** The human check's token, where the edge guards read it (`x-turnstile-token`). */
const human = (token: string | undefined) => token === undefined ? {} : { headers: { "x-turnstile-token": token } }

export const consoleAuthClient: AuthClient = {
  getSession: async () => {
    const result = await answer(client().getSession(), TRY_AGAIN)
    identify(result.data?.user.id ?? null)
    return result
  },
  signIn: {
    email: async ({ turnstileToken, ...credentials }) => {
      const result = await answer(
        client().signIn.email({ ...credentials, fetchOptions: human(turnstileToken) }),
        "Inloggen mislukt. Controleer je gegevens."
      )
      if (result.data !== null) identify(result.data.user.id)
      return result
    },
    social: (request) => answer(client().signIn.social(request), "Inloggen met Google lukte niet. Probeer het opnieuw.")
  },
  signUp: {
    email: ({ turnstileToken, ...account }) =>
      answer(
        client().signUp.email({ ...account, fetchOptions: human(turnstileToken) }),
        "Je account kon niet worden aangemaakt."
      )
  },
  sendVerificationEmail: (request) =>
    answer(client().sendVerificationEmail(request), "De mail kon niet opnieuw worden verstuurd."),
  requestPasswordReset: ({ turnstileToken, ...request }) =>
    answer(
      client().requestPasswordReset({ ...request, fetchOptions: human(turnstileToken) }),
      "De resetlink kon niet worden verstuurd. Probeer het opnieuw."
    ),
  resetPassword: (request) =>
    answer(client().resetPassword(request), "Je wachtwoord kon niet worden gewijzigd. Probeer het opnieuw."),
  signOut: async () => {
    const result = await answer(client().signOut(), "Uitloggen lukte niet. Probeer het opnieuw.")
    if (result.error === null) identify(null)
    return result
  },
  organization: {
    // Workspaces arrive in step 3; until then the onboarding step that creates one says so (11 §7.3).
    create: () =>
      Promise.resolve({
        data: null,
        error: { code: "NOT_YET_AVAILABLE", message: authErrorCopy("NOT_YET_AVAILABLE", TRY_AGAIN) }
      })
  }
}
