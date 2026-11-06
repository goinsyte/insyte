import {
	Bell,
	ChevronRight,
	Clock,
	CreditCard,
	FileText,
	Globe,
	type IconComponent,
	Key,
	LayoutGrid,
	Lock,
	MonitorSmartphone,
	Receipt,
	Shield,
	Store,
	User,
	Users,
	Webhook,
} from "../../icons";
import { Link } from "@tanstack/react-router";
import { cn } from "../lib/utils";

/* A section names its own glyph when the page does not; most read it from their title. */
const SECTION_ICON: Record<string, IconComponent> = {
	Werkruimte: Store,
	Apps: LayoutGrid,
	Sleutels: Key,
	Webhooks: Webhook,
	Abonnement: Receipt,
	Betaalmethode: CreditCard,
	Facturen: FileText,
	Rollen: Users,
	"Taal en notatie": Globe,
	Authenticatie: Lock,
	"Actieve sessies": MonitorSmartphone,
	Auditlog: Clock,
	Teamleden: Users,
	Winkels: Store,
	Koppelingen: Bell,
	Profiel: User,
	Beveiliging: Shield,
};

/**
 * One settings section, drawn the way the dashboard draws the day: on the page, not in a box.
 *
 * It was a `panel` — a paper tile with an inset hairline — and a settings page is five of them
 * stacked, each holding a framed table or a framed list, so the eye met three edges before it met a
 * field. The section is now a heading and what is under it; the space between two sections is what
 * separates them, which is the one boundary this system draws everywhere else too.
 */
export function SettingCard({
	id,
	title,
	subtitle,
	action,
	icon,
	children,
	className,
}: {
	id?: string;
	title: string;
	icon?: IconComponent;
	subtitle?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	const Icon = icon ?? SECTION_ICON[title];
	return (
		<section id={id} className={cn("flex scroll-mt-6 flex-col gap-3", className)}>
			<header className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="flex min-w-0 items-start gap-2.5">
					{Icon ? <Icon className="mt-[3px] size-4 shrink-0 text-ink-3" strokeWidth={1.75} /> : null}
					<div className="flex min-w-0 flex-col gap-0.5">
						<h2 className="font-medium text-md text-ink">{title}</h2>
						{subtitle ? <p className="max-w-[64ch] text-sm text-ink-2">{subtitle}</p> : null}
					</div>
				</div>
				{action}
			</header>
			{children}
		</section>
	);
}

/** A section's one action — "Invite", "Connect a store" — in the brand's primary, beside its heading. */
export function SectionAction({
	icon,
	children,
	onClick,
	disabled,
}: {
	icon?: React.ReactNode;
	children: React.ReactNode;
	onClick: () => void;
	/** Set by a permission gate (`components/access/gate.tsx`) when the role may not. */
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-abyss px-2.5 font-medium text-xs text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2 disabled:pointer-events-none disabled:opacity-45"
		>
			{icon}
			{children}
		</button>
	);
}

/**
 * A list of things in settings — stores, integrations, keys — as one white card on the grey sheet,
 * its rows divided by a hairline, which is a data boundary and the one thing a line may do here.
 */
export function BandedList({ children }: { children: React.ReactNode }) {
	return (
		<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
			{children}
		</ul>
	);
}

/** The tones a settings row's leading tile takes: neutral, the brand's, or one that warns. */
const TILE = {
	neutral: "bg-mist text-ink-2",
	arc: "bg-arc-tint text-arc-ink",
	green: "bg-signal-green-bg text-signal-green",
	danger: "bg-abyss text-mesh-ink",
} as const;

/**
 * A row that goes somewhere: a tile with its glyph, a title, one line under it, and a chevron. Rows
 * group into a `BandedList`. It is a link when it navigates and a button when it acts.
 */
export function SettingsItem({
	icon: Icon,
	title,
	detail,
	tone = "neutral",
	to,
	onClick,
	trailing,
}: {
	icon: IconComponent;
	title: string;
	detail?: string;
	tone?: keyof typeof TILE;
	to?: string;
	onClick?: () => void;
	trailing?: React.ReactNode;
}) {
	const body = (
		<>
			<span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TILE[tone])}>
				<Icon className="size-4" strokeWidth={1.75} />
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium text-base text-ink">{title}</span>
				{detail ? <span className="truncate text-sm text-ink-3">{detail}</span> : null}
			</span>
			{trailing}
			<ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover/item:translate-x-0.5" strokeWidth={1.75} />
		</>
	);
	const cls = "group/item flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-ink/3";
	return (
		<li>
			{to ? (
				<Link to={to} className={cls}>
					{body}
				</Link>
			) : (
				<button type="button" onClick={onClick} className={cls}>
					{body}
				</button>
			)}
		</li>
	);
}

export function BandedRow({
	leading,
	title,
	detail,
	trailing,
	className,
}: {
	leading?: React.ReactNode;
	title: React.ReactNode;
	detail?: React.ReactNode;
	trailing?: React.ReactNode;
	className?: string;
}) {
	return (
		<li className={cn("group flex min-h-14 items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-ink/3", className)}>
			{leading}
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium text-base text-ink">{title}</span>
				{detail ? <span className="truncate text-sm text-ink-2">{detail}</span> : null}
			</div>
			{trailing ? <div className="flex shrink-0 items-center gap-2">{trailing}</div> : null}
		</li>
	);
}

export function StatusPill({
	tone,
	label,
}: {
	tone: "success" | "warning" | "danger" | "info" | "neutral";
	label: string;
}) {
	const map = {
		success: { bg: "var(--signal-green-bg)", fg: "var(--signal-green)" },
		warning: { bg: "var(--signal-amber-bg)", fg: "var(--signal-amber)" },
		danger: { bg: "var(--signal-red-bg)", fg: "var(--signal-red)" },
		info: { bg: "var(--arc-tint)", fg: "var(--arc-ink)" },
		neutral: { bg: "var(--mist)", fg: "var(--ink-3)" },
	}[tone];
	return (
		<span
			className="inline-flex h-5 items-center justify-center rounded-full px-2 font-medium text-xs leading-none"
			style={{ backgroundColor: map.bg, color: map.fg }}
		>
			{label}
		</span>
	);
}
