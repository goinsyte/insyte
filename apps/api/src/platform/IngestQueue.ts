import { IngestQueue } from "@insyte/modules/stores/domain/Ports"
import { env } from "cloudflare:workers"
import { Effect, Layer } from "effect"

/** A received webhook's id onto `INGEST` (M6.3); the consumer is `Ingest.ts`. */
export interface IngestMessage {
  readonly inboundEventId: string
  readonly workspaceId: string
}

export const IngestQueueLive = Layer.succeed(IngestQueue)(IngestQueue.of({
  enqueue: (message) => Effect.promise(() => env.INGEST.send(message))
}))
