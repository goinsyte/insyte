/**
 * The auth calls the screens make, and the one client that answers them. Written for this repo (ADR-0004).
 *
 * Legacy's screens call a better-auth React client directly. Two hosts render them here: the design reference, whose
 * stand-in answers from the fixtures and signs no one in (`apps/design/src/app/demo-auth.ts`), and the console, whose
 * client is better-auth's against the API Worker (`apps/console/src/auth/client.ts`). Each installs its own at its
 * composition root, as it installs its data source (ADR-0026), and the screens import `authClient` unchanged.
 *
 * The shapes are better-auth's: every call answers `{ data, error }`, and every call site reads `error` first. `error`
 * carries a message a person can read, in Dutch; the host's client is where better-auth's codes become that copy.
 *
 * `turnstileToken` is the human check's answer (`auth/human-check.tsx`), for the calls the edge guards check; the
 * console sends it as a header, the design reference ignores it.
 */

export interface AuthError {
  readonly message?: string | undefined
  readonly code?: string | undefined
}

export type AuthResult<A> = Promise<{ readonly data: A | null; readonly error: AuthError | null }>

export interface AuthSession {
  readonly session: { readonly id: string; readonly userId: string; readonly expiresAt: Date }
  readonly user: {
    readonly id: string
    readonly name: string
    readonly email: string
    readonly emailVerified?: boolean | undefined
    readonly image?: string | null | undefined
  }
}

export interface AuthClient {
  readonly getSession: () => AuthResult<AuthSession>
  readonly signIn: {
    /** `turnstileToken` once the server has asked for one (`TURNSTILE_REQUIRED`, a warm address or IP). */
    readonly email: (
      credentials: { email: string; password: string; turnstileToken?: string | undefined }
    ) => AuthResult<{ readonly twoFactorRedirect?: boolean | undefined }>
    /** A full-page handoff to the provider; `callbackURL` is absolute, on the product's origin. */
    readonly social: (request: { provider: "google"; callbackURL: string }) => AuthResult<unknown>
  }
  readonly signUp: {
    /** `callbackURL` is where the verification link lands, signed in. */
    readonly email: (
      account: {
        email: string
        password: string
        name: string
        callbackURL?: string | undefined
        turnstileToken?: string | undefined
        /**
         * From an invitation's landing: `<invitation id>.<its secret>`. The server admits the address and takes it as
         * verified, because the link proved it (M3.4).
         */
        invitation?: string | undefined
      }
    ) => AuthResult<unknown>
  }
  readonly sendVerificationEmail: (request: { email: string; callbackURL?: string | undefined }) => AuthResult<unknown>
  /** Answers the same whether or not the address has an account. `redirectTo` is the reset screen. */
  readonly requestPasswordReset: (
    request: { email: string; redirectTo: string; turnstileToken?: string | undefined }
  ) => AuthResult<unknown>
  readonly resetPassword: (request: { newPassword: string; token: string }) => AuthResult<unknown>
  readonly signOut: () => AuthResult<unknown>
  /** The second step of a sign-in that answered `twoFactorRedirect`: an authenticator code, or a backup code. */
  readonly twoFactor: {
    readonly verifyTotp: (request: { code: string; trustDevice: boolean }) => AuthResult<unknown>
    readonly verifyBackupCode: (request: { code: string; trustDevice: boolean }) => AuthResult<unknown>
  }
  readonly organization: {
    readonly create: (workspace: { name: string; slug: string }) => AuthResult<{ readonly id: string }>
  }
}

/** The installed client. Read only from event handlers and effects, after the host's composition root has run. */
export let authClient: AuthClient

export function installAuthClient(client: AuthClient): void {
  authClient = client
}
