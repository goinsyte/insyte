import { urlsFor } from "../MailUrls.ts"

/*
 * The origin the React Email dev server's previews link to: the console as `bun run console` serves it locally, the
 * value `apps/api/wrangler.jsonc` gives `CONSOLE_ORIGIN`. Previews only; a sent mail's links come from `MailUrls`.
 */
export const PREVIEW = urlsFor("http://localhost:4300")
