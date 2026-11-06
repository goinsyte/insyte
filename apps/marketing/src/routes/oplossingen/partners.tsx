import { PartnersPage } from "@insyte/ui/marketing/pages/oplossingen"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/oplossingen/partners")({
  head: () => ({
    ...meta({
      path: "/oplossingen/partners",
      title: "Insyte voor partners — links, conversies en uitbetalingen",
      description:
        "Een eigen portaal voor affiliates: links met UTM en QR-code, conversies per link, niveaus die meegroeien en uitbetaling per maand."
    })
  }),
  component: () => <PartnersPage links={siteLinks} />
})
