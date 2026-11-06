import { RoadmapPage } from "@insyte/ui/marketing/pages/updates"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    ...meta({
      path: "/roadmap",
      title: "Roadmap \u2014 wat er gepland staat | Insyte",
      description:
        "Wat er gepland staat voor Insyte, zonder datums: de Insyte-agent met zelfstandigheid per actie, een MCP-server, retouren, SAML en OIDC, vervoerders rechtstreeks, Engels en meer. Plannen, geen beloftes."
    })
  }),
  component: () => <RoadmapPage links={siteLinks} />
})
