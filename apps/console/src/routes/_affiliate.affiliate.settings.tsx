import { AffiliateSettingsLayout } from "@insyte/ui/app/affiliate/settings-layout"
import { createFileRoute } from "@tanstack/react-router"

/** The affiliate's settings (M16 steps 3–5): the design's layout, Profiel and Uitbetaling. */
export const Route = createFileRoute("/_affiliate/affiliate/settings")({
  component: AffiliateSettingsLayout
})
