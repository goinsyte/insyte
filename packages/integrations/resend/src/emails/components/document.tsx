import type { ReactNode } from "react"
import { Body, Container, Head, Html, Preview } from "react-email"
import { dark, font, light, WIDTH } from "../theme.ts"

/*
 * The document every mail shares: Dutch, both colour schemes declared, the preview line, the glacier page and the
 * centred column. Layout is tables (React Email's `Container` and `Section`), styles are inline, and the one stylesheet
 * in the head carries only what cannot be inline: the phone width and the night palette, for the clients that read
 * them. A client that reads neither still gets the daylight letter, which is complete on its own.
 */

/** Class → the night value of each property the class sets. Gmail drops the block; Apple Mail and Outlook for Mac use it. */
const NIGHT: ReadonlyArray<readonly [string, string]> = [
  // React Email paints the page on the body's first cell, not on the body: reach both.
  [".x-page,.x-page > table > tbody > tr > td", `background-color:${dark.glacier} !important`],
  [".x-card", `background-color:${dark.paper} !important`],
  [".x-well", `background-color:${dark.mist} !important`],
  [".x-ink", `color:${dark.ink} !important`],
  [".x-ink-2", `color:${dark["ink-2"]} !important`],
  [".x-ink-3", `color:${dark["ink-3"]} !important`],
  [".x-link", `color:${dark["arc-ink"]} !important`],
  [".x-rule", `border-color:${dark.hairline} !important`],
  [".x-amber", `background-color:${dark["signal-amber-bg"]} !important;color:${dark["signal-amber"]} !important`],
  [".x-tint", `background-color:${dark["arc-tint"]} !important;color:${dark["arc-ink"]} !important`]
]

const STYLES = [
  ":root{color-scheme:light dark;supported-color-schemes:light dark}",
  "a{text-decoration:none}",
  "@media (max-width:600px){.x-gutter > tbody > tr > td{padding:16px 8px !important}"
  + ".x-card > tbody > tr > td{padding:28px 20px !important}.x-plate{padding:32px 20px 0 !important}"
  + ".x-block{padding-left:20px !important}}",
  `@media (prefers-color-scheme:dark){${NIGHT.map(([cls, rule]) => `${cls}{${rule}}`).join("")}}`,
  // Outlook.com's dark mode marks the document instead of answering the media query.
  NIGHT.map(([cls, rule]) => `${cls.split(",").map((one) => `[data-ogsc] ${one}`).join(",")}{${rule}}`).join("")
].join("")

export const Document = (props: { readonly preview: string; readonly children: ReactNode }) => (
  <Html lang="nl" dir="ltr">
    <Head>
      <meta name="color-scheme" content="light dark" />
      <meta name="supported-color-schemes" content="light dark" />
      <meta name="format-detection" content="telephone=no, date=no, address=no, email=no" />
      <style>{STYLES}</style>
    </Head>
    <Preview>{props.preview}</Preview>
    <Body
      lang="nl"
      className="x-page"
      style={{ margin: "0", padding: "0", backgroundColor: light.glacier, fontFamily: font.sans, color: light.ink }}
    >
      <Container
        className="x-gutter"
        style={{ width: "100%", maxWidth: `${WIDTH}px`, margin: "0 auto", padding: "32px 16px" }}
      >
        {props.children}
      </Container>
    </Body>
  </Html>
)
