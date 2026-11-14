import { useRouter } from "@tanstack/react-router"
import { useCallback } from "react"

/*
 * Which of the design's pages the console has (M5): read off its own route tree, so a link to a page not built yet
 * (Vraag Insyte, Facturatie, Koppelingen, the full notifications page…) is left out of the rail, the panels, the
 * palette, the bell and the avatar menu, and comes back by itself once its route is there.
 */

/** `hasPage("/settings/billing")`: whether a console route answers that address (a search or a hash aside). */
export function useHasPage(): (to: string) => boolean {
  const router = useRouter()
  return useCallback(
    (to: string) => {
      const path = to.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/"
      return path in router.routesByPath
    },
    [router]
  )
}
