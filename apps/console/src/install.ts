/**
 * This host's composition root (ADR-0026): the real auth client in the seam, and where the product and the site live.
 * The console installs no data source; a screen whose slice is not built yet is not mounted here (11 §7.3).
 */
import { installAuthClient } from "@insyte/ui/app/lib/auth-client"
import { configureHumanCheck } from "@insyte/ui/app/lib/human-check"
import { configureHrefs } from "@insyte/ui/data-source/hrefs"
import { consoleAuthClient } from "./auth/client.ts"

installAuthClient(consoleAuthClient)
// The product is this origin's root; the terms and the privacy statement are the marketing site's (ADR-0038).
configureHrefs({ app: "", site: "https://goinsyte.com" })
// Turnstile's site key is the API's to give (`GET /api/config`), per stage; asked once, when a form first needs it.
let siteKey: Promise<string | null> | undefined
configureHumanCheck(() =>
  siteKey ??= fetch("/api/config").then(
    async (response) => ((await response.json()) as { turnstileSiteKey?: string }).turnstileSiteKey || null,
    () => null
  )
)
