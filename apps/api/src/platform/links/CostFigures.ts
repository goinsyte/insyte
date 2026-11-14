import { CostFigures } from "@insyte/modules/analytics/domain/Ports"
import { figuresIn } from "@insyte/modules/costs/use-cases/costs"
import { Layer } from "effect"

/** INSYTE()'s cost, profit and ad figures → Kosten's months, on the figures' transaction (M14 step 4). */
export const CostFiguresLive = Layer.succeed(CostFigures, {
  months: (sql, months) => figuresIn(sql, months)
})
