import type { PortalStatus } from "../lib/team"

/** A supplier's portal status as the list and the dialog say it. */
export const PORTAL_LABEL: Record<PortalStatus, { label: string; tone: "success" | "warning" | "neutral" }> = {
  active: { label: "Actief", tone: "success" },
  invited: { label: "Uitgenodigd", tone: "warning" },
  none: { label: "Niet uitgenodigd", tone: "neutral" }
}
