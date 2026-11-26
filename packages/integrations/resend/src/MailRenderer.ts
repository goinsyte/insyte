import { Context, Effect, Layer, Schema } from "effect"
import type { EmailKind, EmailProps } from "./emails/index.ts"
import type * as RenderEmail from "./RenderEmail.ts"

/*
 * A mail of one kind, rendered: the subject, the HTML React Email makes of its template, and a plain-text alternative
 * read off that same HTML, so the two never say different things. The renderer is a service with a layer, like every
 * integration here; the pure `renderEmail` under it (`RenderEmail.ts`) is what the previews and the tests call. The
 * templates and React Email are imported on the first mail an isolate renders, not when the Worker starts
 * (ADR-0041 §3); a load that fails is that mail's `MailRenderError` with `loading`, not the template's fault, and
 * the next mail tries again.
 */

export interface Rendered {
  readonly subject: string
  readonly text: string
  readonly html: string
}

/**
 * A template that would not render: a bug in it or in its props, or (`loading`) the templates that did not load in
 * this isolate, which a later try may well get past. Never the recipient's address.
 */
export class MailRenderError extends Schema.TaggedError<MailRenderError>()("MailRenderError", {
  kind: Schema.String,
  reason: Schema.String,
  loading: Schema.optional(Schema.Boolean)
}) {}

let loading: Promise<Templates> | undefined

const load = () =>
  loading ??= import("./RenderEmail.ts").catch((error: unknown) => {
    // Tried again on the next mail.
    loading = undefined
    throw error
  })

/** What the renderer needs of `RenderEmail.ts`. */
type Templates = Pick<typeof RenderEmail, "renderEmail">

/** A renderer over a loader of the templates: the lazy import in the Worker, another in the tests. */
const rendererFrom = (templates: () => Promise<Templates>) =>
  MailRenderer.of({
    render: (kind, props) =>
      Effect.tryPromise({
        try: templates,
        catch: (error) =>
          new MailRenderError({ kind, reason: `templates did not load: ${String(error)}`, loading: true })
      }).pipe(
        Effect.flatMap((m) =>
          Effect.tryPromise({
            try: () => m.renderEmail(kind, props),
            catch: (error) => new MailRenderError({ kind, reason: String(error) })
          })
        ),
        Effect.withSpan("MailRenderer.render", { attributes: { kind } })
      )
  })

export class MailRenderer extends Context.Service<MailRenderer, {
  readonly render: <K extends EmailKind>(kind: K, props: EmailProps<K>) => Effect.Effect<Rendered, MailRenderError>
}>()("integrations/MailRenderer") {
  static readonly layer = Layer.sync(MailRenderer, () => rendererFrom(load))

  /** The renderer over another loader of the templates, for the tests: one that fails, as an import can. */
  static readonly layerFrom = (templates: () => Promise<Templates>) =>
    Layer.sync(MailRenderer, () => rendererFrom(templates))
}
