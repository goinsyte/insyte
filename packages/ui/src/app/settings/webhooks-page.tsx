import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { DemoWebhooksSource } from "../developer/webhooks-demo-source"
import { WebhooksPage } from "./webhooks-screen"

const Route = getRouteApi("/_admin/settings/webhooks")

/** Webhooks in the design app: the page over the demo store, its endpoint and delivery in the address. */
export function DemoWebhooksPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  return (
    <DemoWebhooksSource
      search={search}
      go={(next, options) =>
        void navigate({ to: "/settings/webhooks", search: next, ...(options?.replace ? { replace: true } : {}) })}
    >
      <WebhooksPage />
    </DemoWebhooksSource>
  )
}
