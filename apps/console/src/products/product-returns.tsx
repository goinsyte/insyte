import { useAtomValue } from "@effect/atom-react"
import { returnRate } from "@insyte/ui/app/lib/returns"
import { type ProductReturnsFigures, ProductReturnsPanel } from "@insyte/ui/app/returns/product-returns-panel"
import { Option } from "effect"
import { AsyncResult } from "effect/reactivity"
import { useMemo } from "react"
import { productFiguresAtom } from "../data/quality.ts"
import { productReturnsAtom } from "../data/returns.ts"
import { useGate } from "../frame/refusals.ts"

/*
 * The product page's Retouren block in the console (M9 11.6): the units it sold and got back in the last 90 days,
 * rejected returns aside (`Quality.stats`, the same figures the list's Aandacht cut reads), and why they came back,
 * by the reasons of those returns (`Returns.list{ productId }`). Both fence on the viewer's stores. A role that cannot
 * read returns has no block.
 */

const DAY_MS = 86_400_000

function ConsoleProductReturns({ productId }: { productId: string }) {
  const figures = Option.getOrUndefined(AsyncResult.value(useAtomValue(productFiguresAtom(productId))))
  const list = Option.getOrUndefined(AsyncResult.value(useAtomValue(productReturnsAtom(productId))))
  const r = useMemo((): ProductReturnsFigures => {
    const row = figures?.rows.find((x) => x.id === productId)
    const since = Date.now() - 90 * DAY_MS
    const by = new Map<string, { label: string; n: number }>()
    for (const x of list?.rows ?? []) {
      if (x.status === "rejected" || x.createdAt < since) continue
      by.set(x.reasonId, { label: x.reasonLabel, n: (by.get(x.reasonId)?.n ?? 0) + 1 })
    }
    const sold = row?.sold ?? 0
    const returned = row?.returned ?? 0
    return {
      sold,
      returned,
      rate: returnRate(returned, sold),
      reasons: [...by.entries()].toSorted((a, b) => b[1].n - a[1].n).map(([id, x]) => ({ id, ...x }))
    }
  }, [figures, list, productId])
  return <ProductReturnsPanel r={r} />
}

/** The block as the product page's source names it, where the role reads returns. */
export function useConsoleProductReturns() {
  return useGate("returns", 1).ok ? ConsoleProductReturns : undefined
}
