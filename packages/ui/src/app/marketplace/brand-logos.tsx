import { cn } from "../lib/utils";

/**
 * The logo of a service Insyte connects to — the software an operator already uses, recognised at a
 * glance, which a monogram never is.
 *
 * Files live in `public/logos/` with their provenance beside them (`BRON.md`). This used to hotlink
 * svgl.app's CDN for three of twelve apps and paint the other nine as an invented colour with an
 * initial on it: a third-party request on every marketplace open, and nine "logos" no company drew.
 *
 * Every mark sits on the same light tile with the inset hairline, so a full-bleed app icon (Stripe,
 * Klarna, a favicon) and a bare mark (Shopify, Zapier) line up in one row. The tile is `mesh-ink` and
 * not `paper`, because it is a pinned field: a vendor draws its mark for a white ground, and on the
 * night theme's dark paper Anthropic's black mark disappeared and PayPal's navy went to mud. A
 * service without a file falls back to its initials on the same tile.
 */

type Logo = {
	readonly file: string;
	/** The file is an app icon that fills its square; a bare mark gets padding instead. */
	readonly full?: boolean;
	/** The brand's own colour, for the marketplace hero that is drenched in it. */
	readonly color: string;
};

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
	slack: { file: "slack.svg", color: "#4A154B" },
	microsoft: { file: "microsoft.svg", color: "#0078D4" },
	"microsoft-teams": { file: "microsoft-teams.svg", color: "#5059C9" },
	"google-sheets": { file: "google-sheets.svg", color: "#34A853" },
	exact: { file: "exact.png", full: true, color: "#E1001A" },
	sendcloud: { file: "sendcloud.png", full: true, color: "#1F5BFF" },
};

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
	"bank-transfer": "",
};

/** "ext_klaviyo", "Yotpo Reviews", "stripe" → the key of its file, if there is one. */
const keyOf = (brand: string): string => {
	const bare = brand
		.toLowerCase()
		.replace(/^ext_/, "")
		.trim()
		.replace(/\s+/g, "-");
	return ALIAS[bare] ?? bare;
};

export const hasLogo = (brand: string): boolean => keyOf(brand) in LOGOS;

/** The brand's colour for surfaces drenched in it; ink when the service has no logo here. */
export function brandFor(brand: string, _name?: string): { color: string } {
	return { color: LOGOS[keyOf(brand)]?.color ?? "var(--abyss)" };
}

const initials = (name: string): string =>
	name
		.split(/\s+/)
		.map((word) => word.charAt(0))
		.join("")
		.slice(0, 2)
		.toUpperCase();

export function BrandLogo({
	brand,
	extId,
	name,
	size = 32,
	className,
}: {
	/** The service: an extension id, a key, or the name the screen prints. */
	brand?: string;
	/** The marketplace's spelling of `brand`, kept so its call sites read as before. */
	extId?: string;
	name: string;
	size?: number;
	className?: string;
}) {
	const logo = LOGOS[keyOf(brand ?? extId ?? name)];
	// A tile's corner follows its size — the chip radius below 24px, the control radius up to 40px,
	// the tile radius above it — so a 16px logo in a table cell does not look like a pill.
	const radius = size < 24 ? "rounded-sm" : size <= 40 ? "rounded-md" : "rounded-lg";

	return (
		<span
			role="img"
			aria-label={`${name} logo`}
			title={name}
			className={cn(
				"relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden bg-mesh-ink hairline",
				radius,
				className,
			)}
			style={{ width: size, height: size }}
		>
			{logo ? (
				<img
					src={`/logos/${logo.file}`}
					alt=""
					width={size}
					height={size}
					loading="lazy"
					decoding="async"
					draggable={false}
					className={cn(
						"object-contain",
						logo.full === true ? "size-full" : "size-[64%]",
					)}
				/>
			) : (
				<span
					className="font-medium text-person-ink leading-none"
					style={{ fontSize: Math.max(9, Math.round(size * 0.38)) }}
				>
					{initials(name)}
				</span>
			)}
		</span>
	);
}
