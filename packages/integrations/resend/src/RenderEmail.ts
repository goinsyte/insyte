import { render, toPlainText } from "@react-email/render"
import { type Email, type EmailKind, type EmailProps, EMAILS } from "./emails/index.ts"
import type { Rendered } from "./MailRenderer.ts"

/*
 * The templates and React Email under `MailRenderer`: what the previews and the tests call. The layer imports this
 * module on the first mail an isolate renders, not when the Worker starts (ADR-0041 §3).
 */

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
