import { Backfills } from "@insyte/modules/stores/domain/Ports"
import { Effect } from "effect"
import { subscriber } from "../Subscriber.ts"

export const Backfill = subscriber("backfill", {
  // A connected store's first import (M6.3): one Workflow per connect, named by this event.
  "store.connected": (id, event) =>
    Effect.flatMap(
      Effect.service(Backfills),
      (backfills) => backfills.start({ key: `bf-${id}`, workspaceId: event.workspaceId, storeId: event.storeId })
    )
})
