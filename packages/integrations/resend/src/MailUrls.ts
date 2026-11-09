import { Config, Context, Effect, Layer } from "effect"

/*
 * Every address a mail links to, built from the stage's own origin, so one template works in local dev, a preview,
 * staging and production. The templates take finished URLs as props and never read the environment; whoever sends a
 * mail builds its links here. `CONSOLE_ORIGIN` is the one origin the mails need: the console serves every page they
 * point at (the sign-in, settings, the invitation landing, the portals), it is what better-auth and the invitation
 * links already mint from, and `wrangler.jsonc` (local) and `infra/app.ts` (each stage) set it. The logo needs no
 * origin: it is drawn in the HTML (`emails/components/mark.tsx`).
 */

export interface Urls {
  readonly origin: string
  /** A console page: `console("/settings/notifications")`. */
  readonly console: (path: string) => string
}

/** The links for one origin. Pure, for the previews and the tests; the worker gets it from config through the layer. */
export const urlsFor = (origin: string): Urls => {
  const base = new URL(origin)
  return { origin: base.origin, console: (path) => new URL(path, base).href }
}

export class MailUrls extends Context.Service<MailUrls, Urls>()("integrations/MailUrls") {
  static readonly layer = Layer.effect(
    MailUrls,
    Effect.map(Config.String("CONSOLE_ORIGIN"), (origin) => MailUrls.of(urlsFor(origin)))
  )
}
