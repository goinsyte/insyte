import { ReturnPortal } from "@insyte/ui/app/returns/portal/portal-screen"
import { createFileRoute } from "@tanstack/react-router"

/* The public returns portal: outside `_admin`, so none of the console's chrome or gates. */
export const Route = createFileRoute("/retour/$storeHandle")({
  component: ReturnPortal
})
