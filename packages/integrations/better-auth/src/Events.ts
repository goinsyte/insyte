import { getSessionFromCtx, isAPIError } from "better-auth/api"

/*
 * What happened to an account, as better-auth sees it (M2.6), handed to the Worker to store in `auth_events`. The Worker
 * owns the table and the request's details (IP, user agent, country); this file only decides what happened, to whom.
 *
 * Most events are read from an endpoint's outcome (`after`). Some need who was signed in before the endpoint ran, which
 * afterwards may be gone (sign-out) or changed (enrolling in two-factor), so `before` notes it per request. Sign-up and
 * a finished reset come from better-auth's own callbacks (`user.create.after`, `onPasswordReset`), which see the real
 * user where an endpoint's answer may be a decoy (sign-up for an existing address answers like a new one).
 */

export type AuthEventKind =
  | "sign_in"
  | "sign_in_failed"
  | "sign_up"
  | "sign_out"
  | "password_reset_requested"
  | "password_changed"
  | "two_factor_enabled"
  | "two_factor_disabled"

export interface AuthEvent {
  readonly kind: AuthEventKind
  readonly userId: string
  readonly request: Request | undefined
}

export type RecordEvent = (event: AuthEvent) => Promise<void>

type HookContext = Parameters<typeof getSessionFromCtx>[0] & {
  readonly context: {
    readonly returned?: unknown
    readonly newSession?: { readonly user: { readonly id: string } } | null
  }
}

/** Who was signed in when an endpoint started, per request, for the endpoints whose outcome changes or ends that. */
const signedInBefore = new WeakMap<Request, { readonly userId: string; readonly twoFactorEnabled: boolean }>()

const NOTED_BEFORE = new Set(["/change-password", "/two-factor/disable", "/two-factor/verify-totp"])
const SIGN_IN_FINISHES = new Set([
  "/sign-in/email",
  "/verify-email",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code"
])

const emailIn = (body: unknown) =>
  typeof body === "object" && body !== null && typeof (body as { email?: unknown }).email === "string"
    ? (body as { email: string }).email
    : undefined

const accountFor = async (ctx: HookContext, email: string | undefined) =>
  email === undefined ? null : ((await ctx.context.internalAdapter.findUserByEmail(email.toLowerCase()))?.user ?? null)

export const eventsBefore = async (ctx: HookContext, record: RecordEvent): Promise<void> => {
  if (ctx.path !== "/sign-out" && !NOTED_BEFORE.has(ctx.path)) return
  const session = await getSessionFromCtx(ctx).catch(() => null)
  if (session === null) return
  if (ctx.path === "/sign-out") {
    // Recorded before: afterwards the session, and with it who this was, is gone. Sign-out does not fail.
    await record({ kind: "sign_out", userId: session.user.id, request: ctx.request })
    return
  }
  if (ctx.request !== undefined) {
    const twoFactorEnabled = (session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled === true
    signedInBefore.set(ctx.request, { userId: session.user.id, twoFactorEnabled })
  }
}

export const eventsAfter = async (ctx: HookContext, record: RecordEvent): Promise<void> => {
  const returned = ctx.context.returned
  // A redirect (the verification link's) is an `APIError` with a 3xx status too: only 4xx and 5xx are failures.
  const failed = isAPIError(returned) && returned.statusCode >= 400
  const request = ctx.request
  const before = request === undefined ? undefined : signedInBefore.get(request)

  // A first code while signed in and not yet enrolled is the enrolment's confirmation, not a sign-in.
  if (ctx.path === "/two-factor/verify-totp" && before !== undefined && !before.twoFactorEnabled) {
    if (!failed) await record({ kind: "two_factor_enabled", userId: before.userId, request })
    return
  }
  if (SIGN_IN_FINISHES.has(ctx.path)) {
    const signedIn = ctx.context.newSession?.user.id
    if (!failed && signedIn !== undefined) await record({ kind: "sign_in", userId: signedIn, request })
    if (failed && ctx.path === "/sign-in/email" && isAPIError(returned) && returned.statusCode === 401) {
      // Only an address with an account: the account's owner is the one to tell, and nobody learns more than the form.
      const account = await accountFor(ctx, emailIn(ctx.body))
      if (account !== null) await record({ kind: "sign_in_failed", userId: account.id, request })
    }
    return
  }
  if (failed) return
  if (ctx.path === "/request-password-reset") {
    const account = await accountFor(ctx, emailIn(ctx.body))
    if (account !== null) await record({ kind: "password_reset_requested", userId: account.id, request })
  }
  if (ctx.path === "/change-password" && before !== undefined) {
    await record({ kind: "password_changed", userId: before.userId, request })
  }
  if (ctx.path === "/two-factor/disable" && before !== undefined) {
    await record({ kind: "two_factor_disabled", userId: before.userId, request })
  }
}
