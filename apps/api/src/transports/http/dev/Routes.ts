import { Effect, Layer, Scope } from "effect"
import { HttpRouter } from "effect/http"
import { AuthEventsOf } from "./auth.ts"
import { AutomationRunsOf } from "./automations.ts"
import { ChargebackRemind } from "./chargebacks.ts"
import { CostsRoutes } from "./costs.ts"
import { FactsRoutes } from "./facts.ts"
import { FxRoutes } from "./fx.ts"
import { InvitationLapse } from "./invitations.ts"
import { MailRoutes } from "./mail.ts"
import { NotifyRoutes } from "./notifications.ts"
import { OutboxRoutes } from "./outbox.ts"
import { ProposalLapse } from "./proposals.ts"
import { QueueRefresh } from "./queue.ts"
import { RetentionRoutes } from "./retention.ts"
import { SendingDomainRoutes } from "./sending-domain.ts"
import { StatementsClose } from "./statements.ts"
import { StoreRoutes } from "./stores.ts"
import { TrackingSweep } from "./tracking.ts"
import { TrashSweep } from "./trash.ts"
import { UndoRoutes } from "./undo.ts"

/*
 * Every `__dev` route, one file per concern. Loaded by `../DevRoutes.ts` on the first request under `/api/__dev/`,
 * never at startup. A new concern is a file here and a line below.
 */
const Routes = Layer.mergeAll(
  CostsRoutes,
  TrashSweep,
  SendingDomainRoutes,
  RetentionRoutes,
  FactsRoutes,
  FxRoutes,
  StoreRoutes,
  TrackingSweep,
  StatementsClose,
  QueueRefresh,
  ChargebackRemind,
  NotifyRoutes,
  MailRoutes,
  AuthEventsOf,
  OutboxRoutes,
  AutomationRunsOf,
  UndoRoutes,
  InvitationLapse,
  ProposalLapse
)

/**
 * The routes as one handler, built when this module loads, once per isolate: a router of their own, answering
 * `RouteNotFound` for a path it does not have, as the app's router would (`NotFound.ts` turns it into the 404).
 */
export const handler = Effect.runSync(
  HttpRouter.toHttpEffect(Routes).pipe(Effect.provideService(Scope.Scope, Scope.makeUnsafe()))
)
