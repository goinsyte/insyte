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
