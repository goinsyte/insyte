import { PrivacyPage } from "@insyte/ui/marketing/pages/privacy"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/privacy")({
  head: () => ({
    ...meta({
      path: "/privacy",
      title: "Privacyverklaring \u2014 Insyte",
      description:
        "Welke persoonsgegevens Insyte verwerkt, waarom, hoe lang, met wie en wat je rechten zijn. Concepttekst, juridisch nog te controleren."
    })
  }),
  component: () => <PrivacyPage links={siteLinks} />
})
