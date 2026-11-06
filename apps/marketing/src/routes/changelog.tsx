import { ChangelogPage } from "@insyte/ui/marketing/pages/updates"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/changelog")({
  head: () => ({
    ...meta({
      path: "/changelog",
      title: "Changelog \u2014 nieuw in Insyte",
      description:
        "Wat er de afgelopen weken in de Insyte-console bij kwam, het nieuwste eerst: bewaarde filters, klanten samenvoegen, het leveranciersportaal, Mijn werk en Agenda, en mailboxen in de inbox."
    })
  }),
  component: () => <ChangelogPage links={siteLinks} />
})
