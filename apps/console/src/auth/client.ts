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
  const code = error.status === 429 ? "TOO_MANY_REQUESTS" : error.code
  const failed: AuthError = { code, message: authErrorCopy(code, fallback) }
  return { data: null, error: failed }
}

const TRY_AGAIN = "Er ging iets mis. Probeer het opnieuw."

export const consoleAuthClient: AuthClient = {
  getSession: async () => {
    const result = await answer(client().getSession(), TRY_AGAIN)
    identify(result.data?.user.id ?? null)
    return result
  },
  signIn: {
    email: async (credentials) => {
      const result = await answer(client().signIn.email(credentials), "Inloggen mislukt. Controleer je gegevens.")
      if (result.data !== null) identify(result.data.user.id)
      return result
    },
    social: (request) => answer(client().signIn.social(request), "Inloggen met Google lukte niet. Probeer het opnieuw.")
  },
  signUp: {
    email: (account) => answer(client().signUp.email(account), "Je account kon niet worden aangemaakt.")
  },
  sendVerificationEmail: (request) =>
    answer(client().sendVerificationEmail(request), "De mail kon niet opnieuw worden verstuurd."),
  requestPasswordReset: (request) =>
    answer(client().requestPasswordReset(request), "De resetlink kon niet worden verstuurd. Probeer het opnieuw."),
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
