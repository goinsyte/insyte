import { Context, Effect, Layer, Schema } from "effect"
import type { EmailKind, EmailProps } from "./emails/index.ts"
import type * as RenderEmail from "./RenderEmail.ts"

/*
 * A mail of one kind, rendered: the subject, the HTML React Email makes of its template, and a plain-text alternative
 * read off that same HTML, so the two never say different things. The renderer is a service with a layer, like every
 * integration here; the pure `renderEmail` under it (`RenderEmail.ts`) is what the previews and the tests call. The
 * templates and React Email are imported on the first mail an isolate renders, not when the Worker starts
 * (ADR-0041 §3); a load that fails is that mail's `MailRenderError`, and the next mail tries again.
 */

export interface Rendered {
  readonly subject: string
  readonly text: string
  readonly html: string
}

/** A template that would not render: a bug in it or in its props. Never the recipient's address. */
export class MailRenderError extends Schema.TaggedError<MailRenderError>()("MailRenderError", {
  kind: Schema.String,
  reason: Schema.String
}) {}

let loading: Promise<typeof RenderEmail> | undefined

const load = () =>
  loading ??= import("./RenderEmail.ts").catch((error: unknown) => {
    // Tried again on the next mail.
    loading = undefined
    throw error
  })

export class MailRenderer extends Context.Service<MailRenderer, {
  readonly render: <K extends EmailKind>(kind: K, props: EmailProps<K>) => Effect.Effect<Rendered, MailRenderError>
}>()("integrations/MailRenderer") {
  static readonly layer = Layer.succeed(
    MailRenderer,
    MailRenderer.of({
      render: (kind, props) =>
        Effect.tryPromise({
          try: () => load().then((m) => m.renderEmail(kind, props)),
          catch: (error) => new MailRenderError({ kind, reason: String(error) })
        }).pipe(Effect.withSpan("MailRenderer.render", { attributes: { kind } }))
    })
  )
}
