import { InboxGroup } from "@insyte/api/http/groups/InboxGroup"
import { PublicApi } from "@insyte/api/http/PublicApi"
import { Effect, Layer } from "effect"
import { HttpRouter, HttpServerResponse } from "effect/http"
import { HttpApiScalar, OpenApi } from "effect/http-api"

/*
 * The public API's documents (M19.2): its OpenAPI at `/v1/openapi.json` and the reference drawn from it at `/v1/docs`,
 * each made on its first request. Loaded with the Worker's first request, not at its start (ADR-0041 §3), beside the
 * groups that load the same way (the inbox's, `inbox/http.ts`): the API they describe is `PublicApi` with those added.
 */

/** Every group a key can call, in the order the documents list them. */
export const DocumentedApi = PublicApi.add(InboxGroup)

let spec: object | undefined
const openapi = () => HttpServerResponse.jsonUnsafe(spec ??= OpenApi.fromApi(DocumentedApi))

export const DocsLive = Layer.mergeAll(
  HttpRouter.use((router) => router.add("GET", "/v1/openapi.json", Effect.sync(openapi))),
  HttpApiScalar.layerCdn(DocumentedApi, { path: "/v1/docs" })
)
