import { FAQ_ALL, faqJsonLd, VragenPage } from "@insyte/ui/marketing/pages/vragen"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/vragen")({
  head: () => ({
    ...meta({
      path: "/vragen",
      title: "Vragen over Insyte — product, AI, koppelingen en prijzen",
      description:
        "Antwoorden op wat dropshippers het vaakst vragen over Insyte: wat erin zit, wat de AI doet, welke koppelingen er zijn, wat het kost en waar je gegevens staan."
    }),
    scripts: [{ type: "application/ld+json", children: faqJsonLd(FAQ_ALL) }]
  }),
  component: () => <VragenPage links={siteLinks} />
})
