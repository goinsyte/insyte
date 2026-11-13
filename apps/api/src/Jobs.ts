import type { Env } from "./platform/Env.ts"
import type { IngestMessage } from "./platform/Ingest.ts"
import type { EventsMessage } from "./platform/Relay.ts"
import { scheduled } from "./transports/jobs/Cron.ts"
import { queue } from "./transports/jobs/Queue.ts"

/*
 * The jobs Worker, `insyte-jobs` (ADR-0041): the queue consumers, the cron and every Workflow, on the background layer
 * (`platform/BackgroundLayer.ts`) and nothing of the HTTP app. It answers no request. It hosts every Durable Object
 * and Workflow; the API and the public Worker reach them through cross-script bindings (`infra/app.ts`), so bindings
 * run one way and this Worker deploys first.
 */

// The gate per external account (M6.3): token and bucket, in memory.
export { ConnectionGateObject } from "./platform/ConnectionGate.ts"
// The realtime rooms (M5.1): sockets and presence; the relay's sinks and the Workflows publish into them.
export { RoomDurableObject } from "./platform/Room.ts"
// The live room per workspace (M14 step 3): storefront visitors in memory. The API's pixel route and live view reach it.
export { LiveRoomDurableObject } from "./platform/LiveRoom.ts"
// The edge guards' counters (M2.3), for the API's and the public Worker's routes alike: one namespace, SQLite-backed.
export { RateLimiter } from "./platform/RateLimiter.ts"
export { AutomationRunWorkflow } from "./workflows/AutomationRun.ts"
export { EvidencePackWorkflow } from "./workflows/EvidencePack.ts"
export { FirstAnalysisWorkflow } from "./workflows/FirstAnalysis.ts"
export { ForwardSendWorkflow } from "./workflows/ForwardSend.ts"
export { MarketingSyncWorkflow } from "./workflows/MarketingSync.ts"
export { MonthlyCloseWorkflow } from "./workflows/MonthlyClose.ts"
export { PrivacyExportWorkflow } from "./workflows/PrivacyExport.ts"
export { ReturnLabelWorkflow } from "./workflows/ReturnLabel.ts"
export { ShopifyBackfillWorkflow } from "./workflows/ShopifyBackfill.ts"
export { ShopifyWriteWorkflow } from "./workflows/ShopifyWrite.ts"
export { WebhookDeliveryWorkflow } from "./workflows/WebhookDelivery.ts"
export { WorkspaceLifecycleWorkflow } from "./workflows/WorkspaceLifecycle.ts"

export default {
  queue,
  scheduled
} satisfies ExportedHandler<Env, EventsMessage | IngestMessage>
