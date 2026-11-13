import { KlaviyoSyncs } from "@insyte/modules/customers/domain/Ports"
import { lastSyncOf } from "@insyte/modules/marketing/use-cases/klaviyo"
import { Layer } from "effect"

/** A customer → their newest Klaviyo sync (M7.5). */
export const KlaviyoSyncsLive = Layer.succeed(KlaviyoSyncs, { lastSyncOf })
