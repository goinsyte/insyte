import { env } from "cloudflare:workers"
import { Config, ConfigProvider, Context, Effect, Layer, Redacted } from "effect"

/*
 * The only file that reads `env` (04 §13). String vars and secrets become Effect `Config`; a binding (Hyperdrive, a
 * queue) is handed to its adapter directly when one exists.
 */

const stringEntries = (record: object): Record<string, string> =>
  Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"))

export const ConfigLive = ConfigProvider.layer(ConfigProvider.fromEnvRecord(stringEntries(env)))

const ENVIRONMENTS = ["local", "preview", "staging", "production"] as const
export type Environment = (typeof ENVIRONMENTS)[number]
const EnvironmentConfig = Config.Literals(ENVIRONMENTS, "ENVIRONMENT")

/** What is running, and where: the version is the deploy's commit sha. */
export class AppInfo extends Context.Service<AppInfo, {
  readonly version: string
  readonly environment: Environment
}>()("api-worker/AppInfo") {
  static readonly layer = Layer.effect(
    AppInfo,
    Effect.gen(function*() {
      return {
        version: yield* Config.String("VERSION").pipe(Config.withDefault("dev")),
        environment: yield* EnvironmentConfig
      }
    })
  )
}

/**
 * What better-auth needs from the environment (12 §4): the console's origin (cookies, links in mail, the CSRF check)
 * and the signing secret. Locally a fixed development secret stands in, so `wrangler dev` and the tests need no
 * `.dev.vars`; every deployed stage gets its own from its GitHub environment.
 */
export class AuthSettings extends Context.Service<AuthSettings, {
  readonly consoleOrigin: string
  readonly secret: Redacted.Redacted
  /** The breached-password check (M2.3) asks HIBP over the network: deployed stages only, so local runs stay offline. */
  readonly checkBreachedPasswords: boolean
  /** The beta gate (M2.2): `false` only where the stage turns it off (`BETA_GATE=off`). */
  readonly betaGate: boolean
  /** Domains every address of which is admitted on this stage, beside `beta_allowlist`: `example.com` off production. */
  readonly betaDomains: ReadonlyArray<string>
}>()("api-worker/AuthSettings") {
  static readonly layer = Layer.effect(
    AuthSettings,
    Effect.gen(function*() {
      const environment = yield* EnvironmentConfig
      const secret = yield* Config.Redacted("BETTER_AUTH_SECRET").pipe(
        environment === "local"
          ? Config.withDefault(Redacted.make("local-development-secret-never-deployed-0123456789"))
          : (config) => config
      )
      return {
        consoleOrigin: yield* Config.String("CONSOLE_ORIGIN"),
        secret,
        checkBreachedPasswords: environment !== "local",
        betaGate: (yield* Config.String("BETA_GATE").pipe(Config.withDefault("on"))) !== "off",
        betaDomains: (yield* Config.String("BETA_ALLOWED_DOMAINS").pipe(Config.withDefault("")))
          .split(",")
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0)
      }
    })
  )
}
