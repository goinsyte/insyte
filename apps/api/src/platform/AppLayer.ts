import { Layer } from "effect"
import { AuthRoutes } from "../transports/http/AuthRoutes.ts"
import { ConnectRoutes, KlaviyoConnectRoutes, SlackConnectRoutes } from "../transports/http/ConnectRoutes.ts"
import { CourseMediaRoutes } from "../transports/http/CourseMediaRoutes.ts"
import { DataImportRoutes } from "../transports/http/DataImportRoutes.ts"
import { DevRoutes } from "../transports/http/DevRoutes.ts"
import { EvidenceRoutes } from "../transports/http/EvidenceRoutes.ts"
import { FileRoutes } from "../transports/http/FileRoutes.ts"
import { NotFound } from "../transports/http/NotFound.ts"
import { PixelRoutes } from "../transports/http/PixelRoutes.ts"
import { PortalRoutes } from "../transports/http/PortalRoutes.ts"
import { QualityMediaRoutes } from "../transports/http/QualityMediaRoutes.ts"
import { RealtimeRoutes } from "../transports/http/RealtimeRoutes.ts"
import { RequestContext } from "../transports/http/RequestContext.ts"
import { SupplierHookRoutes } from "../transports/http/SupplierHookRoutes.ts"
import { SystemRoutes } from "../transports/http/SystemRoutes.ts"
import { TrackingRoutes } from "../transports/http/TrackingRoutes.ts"
import { WebhookRoutes } from "../transports/http/WebhookRoutes.ts"
import { RpcContext, RpcRoutes } from "../transports/rpc/RpcRoutes.ts"
import { onServices } from "./Services.ts"

/*
 * The composition root (16 §5): every implementation is chosen here, and the layer is built once per isolate. Nothing
 * that holds a socket belongs in it: a Worker forbids I/O objects shared across requests, so the database connection
 * is opened per request (`RequestDb.ts`), and the layer holds only the way to open one (`HyperdriveConnect`).
 *
 * The layers are split by the Worker that composes them (ADR-0041): this file is the HTTP half, the routes and what a
 * request needs; `BackgroundLayer.ts` is what the queue consumers, the cron and the Workflows run on; `InfraLayer.ts`
 * is what both stand on. The public API and the MCP server are the public Worker's (`PublicLayer.ts`), on the same
 * services through `onServices`.
 */

const Transports = Layer.mergeAll(
  SystemRoutes,
  AuthRoutes,
  DevRoutes,
  RpcRoutes,
  RealtimeRoutes,
  ConnectRoutes,
  KlaviyoConnectRoutes,
  SlackConnectRoutes,
  WebhookRoutes,
  SupplierHookRoutes,
  TrackingRoutes,
  FileRoutes,
  PortalRoutes,
  QualityMediaRoutes,
  EvidenceRoutes,
  CourseMediaRoutes,
  DataImportRoutes,
  PixelRoutes,
  RequestContext,
  NotFound
)

/** The API Worker's layer: its routes, the console's RPC handlers (which only it serves), and the services. */
export const AppLayer = onServices(Transports.pipe(Layer.provideMerge(RpcContext)))
