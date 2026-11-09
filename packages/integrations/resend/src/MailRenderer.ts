import { render, toPlainText } from "@react-email/render"
import { Context, Effect, Layer, Schema } from "effect"
import { type Email, type EmailKind, type EmailProps, EMAILS } from "./emails/index.ts"

/*
 * A mail of one kind, rendered: the subject, the HTML React Email makes of its template, and a plain-text alternative
 * read off that same HTML, so the two never say different things. The renderer is a service with a layer, like every
 * integration here; the pure `renderEmail` under it is what the previews and the tests call.
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

/*
 * Outlook for Windows renders with Word, which ignores a font stack whose first face is not installed and falls back
 * to Times New Roman. A conditional stylesheet only it reads names a face it has.
 */
const OUTLOOK =
  "<!--[if mso]><style>body,table,td,p,a,h1,h2,span{font-family:\"Segoe UI\",Arial,sans-serif !important}</style><![endif]-->"

/*
 * The plain text: headings as written (html-to-text upper-cases them by default), a link as "label: address", and the
 * HTML's own skips (the drawn mark, the button's written-out fallback) left out.
 */
const TEXT = {
  selectors: [
    { selector: "h1", options: { uppercase: false, leadingLineBreaks: 1, trailingLineBreaks: 2 } },
    { selector: "h2", options: { uppercase: false, leadingLineBreaks: 2, trailingLineBreaks: 1 } },
    { selector: "a", format: "labelledLink" }
  ],
  formatters: {
    labelledLink: (
      elem: { readonly attribs?: Record<string, string>; readonly children: unknown },
      walk: (nodes: unknown, builder: unknown) => void,
      builder: { readonly addInline: (text: string) => void }
    ) => {
      walk(elem.children, builder)
      const href = elem.attribs?.["href"]
      if (href !== undefined && href !== "") builder.addInline(`: ${href}`)
    }
  }
}

export const renderEmail = async <K extends EmailKind>(kind: K, props: EmailProps<K>): Promise<Rendered> => {
  const entry = EMAILS[kind] as unknown as Email<EmailProps<K>>
  const html = (await render(entry.Template(props))).replace("</head>", `${OUTLOOK}</head>`)
  return { subject: entry.subject(props), html, text: toPlainText(html, TEXT).trim() }
}

export class MailRenderer extends Context.Service<MailRenderer, {
  readonly render: <K extends EmailKind>(kind: K, props: EmailProps<K>) => Effect.Effect<Rendered, MailRenderError>
}>()("integrations/MailRenderer") {
  static readonly layer = Layer.succeed(
    MailRenderer,
    MailRenderer.of({
      render: (kind, props) =>
        Effect.tryPromise({
          try: () => renderEmail(kind, props),
          catch: (error) => new MailRenderError({ kind, reason: String(error) })
        }).pipe(Effect.withSpan("MailRenderer.render", { attributes: { kind } }))
    })
  )
}
