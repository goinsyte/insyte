import { cx } from "./cx.ts"

/**
 * The logo of a service Insyte connects to: the software an operator already uses, recognised at a
 * glance, which a monogram never is. Ported from the original product's `BrandLogo`
 * (`packages/ui/src/app/marketplace/brand-logos.tsx`); the files are `public/logos/`, with their
 * provenance in `BRON.md`.
 *
 * Every mark sits on the same light tile with an inset hairline, so a full-bleed app icon (Stripe,
 * Klarna) and a bare mark (Shopify, Zapier) line up in one row. The tile is `mark-ground`, a pinned
 * light field, because a vendor draws its mark for a white ground; the logo is the brand's and is
 * never recoloured to the theme. A service without a file falls back to its initials on the same
 * tile. `bare` drops the tile, for a logo inside a button or a line of text.
 */

type Logo = {
  readonly file: string
  /** The file is an app icon that fills its square; a bare mark gets padding instead. */
  readonly full?: boolean
  /** The brand's own colour, for a surface drenched in it. */
  readonly color: string
}

const LOGOS: Readonly<Record<string, Logo>> = {
  shopify: { file: "shopify.svg", color: "#95BF47" },
  stripe: { file: "stripe.svg", full: true, color: "#635BFF" },
  klarna: { file: "klarna.svg", full: true, color: "#FFB3C7" },
  paypal: { file: "paypal.svg", color: "#003087" },
  wise: { file: "wise.svg", full: true, color: "#163300" },
  gmail: { file: "gmail.svg", color: "#EA4335" },
  outlook: { file: "outlook.png", full: true, color: "#0078D4" },
  anthropic: { file: "anthropic.svg", color: "#191919" },
  meta: { file: "meta.svg", color: "#0467DF" },
  resend: { file: "resend.svg", color: "#000000" },
  whatsapp: { file: "whatsapp.svg", color: "#25D366" },
  dhl: { file: "dhl.svg", full: true, color: "#FFCC00" },
  postnl: { file: "postnl.png", full: true, color: "#ED7000" },
  dpd: { file: "dpd.svg", color: "#DC0032" },
  ups: { file: "ups.svg", color: "#150400" },
  instagram: { file: "instagram.svg", color: "#FF0069" },
  klaviyo: { file: "klaviyo.png", full: true, color: "#232426" },
  recharge: { file: "recharge.png", full: true, color: "#3901F1" },
  yotpo: { file: "yotpo.png", full: true, color: "#0042E4" },
  shipbob: { file: "shipbob.png", full: true, color: "#175CFF" },
  gorgias: { file: "gorgias.png", full: true, color: "#161616" },
  signifyd: { file: "signifyd.png", full: true, color: "#0A2540" },
  aftership: { file: "aftership.svg", color: "#FF6B2B" },
  "loop-returns": { file: "loop-returns.png", full: true, color: "#1D1D1F" },
  okendo: { file: "okendo.png", full: true, color: "#1A1A1A" },
  postscript: { file: "postscript.png", full: true, color: "#5A31F4" },
  zapier: { file: "zapier.svg", color: "#FF4F00" },
  "google-ads": { file: "google-ads.svg", color: "#4285F4" },
  google: { file: "google.svg", color: "#4285F4" },
  slack: { file: "slack.svg", color: "#4A154B" },
  microsoft: { file: "microsoft.svg", color: "#0078D4" },
  "microsoft-teams": { file: "microsoft-teams.svg", color: "#5059C9" },
  "google-sheets": { file: "google-sheets.svg", color: "#34A853" },
  exact: { file: "exact.png", full: true, color: "#E1001A" },
  sendcloud: { file: "sendcloud.png", full: true, color: "#1F5BFF" }
}

/** The names the screens use for the same service. */
const ALIAS: Readonly<Record<string, string>> = {
  googleads: "google-ads",
  loop: "loop-returns",
  "yotpo-reviews": "yotpo",
  "klarna-disputes": "klarna",
  "microsoft-outlook": "outlook",
  claude: "anthropic",
  "microsoft-365": "microsoft",
  "exact-online": "exact",
  teams: "microsoft-teams",
  "google-workspace": "google",
  "post-nl": "postnl",
  "bank-transfer": "",
  bankoverschrijving: ""
}

/** "ext_klaviyo", "Yotpo Reviews", "stripe" → the key of its file, if there is one. */
const keyOf = (brand: string): string => {
  const bare = brand.toLowerCase().replace(/^ext_/, "").trim().replace(/\s+/g, "-")
  return ALIAS[bare] ?? bare
}

/** Whether there is a logo for the service, so a screen can fall back to its own glyph instead. */
export const hasLogo = (brand: string): boolean => keyOf(brand) in LOGOS

const initials = (name: string): string =>
  name.split(/\s+/).map((word) => word.charAt(0)).join("").slice(0, 2).toUpperCase()

export function ServiceLogo({ service, name, size = 28, bare = false, className }: {
  /** The service: a key ("shopify"), an extension id ("ext_klaviyo") or the name a screen prints. */
  readonly service: string
  /** What to call it (the image's label, the initials); the service itself when left out. */
  readonly name?: string
  readonly size?: number
  /**
   * Without the tile: in a button, a chip or a line of text. Decorative then, because the text beside
   * it names the service; a bare logo standing alone is named by its wrapper.
   */
  readonly bare?: boolean
  readonly className?: string
}) {
  const logo = LOGOS[keyOf(service)]
  if (bare) {
    return logo === undefined
      ? null
      : (
        <img
          src={`/logos/${logo.file}`}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          className={cx("shrink-0 object-contain", logo.full === true && "rounded-xs", className)}
          style={{ width: size, height: size }}
        />
      )
  }
  const label = name ?? service
  // A tile's corner follows its size: the chip radius below 24px, the control radius up to 40px.
  const radius = size < 24 ? "rounded-xs" : size <= 40 ? "rounded-sm" : "rounded-md"
  return (
    <span
      role="img"
      aria-label={`${label} logo`}
      title={label}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-mark-ground ring-1 ring-line ring-inset select-none",
        radius,
        className
      )}
      style={{ width: size, height: size }}
    >
      {logo !== undefined
        ? (
          <img
            src={`/logos/${logo.file}`}
            alt=""
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cx("object-contain", logo.full === true ? "size-full" : "size-[64%]")}
          />
        )
        : (
          <span
            className="leading-none font-medium text-ink-2"
            style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}
          >
            {initials(label)}
          </span>
        )}
    </span>
  )
}
