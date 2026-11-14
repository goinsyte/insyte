import { Forbidden, NoWorkspace, Unauthenticated } from "@insyte/domain/Errors"
import { ConnectionList } from "@insyte/modules/stores/domain/Connections"
import { Schema } from "effect"
import { AsyncResult, Atom } from "effect/reactivity"
import { RpcClientError } from "effect/rpc"
import { ConsoleClient } from "./client.ts"
import { NOTES } from "./frame.ts"
import { INBOX } from "./inbox.ts"
import { MARKETING } from "./marketing.ts"
import { DEPTH } from "./settings-depth.ts"
import { HEALTH, STORES } from "./stores.ts"

/*
 * Instellingen → Koppelingen (M6, widgets/05 §5.1): every external account's status, name and last sync, primed by
 * the route's loader and carried in the document. Read only: it is read again when a store, its sync health, Klaviyo,
 * a mailbox, Slack (Meldingen) or the sending domain changes, which their own pages do.
 */

export const connectionsAtom = Atom.serializable(
  ConsoleClient.query("Connections.list", undefined, {
    reactivityKeys: [...STORES, ...HEALTH, ...MARKETING, ...INBOX, ...NOTES, ...DEPTH]
  }),
  {
    key: "connections",
    schema: AsyncResult.Schema({
      success: ConnectionList,
      error: Schema.Union([Forbidden, NoWorkspace, Unauthenticated, RpcClientError.RpcClientError])
    }),
    skipInitialRun: true
  }
)
