import { PublicApi } from "@insyte/api/http/PublicApi"
import { Layer } from "effect"
import { HttpApiBuilder, HttpApiScalar } from "effect/http-api"
import { AnalyticsHttp } from "./analytics/http.ts"
import { AutomationsHttp } from "./automations/http.ts"
import { ChargebacksHttp } from "./chargebacks/http.ts"
import { CommerceHttp } from "./commerce/http.ts"
import { CostsHttp } from "./costs/http.ts"
import { ForwardingHttp } from "./forwarding/http.ts"
import { ApiKeyAuthLive } from "./http/KeyAuth.ts"
import { KeyHttp } from "./key/http.ts"
import { OrdersHttp } from "./orders/http.ts"
import { ProposalsHttp } from "./proposals/http.ts"
import { QueueHttp } from "./queue/http.ts"
import { ReturnsHttp } from "./returns/http.ts"
import { SheetsHttp } from "./sheets/http.ts"
import { TeamHttp } from "./team/http.ts"
import { TicketsHttp } from "./tickets/http.ts"

/*
 * The public API's server half (M19.2): every endpoint behind the key door. OpenAPI at `/v1/openapi.json`, its
 * reference at `/v1/docs`.
 *
 * What a key reads and does (M19.2, M19.3) is its slice's `<Slice>V1`, in the public shape: `/v1` answers with it and
 * the MCP tools return it, over the same use cases the console calls, so a key and a person see the same team.
 *
 * The assembly only (docs/adr/0041-transports-are-per-slice-layers-and-the-api-runs-as-three-workers.md): each slice's
 * group is its folder's `http.ts`; a new slice adds its folder and one line here.
 */
export const PublicApiLive = Layer.mergeAll(
  HttpApiBuilder.layer(PublicApi, { openapiPath: "/v1/openapi.json" }),
  HttpApiScalar.layerCdn(PublicApi, { path: "/v1/docs" })
).pipe(
  Layer.provide(
    Layer.mergeAll(
      KeyHttp,
      TeamHttp,
      CommerceHttp,
      OrdersHttp,
      ForwardingHttp,
      ReturnsHttp,
      TicketsHttp,
      AutomationsHttp,
      AnalyticsHttp,
      SheetsHttp,
      QueueHttp,
      ProposalsHttp,
      ChargebacksHttp,
      CostsHttp
    )
  ),
  Layer.provide(ApiKeyAuthLive)
)
