import { Forbidden, NotFound } from "@insyte/domain/Errors"
import {
  InstallPixel,
  LiveLease,
  LiveSnapshot,
  LiveTab,
  PixelInstallFailed,
  StorePixels
} from "@insyte/modules/live/domain/Live"
import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Live (M14 step 3; api.md §2.32): `/live` reads the room and today's sales once its socket is open, and takes the
 * room's `live.visitors` frames on that socket while it holds a lease (Analyse Bekijken). The stores' pixels are
 * Instellingen → Winkels': read at Bekijken, installed or repaired at Beheren.
 */
export class LiveRpcs extends RpcGroup.make(
  Rpc.make("Live.snapshot", { success: LiveSnapshot, error: Forbidden }),
  Rpc.make("Live.subscribe", { payload: LiveTab, success: LiveLease, error: Forbidden }),
  Rpc.make("Live.unsubscribe", { payload: LiveTab, error: Forbidden }),
  Rpc.make("Live.pixels", { success: StorePixels, error: Forbidden }),
  Rpc.make("Live.installPixel", {
    payload: InstallPixel,
    success: StorePixels,
    error: Schema.Union([Forbidden, NotFound, PixelInstallFailed])
  })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
