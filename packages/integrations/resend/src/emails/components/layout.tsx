import type { ReactNode } from "react"
import { Heading, Link, Section, Text } from "react-email"
import { corner, font, light, mix, type } from "../theme.ts"
import { Document } from "./document.tsx"
import { Lockup } from "./mark.tsx"

/*
 * Two layouts, one world. A `Letter` is the operator-grade mail (an account, a team, the platform): the lockup on the
 * glacier page, one paper letter, a quiet footer. A `Campaign` is Insyte speaking for itself: the same page, with a
 * plate on top, `abyss` ground, chalk ink and a title block at the foot, where a technical drawing names itself
 * (DESIGN.md, Plate). Separation is a surface change in both: no borders round a card, no shadows.
 */

export interface Footer {
  /** Why this address gets this mail, in one sentence. */
  readonly reason: string
  /** Who signs it under the reason; Insyte, unless a store sends it (`ShopLetter`). */
  readonly signature?: string | undefined
  /** Links under it: "Meldingen instellen", "Afmelden". */
  readonly links?: ReadonlyArray<{ readonly label: string; readonly href: string }> | undefined
}

const FooterBlock = (props: Footer) => (
  <Section style={{ padding: "24px 4px 0" }}>
    <Text className="x-ink-3" style={{ margin: "0", fontFamily: font.sans, ...type("xs"), color: light["ink-3"] }}>
      {props.reason}
    </Text>
    <Text
      className="x-ink-3"
      style={{ margin: "8px 0 0", fontFamily: font.sans, ...type("xs"), color: light["ink-3"] }}
    >
      {props.signature ?? "Insyte"}
      {(props.links ?? []).map((link) => (
        <span key={link.href}>
          {" · "}
          <Link href={link.href} className="x-ink-3" style={{ color: light["ink-3"], textDecoration: "underline" }}>
            {link.label}
          </Link>
        </span>
      ))}
    </Text>
  </Section>
)

const Head = () => (
  <Section data-skip-in-text="true" style={{ padding: "0 4px 20px" }}>
    <Lockup />
  </Section>
)

const Card = (props: { readonly children: ReactNode }) => (
  <Section
    className="x-card"
    style={{ backgroundColor: light.paper, borderRadius: corner.tile, padding: "32px" }}
  >
    {props.children}
  </Section>
)

export const Letter = (props: { readonly preview: string; readonly footer: Footer; readonly children: ReactNode }) => (
  <Document preview={props.preview}>
    <Head />
    <Card>{props.children}</Card>
    <FooterBlock {...props.footer} />
  </Document>
)

/**
 * A store's letter to its shopper (M9.3): the same page and letter, headed with the store's name in the display face
 * instead of Insyte's lockup, because the mail is sent in the store's name; the footer signs it with the store and says
 * Insyte carried it.
 */
export const ShopLetter = (
  props: { readonly shop: string; readonly preview: string; readonly footer: Footer; readonly children: ReactNode }
) => (
  <Document preview={props.preview}>
    <Section style={{ padding: "0 4px 20px" }}>
      <Text
        className="x-ink"
        style={{
          margin: "0",
          fontFamily: font.display,
          fontStretch: "88%",
          ...type("lg"),
          fontWeight: 600,
          color: light.ink
        }}
      >
        {props.shop}
      </Text>
    </Section>
    <Card>{props.children}</Card>
    <FooterBlock {...props.footer} signature={props.footer.signature ?? `${props.shop} · verstuurd met Insyte`} />
  </Document>
)

export interface Plate {
  /** The plate's heading, in the display face. */
  readonly title: string
  readonly lead?: string | undefined
  /** The title block at the foot: what the drawing is, left to right. */
  readonly block: ReadonlyArray<string>
}

/**
 * The drafting grid, 32px, in chalk at a few percent on `abyss` (flattened, as mail clients drop alpha in places); a
 * client without gradients shows the flat ground, which is the plate without its paper.
 */
const LINE = mix("mesh-ink", "abyss", 0.09)
const GRID = `linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px)`

const PlateBlock = (props: Plate) => (
  <Section
    style={{
      backgroundColor: light.abyss,
      backgroundImage: GRID,
      backgroundSize: "32px 32px",
      backgroundPosition: "-1px -1px",
      borderRadius: corner["tile-hero"],
      overflow: "hidden"
    }}
  >
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} border={0}>
      <tbody>
        <tr>
          <td className="x-plate" style={{ padding: "40px 32px 0" }}>
            <Heading
              as="h1"
              style={{
                margin: "0",
                fontFamily: font.display,
                fontStretch: "88%",
                ...type("3xl"),
                fontWeight: 600,
                color: light["mesh-ink"]
              }}
            >
              {props.title}
            </Heading>
            {props.lead === undefined ? null : (
              <Text
                style={{ margin: "14px 0 0", fontFamily: font.sans, ...type("md"), color: light["mesh-ink-2"] }}
              >
                {props.lead}
              </Text>
            )}
          </td>
        </tr>
        <tr>
          <td style={{ padding: "36px 0 0" }}>
            <table
              role="presentation"
              data-skip-in-text="true"
              width="100%"
              cellPadding={0}
              cellSpacing={0}
              border={0}
              style={{ borderCollapse: "collapse", borderTop: `1px dashed ${light["mesh-ink-3"]}` }}
            >
              <tbody>
                <tr>
                  {props.block.map((cell, i) => (
                    <td
                      key={cell}
                      className={i === 0 ? "x-block" : undefined}
                      style={{
                        padding: i === 0 ? "12px 16px 12px 32px" : "12px 16px",
                        borderLeft: i === 0 ? "none" : `1px dashed ${light["mesh-ink-3"]}`,
                        fontFamily: font.sans,
                        ...type("xs"),
                        color: light["mesh-ink-3"],
                        whiteSpace: "nowrap"
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
  </Section>
)

export const Campaign = (
  props: { readonly preview: string; readonly plate: Plate; readonly footer: Footer; readonly children: ReactNode }
) => (
  <Document preview={props.preview}>
    <Head />
    <PlateBlock {...props.plate} />
    <Section data-skip-in-text="true" style={{ height: "8px", lineHeight: "8px", fontSize: "0" }}>&nbsp;</Section>
    <Card>{props.children}</Card>
    <FooterBlock {...props.footer} />
  </Document>
)
