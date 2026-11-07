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
    readonly email: (credentials: { email: string; password: string }) => AuthResult<unknown>
    /** A full-page handoff to the provider; `callbackURL` is absolute, on the product's origin. */
    readonly social: (request: { provider: "google"; callbackURL: string }) => AuthResult<unknown>
  }
  readonly signUp: {
    /** `callbackURL` is where the verification link lands, signed in. */
    readonly email: (
      account: { email: string; password: string; name: string; callbackURL?: string | undefined }
    ) => AuthResult<unknown>
  }
  readonly sendVerificationEmail: (request: { email: string; callbackURL?: string | undefined }) => AuthResult<unknown>
  /** Answers the same whether or not the address has an account. `redirectTo` is the reset screen. */
  readonly requestPasswordReset: (request: { email: string; redirectTo: string }) => AuthResult<unknown>
  readonly resetPassword: (request: { newPassword: string; token: string }) => AuthResult<unknown>
  readonly signOut: () => AuthResult<unknown>
  readonly organization: {
    readonly create: (workspace: { name: string; slug: string }) => AuthResult<{ readonly id: string }>
  }
}

/** The installed client. Read only from event handlers and effects, after the host's composition root has run. */
export let authClient: AuthClient

export function installAuthClient(client: AuthClient): void {
  authClient = client
}
