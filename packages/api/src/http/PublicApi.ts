import { WEBHOOK_API_VERSIONS } from "@insyte/domain/Webhooks"
import { HttpApi, OpenApi } from "effect/http-api"
import { AnalyticsGroup } from "./groups/AnalyticsGroup.ts"
import { AutomationsGroup } from "./groups/AutomationsGroup.ts"
import { ChargebacksGroup } from "./groups/ChargebacksGroup.ts"
import { CommerceGroup } from "./groups/CommerceGroup.ts"
import { ConnectionsGroup } from "./groups/ConnectionsGroup.ts"
import { CostsGroup } from "./groups/CostsGroup.ts"
import { DataGroup } from "./groups/DataGroup.ts"
import { ForwardingGroup } from "./groups/ForwardingGroup.ts"
import { KeyGroup } from "./groups/KeyGroup.ts"
import { KnowledgeGroup } from "./groups/KnowledgeGroup.ts"
import { OrdersGroup } from "./groups/OrdersGroup.ts"
import { ProposalsGroup } from "./groups/ProposalsGroup.ts"
import { QueueGroup } from "./groups/QueueGroup.ts"
import { ReturnsGroup } from "./groups/ReturnsGroup.ts"
import { SheetsGroup } from "./groups/SheetsGroup.ts"
import { TeamGroup } from "./groups/TeamGroup.ts"
import { TicketsGroup } from "./groups/TicketsGroup.ts"
import { ApiKeyAuth } from "./Security.ts"
import { WEBHOOKS_DESCRIPTION, webhooksSection } from "./Webhooks.ts"

/** The dated versions (ADR-0024), as the key door answers them (`Insyte-Version`). */
const VERSIONS_DESCRIPTION = [
  "## Versions",
  "",
  "Every answer carries `Insyte-Version`, the dated version it is in: the one the call names in an `Insyte-Version` " +
  `header (${WEBHOOK_API_VERSIONS.join(", ")}), or else the key's own, the newest on or before the day it was made. ` +
  "A version there is none of is refused with `InvalidRequestV1` (`field: insyte-version`)."
].join("\n")

/*
 * The public API (M19.2, api.md §6): REST under `/v1`, a bearer API key, JSON in snake_case English. What a key may do
 * is its access as the catalogue allows it through the API; it reads: the key itself, the team and the roles, and the
 * orders, products and customers (M6.4); and it acts on orders (M7: tags, the internal note, the shipping address,
 * cancelling, refunds within the key's limit), each write taking an `Idempotency-Key`. Its OpenAPI document is
 * generated from this file, and the reference at `/v1/docs` is drawn from that.
 *
 * This file is the assembly only (docs/adr/0041-transports-are-per-slice-layers-and-the-api-runs-as-three-workers.md):
 * each group, with its V1 schemas, is a file in `groups/`; a new slice adds one there and one line here.
 */

export class PublicApi extends HttpApi.make("insyte")
  .add(
    KeyGroup,
    TeamGroup,
    CommerceGroup,
    OrdersGroup,
    ForwardingGroup,
    ReturnsGroup,
    TicketsGroup,
    AutomationsGroup,
    AnalyticsGroup,
    SheetsGroup,
    KnowledgeGroup,
    QueueGroup,
    ProposalsGroup,
    ChargebacksGroup,
    CostsGroup,
    ConnectionsGroup,
    DataGroup
  )
  .middleware(ApiKeyAuth)
  .prefix("/v1")
  .annotate(OpenApi.Title, "Insyte API")
  .annotate(OpenApi.Version, "1")
  .annotate(OpenApi.Description, `${VERSIONS_DESCRIPTION}\n\n${WEBHOOKS_DESCRIPTION}`)
  .annotate(OpenApi.Transform, webhooksSection)
{}
