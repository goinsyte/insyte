import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { twoFactor } from "better-auth/plugins"
import { type Execute, executeDialect } from "./Dialect.ts"
import { eventsAfter, eventsBefore, type RecordEvent } from "./Events.ts"
import { typeId } from "./Ids.ts"

/*
 * better-auth authenticates; Insyte authorises (ADR-0032, 12). This file is the whole configuration: email and
 * password with verification, sessions, cookies. Workspaces, roles and every permission check are ours. It is also
 * the input of `scripts/auth-schema.ts`, which writes the `auth` schema migration from it and fails CI when the two
 * drift.
 */

/** One message better-auth asks to send. The Worker hands it to the `Mailer` port; this file only shapes it. */
export interface AuthMail {
  readonly kind: "auth.verify" | "auth.reset" | "auth.signup_existing"
  readonly to: string
  readonly url?: string | undefined
}

export interface AuthConfig {
  /** Postgres as `insyte_app`: the request's own connection in the Worker (`Dialect.ts`). */
  readonly execute: Execute
  /** The console's origin: cookies, links in mail and the CSRF check all name it (18 §2). */
  readonly baseURL: string
  readonly secret: string
  /** Must not reject: a failed send is logged by the caller, never surfaced as a 500. */
  readonly sendMail: (mail: AuthMail) => Promise<void>
  /** Whether an address may create an account while Insyte is invite-only (M2.2). Absent: everyone may. */
  readonly admits?: ((email: string) => Promise<boolean>) | undefined
  /** Whether a new password appears in a known breach (`Breached.ts`). Absent: no check (local and the worker tests). */
  readonly isBreached?: ((password: string) => Promise<boolean>) | undefined
  /** Stores what happened to an account (`Events.ts`, M2.6). Must not reject. Absent: nothing is recorded. */
  readonly recordEvent?: RecordEvent | undefined
}

/** Where a new password arrives, and the body field it arrives in: sign-up, reset and change-password (M2.3). */
const NEW_PASSWORD: Record<string, "password" | "newPassword"> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword"
}

/** Refuses a new password that appears in a known breach, before better-auth stores anything. */
const refuseBreached = async (
  isBreached: (password: string) => Promise<boolean>,
  ctx: { readonly path: string; readonly body?: unknown }
) => {
  const field = NEW_PASSWORD[ctx.path]
  const password = field === undefined ? undefined : (ctx.body as Record<string, unknown> | undefined)?.[field]
  if (typeof password === "string" && await isBreached(password)) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_BREACHED",
      message: "This password appears in known data breaches. Choose another."
    })
  }
}

/** Prefix per better-auth model, so its ids read like ours in logs and joins. */
const PREFIX: Record<string, string> = {
  user: "usr",
  session: "ses",
  account: "acc",
  verification: "ver",
  twoFactor: "tfa"
}

/** Every column snake_case, spelled out: better-auth's `casing` option does nothing at 1.7 (12 §3). */
const COLUMNS = {
  user: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
  session: {
    expiresAt: "expires_at",
    createdAt: "created_at",
    updatedAt: "updated_at",
    ipAddress: "ip_address",
    userAgent: "user_agent",
    userId: "user_id"
  },
  account: {
    accountId: "account_id",
    providerId: "provider_id",
    userId: "user_id",
    accessToken: "access_token",
    refreshToken: "refresh_token",
    idToken: "id_token",
    accessTokenExpiresAt: "access_token_expires_at",
    refreshTokenExpiresAt: "refresh_token_expires_at",
    createdAt: "created_at",
    updatedAt: "updated_at"
  },
  verification: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" }
} as const

/*
 * TOTP and backup codes (12 §2, M2): asked for on sign-in once enabled (`twoFactorRedirect`), with "Dit apparaat 30 dagen
 * onthouden". Backup codes are stored encrypted with the secret; the plugin's own lockout stands (10 failures → 15
 * minutes) beside our limits on the password step. Enrolment is the security settings page (M3). Its types reach into
 * zod, which is why zod is a dependency here: a declaration must be able to name them.
 */
const twoFactorPlugin = () =>
  twoFactor({
    issuer: "Insyte",
    backupCodeOptions: { storeBackupCodes: "encrypted" },
    trustDeviceMaxAge: 30 * 24 * 60 * 60,
    schema: {
      user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
      twoFactor: {
        modelName: "two_factor",
        fields: {
          backupCodes: "backup_codes",
          userId: "user_id",
          failedVerificationCount: "failed_verification_count",
          lockedUntil: "locked_until"
        }
      }
    }
  })

export const authOptions = (config: AuthConfig, database: BetterAuthOptions["database"]) =>
  ({
    appName: "Insyte",
    baseURL: config.baseURL,
    basePath: "/api/auth",
    secret: config.secret,
    trustedOrigins: [config.baseURL],
    database,
    telemetry: { enabled: false },
    // Ours: per IP and per email, in front of these routes (M2.3). better-auth's keys by IP and path only.
    rateLimit: { enabled: false },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (config.isBreached !== undefined) await refuseBreached(config.isBreached, ctx)
        if (config.recordEvent !== undefined) await eventsBefore(ctx, config.recordEvent)
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (config.recordEvent !== undefined) await eventsAfter(ctx, config.recordEvent)
      })
    },
    databaseHooks: {
      user: {
        create: {
          // The beta gate, where every account is born (password now, Google later): refused before the row exists.
          before: async (user: { email: string }) => {
            if (config.admits !== undefined && !(await config.admits(user.email))) {
              // 400, not 403: sign-up turns a 403 from here into its generic duplicate-address success, which would
              // tell the visitor their account exists.
              throw new APIError("BAD_REQUEST", { code: "BETA_CLOSED", message: "Insyte is invite-only for now." })
            }
          },
          // The real new account, which sign-up's answer is not for an address that already has one.
          after: async (user: { id: string }, ctx?: { readonly request?: Request | undefined } | null) => {
            await config.recordEvent?.({ kind: "sign_up", userId: user.id, request: ctx?.request ?? undefined })
          }
        }
      }
    },
    user: { fields: COLUMNS.user },
    account: { fields: COLUMNS.account },
    verification: { fields: COLUMNS.verification, storeIdentifier: "hashed" },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      onPasswordReset: async ({ user }, request) => {
        await config.recordEvent?.({ kind: "password_changed", userId: user.id, request })
      },
      sendResetPassword: ({ user, url }) => config.sendMail({ kind: "auth.reset", to: user.email, url }),
      // Someone signs up with an address that already has an account: tell its owner, show the visitor nothing new.
      onExistingUserSignUp: ({ user }) => config.sendMail({ kind: "auth.signup_existing", to: user.email })
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: ({ user, url }) => config.sendMail({ kind: "auth.verify", to: user.email, url })
    },
    session: {
      fields: COLUMNS.session,
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      freshAge: 10 * 60,
      cookieCache: { enabled: true, maxAge: 5 * 60, strategy: "compact" },
      // Which workspace and principal the session acts as: written only by the server (Session.switchPrincipal, M3).
      additionalFields: {
        activeWorkspaceId: { type: "string", required: false, input: false, fieldName: "active_workspace_id" },
        activePrincipalKind: { type: "string", required: false, input: false, fieldName: "active_principal_kind" }
      }
    },
    plugins: [twoFactorPlugin()],
    advanced: {
      // __Secure-insyte.session; HttpOnly; Secure; SameSite=Lax; Path=/; no Domain: host-only (18 §3).
      cookiePrefix: "insyte",
      cookies: { session_token: { name: "insyte.session" } },
      useSecureCookies: config.baseURL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      // `validateSchema: false`: the instance is built per request, and auth:check proves the schema in CI instead.
      database: {
        generateId: ({ model }) => typeId(PREFIX[model] ?? model.slice(0, 3)),
        validateSchema: false
      }
    }
  }) satisfies BetterAuthOptions

/**
 * A better-auth instance for one request, over that request's connection.
 *
 * Per request, as effect-cloudflare-full-stack runs it in production: a socket cannot outlive the request that opened
 * it on Workers. `schemaName` qualifies every statement with `auth.`, so nothing depends on a connection's search path
 * (Hyperdrive pools in transaction mode, where a session `SET` would not hold).
 */
export const makeAuth = (config: AuthConfig) =>
  betterAuth(authOptions(config, { dialect: executeDialect(config.execute), type: "postgres", schemaName: "auth" }))

export type Auth = ReturnType<typeof makeAuth>
