import { lazy, Suspense } from "react"
import type { Extension } from "../lib/types/domain"

/*
 * The design's in-place app dialog (`open-app-dialog.tsx`), loaded only where it is drawn: it reads the design's
 * settings and workspace stores, which a host without the design's data source (the console) must never load.
 */

const OpenAppDialog = lazy(() => import("./open-app-dialog").then((m) => ({ default: m.OpenAppDialog })))

export function InPlaceApp(
  props: { extension: Extension | null; open: boolean; onOpenChange: (open: boolean) => void }
) {
  return (
    <Suspense fallback={null}>
      <OpenAppDialog {...props} />
    </Suspense>
  )
}
