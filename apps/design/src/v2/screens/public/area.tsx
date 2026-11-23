import type { AreaDef } from "../../areas.ts"
import type { AreaRoute } from "../../router.tsx"
import { QualityCheckScreen } from "./quality-check.tsx"
import { ReturnPortalScreen } from "./return-portal.tsx"

/*
 * The pages opened from a link by someone outside the workspace: the return portal of a store
 * (`/v2/retour/northwind`) and a quality check sent to a supplier (`/v2/kwaliteit/qc-301`). Both
 * draw their own frame on the bare layout.
 */

function Screen({ route }: { readonly route: AreaRoute }) {
  return route.base === "kwaliteit"
    ? <QualityCheckScreen id={route.path[0] ?? ""} />
    : <ReturnPortalScreen handle={route.path[0] ?? ""} />
}

export const area: AreaDef = {
  Screen,
  thread: (route) => ({
    items: [{ kind: "page", label: route.base === "kwaliteit" ? "Kwaliteitscontrole" : "Retourportaal" }],
    ask: null
  })
}
