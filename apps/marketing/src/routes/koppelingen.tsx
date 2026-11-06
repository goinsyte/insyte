import { KoppelingenPage } from "@insyte/ui/marketing/pages/koppelingen"
import { createFileRoute } from "@tanstack/react-router"
import { siteLinks } from "../links.ts"
import { meta } from "../meta.ts"

export const Route = createFileRoute("/koppelingen")({
  head: () => ({
    ...meta({
      path: "/koppelingen",
      title: "Koppelingen — Shopify, Gmail, Stripe, Klarna en meer | Insyte",
      description:
        "Alle diensten waarmee Insyte koppelt: Shopify, Gmail en Outlook, Stripe, Klarna en PayPal, DHL en PostNL, Klaviyo, Slack, Exact Online en meer, met wat Insyte ermee doet. Een MCP-server komt binnenkort."
    })
  }),
  component: () => <KoppelingenPage links={siteLinks} />
})
