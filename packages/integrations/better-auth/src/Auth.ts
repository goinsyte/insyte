import { betterAuth, type BetterAuthOptions } from "better-auth"
import { type Execute, executeDialect } from "./Dialect.ts"
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
}

/** Prefix per better-auth model, so its ids read like ours in logs and joins. */
const PREFIX: Record<string, string> = { user: "usr", session: "ses", account: "acc", verification: "ver" }

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
