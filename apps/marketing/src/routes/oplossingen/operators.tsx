import { OperatorsPage } from "@insyte/ui/marketing/pages/oplossingen"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../../links.ts"
import { meta } from "../../meta.ts"

export const Route = createFileRoute("/oplossingen/operators")({
  head: () => ({
    ...meta({
      path: "/oplossingen/operators",
      title: "Insyte voor operators — al je Shopify-winkels op één scherm",
      description:
        "Bestellingen, klantenservice, chargebacks en automatiseringen van al je Shopify-winkels in één console. De Insyte-agent doet het werk, binnen jouw regels."
    })
  }),
  component: () => <OperatorsPage links={siteLinks} />
})
