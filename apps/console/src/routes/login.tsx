import { safeRedirect } from "@insyte/domain/Redirect"
import { LoginPage } from "@insyte/ui/app/auth/login-screen"
import { createFileRoute } from "@tanstack/react-router"

/** The design reference's sign-in screen, against better-auth. `redirect` is held to the console's own paths. */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = safeRedirect(search["redirect"])
    return redirect === undefined ? {} : { redirect }
  },
  head: () => ({ meta: [{ title: "Inloggen · Insyte" }] }),
  component: LoginPage
})
