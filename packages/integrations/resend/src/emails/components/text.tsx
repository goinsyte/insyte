import type { ReactNode } from "react"
import { Button, Heading, Link, Section, Text } from "react-email"
import { corner, font, light, type } from "../theme.ts"

/*
 * The letter's parts. Weight carries hierarchy, not size (DESIGN.md, Typography): one title at 600, body at 400,
 * labels at 500. Sizes are the tokens' steps; nothing between them.
 */

const reset = { margin: "0", fontFamily: font.sans } as const

/** The one heading of a mail, like a dialog's title. */
export const Title = (props: { readonly children: ReactNode }) => (
  <Heading
    as="h1"
    className="x-ink"
    style={{ ...reset, ...type("xl"), fontWeight: 600, color: light.ink, margin: "0 0 12px" }}
  >
    {props.children}
  </Heading>
)

/** What happened and what the mail asks, in one or two sentences. */
export const Lead = (props: { readonly children: ReactNode }) => (
  <Text className="x-ink" style={{ ...reset, ...type("md"), color: light.ink }}>
    {props.children}
  </Text>
)

/** Body text. `tight` sits it under a subtitle it belongs to. */
export const Paragraph = (props: { readonly children: ReactNode; readonly tight?: boolean }) => (
  <Text
    className="x-ink"
    style={{ ...reset, ...type("md"), color: light.ink, margin: props.tight === true ? "6px 0 0" : "16px 0 0" }}
  >
    {props.children}
  </Text>
)

/** The quiet footnote under the action: how long a link lasts, what to do if the mail was not expected. */
export const Note = (props: { readonly children: ReactNode }) => (
  <Text className="x-ink-3" style={{ ...reset, ...type("sm"), color: light["ink-3"], margin: "24px 0 0" }}>
    {props.children}
  </Text>
)

/**
 * Label and value, in a `mist` well: an invitation's workspace and role, a sign-in's device and place. Read as a data
 * table in the plain text, so each row stays a row.
 */
export const Facts = (props: { readonly rows: ReadonlyArray<readonly [string, ReactNode]> }) => (
  <Section
    className="x-well"
    style={{ backgroundColor: light.mist, borderRadius: corner.control, margin: "20px 0 0", padding: "6px 16px" }}
  >
    <table
      role="presentation"
      data-text-format="dataTable"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ borderCollapse: "collapse" }}
    >
      <tbody>
        {props.rows.map(([label, value]) => (
          <tr key={label}>
            <td
              className="x-ink-3"
              style={{
                ...type("base"),
                fontFamily: font.sans,
                color: light["ink-3"],
                padding: "8px 16px 8px 0",
                verticalAlign: "top",
                whiteSpace: "nowrap",
                width: "1%"
              }}
            >
              {label}
            </td>
            <td
              className="x-ink"
              style={{
                ...type("base"),
                fontFamily: font.sans,
                fontWeight: 500,
                color: light.ink,
                padding: "8px 0",
                verticalAlign: "top"
              }}
            >
              {value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </Section>
)

/** Someone's own words, as they wrote them: an invitation's note. Escaped by React like every other value. */
export const Quote = (props: { readonly children: ReactNode }) => (
  <Section
    className="x-well"
    style={{ backgroundColor: light.mist, borderRadius: corner.control, margin: "20px 0 0", padding: "12px 16px" }}
  >
    <Text className="x-ink" style={{ ...reset, ...type("md"), color: light.ink }}>
      “{props.children}”
    </Text>
  </Section>
)

/** A list of short lines: what Insyte already tried, what changed. */
export const Items = (props: { readonly items: ReadonlyArray<ReactNode> }) => (
  <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ margin: "16px 0 0" }}>
    <tbody>
      {props.items.map((item, i) => (
        <tr key={i}>
          <td
            className="x-ink-3"
            style={{ ...type("md"), fontFamily: font.sans, color: light["ink-3"], padding: "2px 10px 2px 0" }}
          >
            –
          </td>
          <td className="x-ink" style={{ ...type("md"), fontFamily: font.sans, color: light.ink, padding: "2px 0" }}>
            {item}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

/**
 * The one action a mail asks for: an `abyss` button carrying `mesh-ink`, the console's primary, and under it the same
 * link written out for a client that does not show buttons. The plain text gets the link once, after the label.
 */
export const Action = (props: { readonly href: string; readonly children: string; readonly fallback?: boolean }) => (
  <>
    <Section style={{ margin: "28px 0 0" }}>
      <Button
        href={props.href}
        style={{
          backgroundColor: light.abyss,
          color: light["mesh-ink"],
          fontFamily: font.sans,
          ...type("base"),
          fontWeight: 500,
          borderRadius: corner.control,
          padding: "10px 20px",
          textDecoration: "none"
        }}
      >
        {props.children}
      </Button>
    </Section>
    {props.fallback === false ? null : (
      <Text
        data-skip-in-text="true"
        className="x-ink-3"
        style={{ ...reset, ...type("xs"), color: light["ink-3"], margin: "16px 0 0", wordBreak: "break-all" }}
      >
        Werkt de knop niet? Open dan deze link:{" "}
        <Link href={props.href} className="x-ink-3" style={{ color: light["ink-3"], textDecoration: "underline" }}>
          {props.href}
        </Link>
      </Text>
    )}
  </>
)

/**
 * A status as a word on its tint (the Word With The Colour Rule): amber for something that needs a look. The mails use
 * no other signal: red and green stay in the product.
 */
export const Status = (props: { readonly children: string }) => (
  <Text style={{ ...reset, margin: "0 0 12px" }}>
    <span
      className="x-amber"
      style={{
        display: "inline-block",
        ...type("xs"),
        fontWeight: 500,
        fontFamily: font.sans,
        color: light["signal-amber"],
        backgroundColor: light["signal-amber-bg"],
        borderRadius: corner.pill,
        padding: "2px 8px"
      }}
    >
      {props.children}
    </span>
  </Text>
)

/** "Binnenkort", for what is designed and not built: the console's chip, `arc-tint` with `arc-ink`. */
export const Soon = () => (
  <span
    className="x-tint"
    style={{
      display: "inline-block",
      ...type("xs"),
      fontWeight: 500,
      fontFamily: font.sans,
      color: light["arc-ink"],
      backgroundColor: light["arc-tint"],
      borderRadius: corner.chip,
      padding: "1px 6px",
      marginLeft: "2px",
      verticalAlign: "1px"
    }}
  >
    Binnenkort
  </span>
)

/** A heading inside the letter, under the title: a group in a digest, a section of an update. */
export const Subtitle = (props: { readonly children: ReactNode }) => (
  <Heading
    as="h2"
    className="x-ink"
    style={{ ...reset, ...type("lg"), fontWeight: 500, color: light.ink, margin: "28px 0 0" }}
  >
    {props.children}
  </Heading>
)

/**
 * Numbered steps, where the order is the information (a first week's three things). The number is the console's
 * quiet ink in tabular figures, the step's name at 500, one sentence under it.
 */
export const Steps = (
  props: { readonly steps: ReadonlyArray<{ readonly title: string; readonly body: ReactNode }> }
) => (
  <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ margin: "8px 0 0" }}>
    <tbody>
      {props.steps.map((step, i) => (
        <tr key={step.title}>
          <td
            className="x-ink-3"
            style={{
              ...type("md"),
              fontFamily: font.sans,
              fontWeight: 500,
              fontVariantNumeric: "tabular-nums",
              color: light["ink-3"],
              padding: "16px 14px 0 0",
              verticalAlign: "top",
              width: "1%"
            }}
          >
            {i + 1}
          </td>
          <td style={{ padding: "16px 0 0", verticalAlign: "top" }}>
            <Text className="x-ink" style={{ ...reset, ...type("md"), fontWeight: 500, color: light.ink }}>
              {step.title}
            </Text>
            <Text className="x-ink-2" style={{ ...reset, ...type("base"), color: light["ink-2"], margin: "2px 0 0" }}>
              {step.body}
            </Text>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

/**
 * Rows a person acts on, each a line with its detail and a link: the digest's notes, the supplier's late orders. Banded
 * by space, not ruled (the console's lists are not ruled between rows either).
 */
export const Rows = (
  props: {
    readonly rows: ReadonlyArray<
      { readonly title: string; readonly detail?: string | undefined; readonly href: string }
    >
  }
) => (
  <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0} style={{ margin: "4px 0 0" }}>
    <tbody>
      {props.rows.map((row) => (
        <tr key={`${row.title}|${row.href}`}>
          <td style={{ padding: "12px 0 0", verticalAlign: "top" }}>
            <Text style={{ ...reset, ...type("md") }}>
              <Link href={row.href} className="x-link" style={{ color: light["arc-ink"], fontWeight: 500 }}>
                {row.title}
              </Link>
            </Text>
            {row.detail === undefined ? null : (
              <Text
                className="x-ink-3"
                style={{ ...reset, ...type("base"), color: light["ink-3"], margin: "2px 0 0" }}
              >
                {row.detail}
              </Text>
            )}
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)
