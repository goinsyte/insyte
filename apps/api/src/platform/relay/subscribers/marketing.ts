import { MarketingSyncs } from "@insyte/modules/marketing/domain/Marketing"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Marketing = subscriber("marketing", {
  // Customers sent to a marketing list (M7.5): one Workflow per event, named by it.
  "marketing.sync_requested": (id, event) =>
    Effect.flatMap(
      Effect.service(MarketingSyncs),
      (syncs) => syncs.start({ key: `ms-${id}`, workspaceId: event.workspaceId, syncId: event.syncId })
    )
})
