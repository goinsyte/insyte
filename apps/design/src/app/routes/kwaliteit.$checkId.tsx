import { DemoQualityLink } from "@insyte/ui/app/quality/demo-link"
import { QualityLinkScreen } from "@insyte/ui/app/quality/link-screen"
import { createFileRoute } from "@tanstack/react-router"

/* A quality check answered through its link (M9.4): outside `_admin`, so none of the console's chrome or gates. */
export const Route = createFileRoute("/kwaliteit/$checkId")({
  component: () => (
    <DemoQualityLink>
      <QualityLinkScreen />
    </DemoQualityLink>
  )
})
