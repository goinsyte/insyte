/// <reference types="vite/client" />

/** The public origins this deployment links to; see `site.ts`. Not secrets: they ship in the bundle. */
interface ImportMetaEnv {
  readonly VITE_SITE_ORIGIN?: string
  readonly VITE_APP_ORIGIN?: string
}
