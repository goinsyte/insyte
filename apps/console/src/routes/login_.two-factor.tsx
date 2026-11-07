import { safeRedirect } from "@insyte/domain/Redirect"
import { TwoFactorPage } from "@insyte/ui/app/auth/two-factor-screen"
import { createFileRoute } from "@tanstack/react-router"

/** The second step of signing in (M2). `login_`: beside `/login`, not inside it. `redirect` is held to our own paths. */
export const Route = createFileRoute("/login_/two-factor")({
  // The key always, `undefined` when refused: a key left out would let the raw value through.
  validateSearch: (search: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: safeRedirect(search["redirect"])
  }),
  head: () => ({ meta: [{ title: "Tweestapsverificatie · Insyte" }] }),
  component: TwoFactorPage
})
