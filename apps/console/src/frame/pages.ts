import { pageMatcher } from "@insyte/ui/app/lib/page-match"
import { useRouter } from "@tanstack/react-router"
import { useMemo } from "react"

/*
 * Which of the design's pages the console has (M5): read off its own route tree, so a link to a page not built yet
 * (Vraag Insyte, Facturatie, Koppelingen, the full notifications page…) is left out of the rail, the panels, the
 * palette, the bell and the avatar menu, and comes back by itself once its route is there. A record's address answers
 * to its route's pattern (`/orders/ord_12` to `/orders/$orderId`).
 */

/** `hasPage("/settings/billing")`: whether a console route answers that address (a search or a hash aside). */
export function useHasPage(): (to: string) => boolean {
  const router = useRouter()
  return useMemo(() => pageMatcher(Object.keys(router.routesByPath)), [router])
}
