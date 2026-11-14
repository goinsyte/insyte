import { Effect } from "effect"
import { HttpServerRequest } from "effect/http"
import { AppInfo } from "../../../platform/Bindings.ts"

export const workspaceParam = Effect.map(
  HttpServerRequest.HttpServerRequest,
  (request) => new URL(request.url, "http://local").searchParams.get("workspace") ?? ""
)

export const notInProduction = Effect.map(AppInfo, ({ environment }) => environment !== "production")

/** Only where nothing real lives: a developer's machine, the worker tests, a pull request's preview. */
export const devOnly = Effect.map(AppInfo, ({ environment }) => environment === "local" || environment === "preview")
