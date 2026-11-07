import { env } from "cloudflare:workers"
import { Config, ConfigProvider, Context, Effect, Layer } from "effect"

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
 * Who may create an account while Insyte is invite-only (M2.2), beside `beta_allowlist`: the stage may turn the gate off
 * (`BETA_GATE=off`) or admit whole domains (`BETA_ALLOWED_DOMAINS`, `example.com` off production for the tests).
 * better-auth's own settings are its integration's to read (`BetterAuth`).
 */
export class BetaSettings extends Context.Service<BetaSettings, {
  readonly gate: boolean
  readonly domains: ReadonlyArray<string>
}>()("api-worker/BetaSettings") {
  static readonly layer = Layer.effect(
    BetaSettings,
    Effect.gen(function*() {
      return {
        gate: (yield* Config.String("BETA_GATE").pipe(Config.withDefault("on"))) !== "off",
        domains: (yield* Config.String("BETA_ALLOWED_DOMAINS").pipe(Config.withDefault("")))
          .split(",")
          .map((domain) => domain.trim().toLowerCase())
          .filter((domain) => domain.length > 0)
      }
    })
  )
}
