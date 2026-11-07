import { safeRedirect } from "@insyte/domain/Redirect"
import { LoginPage } from "@insyte/ui/app/auth/login-screen"
import { createFileRoute } from "@tanstack/react-router"

/**
 * The design reference's sign-in screen, against better-auth. `redirect` is held to the console's own paths; `error` is
 * a code from a Google round trip, kept only if it looks like one, so no text from the address reaches the page.
 */
export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined; error?: string | undefined } => {
    const redirect = safeRedirect(search["redirect"])
    const error = search["error"]
    // Both keys always, `undefined` when refused: a key left out would let the raw value through.
    return {
      redirect,
      error: typeof error === "string" && /^[A-Za-z_]{1,64}$/.test(error) ? error : undefined
    }
  },
  head: () => ({ meta: [{ title: "Inloggen · Insyte" }] }),
  component: LoginPage
})
