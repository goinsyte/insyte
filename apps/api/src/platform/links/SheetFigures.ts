import { CostFigures } from "@insyte/modules/analytics/domain/Ports"
import { figuresIn } from "@insyte/modules/analytics/use-cases/figures"
import { SheetFigures } from "@insyte/modules/sheets/domain/Ports"
import { Effect, Layer } from "effect"

/** A sheet export → the INSYTE() figures from analytics, on the export's transaction (M14 step 4). */
export const SheetFiguresLive = Layer.effect(
  SheetFigures,
  Effect.map(Effect.service(CostFigures), (costs) => ({
    read: (sql, requests) => figuresIn(sql, requests).pipe(Effect.provideService(CostFigures, costs))
  }))
)
