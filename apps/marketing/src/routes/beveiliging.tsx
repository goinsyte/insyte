import { BeveiligingPage } from "@insyte/ui/marketing/pages/beveiliging"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/beveiliging")({
  head: () => ({
    ...meta({
      path: "/beveiliging",
      title: "Beveiliging — rollen, 2FA, auditlog en gegevens in de EU | Insyte",
      description:
        "Rollen en eigen rollen, tweestapsverificatie, Google Workspace verplicht, een auditlog, grenzen voor de Insyte-agent, API-sleutels met scopes en ondertekende webhooks. Gegevens in de EU, met de lijst van subverwerkers."
    })
  }),
  component: () => <BeveiligingPage links={siteLinks} />
})
