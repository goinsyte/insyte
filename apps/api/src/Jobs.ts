import type { Env } from "./platform/Env.ts"
import type { IngestMessage } from "./platform/Ingest.ts"
import type { EventsMessage } from "./platform/Relay.ts"
import { scheduled } from "./transports/jobs/Cron.ts"
import { queue } from "./transports/jobs/Queue.ts"

/*
 * The jobs Worker, `insyte-jobs` (ADR-0041): the queue consumers, the cron and every Workflow, on the background layer
 * (`platform/BackgroundLayer.ts`) and nothing of the HTTP app. It answers no request; the API Worker starts its
 * Workflows and reaches its Durable Objects through cross-script bindings (`infra/app.ts`).
 */

// The gate per external account (M6.3): token and bucket, in memory.
export { ConnectionGateObject } from "./platform/ConnectionGate.ts"
// The realtime rooms (M5.1): sockets and presence; the relay's sinks and the Workflows publish into them.
export { RoomDurableObject } from "./platform/Room.ts"
export { AutomationRunWorkflow } from "./workflows/AutomationRun.ts"
export { EvidencePackWorkflow } from "./workflows/EvidencePack.ts"
export { FirstAnalysisWorkflow } from "./workflows/FirstAnalysis.ts"
export { ForwardSendWorkflow } from "./workflows/ForwardSend.ts"
export { MarketingSyncWorkflow } from "./workflows/MarketingSync.ts"
export { MonthlyCloseWorkflow } from "./workflows/MonthlyClose.ts"
export { ReturnLabelWorkflow } from "./workflows/ReturnLabel.ts"
export { ShopifyBackfillWorkflow } from "./workflows/ShopifyBackfill.ts"
export { ShopifyWriteWorkflow } from "./workflows/ShopifyWrite.ts"
export { WebhookDeliveryWorkflow } from "./workflows/WebhookDelivery.ts"

export default {
  queue,
  scheduled
} satisfies ExportedHandler<Env, EventsMessage | IngestMessage>
