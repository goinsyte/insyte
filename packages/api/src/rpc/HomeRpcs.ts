import { Forbidden } from "@insyte/domain/Errors"
import {
  BreakdownInput,
  HomeBrief,
  HomeWidgets,
  RevenueBreakdown,
  WidgetsInput
} from "@insyte/modules/home/domain/Home"
import { Rpc, RpcGroup } from "effect/rpc"
import { Authenticated } from "./Authenticated.ts"
import { Member } from "./Member.ts"
import { WithDb } from "./WithDb.ts"

/**
 * Start's figures (M10.3): the hero's counts, the board's widgets with the pulse band, and the revenue figure taken
 * apart. Every member may open Start; each figure narrows to the areas and stores the role may open, and one it may
 * not read is left out. The breakdown is Analyse's.
 */
export class HomeRpcs extends RpcGroup.make(
  Rpc.make("Home.brief", { success: HomeBrief }),
  Rpc.make("Home.widgets", { payload: WidgetsInput, success: HomeWidgets }),
  Rpc.make("Home.revenueBreakdown", { payload: BreakdownInput, success: RevenueBreakdown, error: Forbidden })
)
  .middleware(Member)
  .middleware(Authenticated)
  .middleware(WithDb)
{}
