import { Effect } from "effect"
import { HttpServerRequest } from "effect/http"
import { AppInfo } from "../../../platform/Bindings.ts"

export const workspaceParam = Effect.map(
  HttpServerRequest.HttpServerRequest,
  (request) => new URL(request.url, "http://local").searchParams.get("workspace") ?? ""
)

export const notInProduction = Effect.map(AppInfo, ({ environment }) => environment !== "production")
