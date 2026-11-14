import { StoreMirror } from "@insyte/modules/stores/Mirror"
import { Layer } from "effect"
import { AgentLinksLive } from "./links/AgentLinks.ts"
import { ChatCommandsLive } from "./links/ChatCommands.ts"
import { CostFiguresLive } from "./links/CostFigures.ts"
import { KlaviyoSyncsLive } from "./links/KlaviyoSyncs.ts"
import { MirrorFollowersLive } from "./links/MirrorFollowers.ts"
import { ProposalLinksLive } from "./links/ProposalLinks.ts"
import { RefunderLive } from "./links/Refunder.ts"
import { ReturnParcelsLive } from "./links/ReturnParcels.ts"
import { SheetFiguresLive } from "./links/SheetFigures.ts"
import { ShopifyReturnsLive } from "./links/ShopifyReturns.ts"
import { ThreadTicketsLive } from "./links/ThreadTickets.ts"
import { TicketMailLive } from "./links/TicketMail.ts"
import { TrashKindsLive } from "./links/TrashKinds.ts"
import { UndoCompensationsLive } from "./links/UndoCompensations.ts"

/*
 * Where one slice's need meets another slice's use case (architecture.md: a slice never reaches into another's
 * use-cases/). Each port is the asking slice's; its implementation is in `links/`, one file per port, merged here
 * where the app is composed (ADR-0041):
 *
 *   stores' mirror  → forwarding's legs and tracking's deliveries, on the page's transaction (M8.2, M8.4), and a
 *                     return's exchange or replacement order linked to it (M9.3)
 *   stores' webhook → a return opened, approved, declined or closed in Shopify, for the returns slice (M9.3)
 *   undo            → each reversible command's compensation, by the name its token carries (ADR-0023); a filed
 *                     plate's undo runs its command's own compensation through the same table
 *   a filed plate   → the command it carries (a return or a quality check approved, the shopper's delay mail put
 *                     in line, a reorder ticket opened), as the person, and the queue brought in line on the same
 *                     transaction (M10.2)
 *   returns' refund → the orders slice's refund, on the return's transaction (M9.1)
 *   a customer      → their newest Klaviyo sync (M7.5)
 *   AfterShip       → a return's parcel, for the returns slice (M9.2)
 *   the inbox       → a ticket made from a thread, and taken away again (M11 step 2)
 *   a ticket        → its shopper mailed from the team's mailbox ("Klant informeren"), and called off again (M11)
 *   a chat command  → an order's note or cancellation, a ticket made, assigned or moved (M11.4), and its undo
 *   the Prullenbak  → each kind's own put-back and purge (M17 step 20.1a)
 *   the Marketplace → a recipe app's API key, made, revoked, put back and narrowed by the developer slice (M17)
 *   a sheet export  → the INSYTE() figures from analytics, on the export's transaction (M14 step 4)
 *   INSYTE()        → Kosten's months (costs, net profit, ROAS, the ad lines), on the figures' transaction (M14.4)
 */

/** Every link between slices, and the mirror other slices write through. */
export const SliceLinks = StoreMirror.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      MirrorFollowersLive,
      UndoCompensationsLive,
      ProposalLinksLive,
      AgentLinksLive,
      ChatCommandsLive,
      RefunderLive,
      KlaviyoSyncsLive,
      ReturnParcelsLive,
      ShopifyReturnsLive,
      ThreadTicketsLive,
      TicketMailLive,
      TrashKindsLive,
      SheetFiguresLive.pipe(Layer.provideMerge(CostFiguresLive))
    )
  )
)
