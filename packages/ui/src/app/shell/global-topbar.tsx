import { cn } from "../lib/utils";
import { Link } from "@tanstack/react-router";
import {
	LayoutGrid,
	Menu,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Sparkles,
} from "../../icons";
import type { Persona } from "../lib/types/persona";
import { isDrawn } from "../lib/queue-state";
import { NewMenu } from "./new-menu";
import { NotificationsInbox } from "./notifications-inbox";
import { StoreSelector } from "./store-selector";
import { SyncStatus } from "./sync-status";
import { TopbarFriends } from "./topbar-friends";
import { useHasPage, useMarketplaceModalStore, usePersonaChrome, useWorkspace } from "./state";

/**
 * The top bar: 48px of `mist`, inside the work column rather than across the window.
 *
 * It carries what the work is about — which store, what you are looking for, how many plates are
 * drawn and waiting — and nothing about the application. The brand lockup left with it: the mark
 * sits at the head of the rail now, which is where it was already being drawn a second time.
 *
 * Every control here is the same filled 30px well at the same radius, because they are the same kind
 * of thing. The one exception is the proposals count, which is `abyss` — the plate colour — because
 * it is the only control on this bar that leads somewhere a decision gets made.
 */
export function GlobalTopbar({
	persona = "admin",
	onAskInsyte,
	onOpenPalette,
	onOpenManage,
	subPanelAvailable,
	subPanelCollapsed,
	onToggleSubPanel,
	onOpenNav,
}: {
	/** A supplier or affiliate gets the brand they work with in place of the workspace's controls. */
	persona?: Persona;
	onAskInsyte: () => void;
	onOpenPalette: () => void;
	onOpenManage: () => void;
	subPanelAvailable: boolean;
	subPanelCollapsed: boolean;
	onToggleSubPanel: () => void;
	onOpenNav: () => void;
}) {
	const openMarketplace = useMarketplaceModalStore((s) => s.openModal);
	const drawn = useWorkspace((s) => s.queue.filter(isDrawn).length);
	const chrome = usePersonaChrome(persona);
	const admin = persona === "admin";
	// Vraag Insyte is drawn where the host has it.
	const ask = useHasPage()("/ask");

	return (
		<header className="flex h-12 shrink-0 items-center gap-2.5 bg-mist px-3 sm:px-4">
			{/*
			 * Below `md` the rail and the area panel are a drawer, so this is the only way back to
			 * them and it is always present. From `md` up they are in the row again and this button
			 * has nothing to open, so it goes.
			 */}
			<button
				type="button"
				onClick={onOpenNav}
				aria-label="Navigatie openen"
				className="flex size-[30px] shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink md:hidden"
			>
				<Menu className="size-4" strokeWidth={1.75} />
			</button>

			{subPanelAvailable ? (
				<button
					type="button"
					onClick={onToggleSubPanel}
					aria-label={
						subPanelCollapsed ? "Paneel uitklappen" : "Paneel inklappen"
					}
					title={subPanelCollapsed ? "Paneel uitklappen" : "Paneel inklappen"}
					className="hidden size-[30px] shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink md:flex"
				>
					{subPanelCollapsed ? (
						<PanelLeftOpen className="size-4" strokeWidth={1.75} />
					) : (
						<PanelLeftClose className="size-4" strokeWidth={1.75} />
					)}
				</button>
			) : null}

			{admin ? <StoreSelector variant="compact" /> : chrome.partner ? <PartnerChip {...chrome.partner} /> : null}

			<SearchTrigger onOpenPalette={onOpenPalette} placeholder={chrome.search} />

			{admin ? (
				<div className="hidden items-center gap-2 lg:flex">
					<TopbarFriends onManage={onOpenManage} />
				</div>
			) : null}

			{admin ? null : (
				<div className="ml-auto flex shrink-0 items-center gap-1.5">
					<NotificationsInbox />
				</div>
			)}
			{admin ? (
				<>

			{/* The stores' sync, right before the proposals, which it leaves where they were. */}
			<div className="ml-auto flex min-w-0 items-center gap-2.5">
			<SyncStatus />

			{/* At phone width the count is the whole message; the noun returns with the room for it. */}
			<Link
				to="/dashboard"
				aria-label={drawn === 0 ? "Geen voorstellen" : `${drawn} ${drawn === 1 ? "voorstel" : "voorstellen"} klaar`}
				className={cn(
					"flex h-[30px] shrink-0 items-center gap-1 rounded-md px-2.5 font-medium text-base tabular-nums leading-none transition-colors sm:px-3.5",
					// Nothing drawn is not a call to action, so it does not wear the primary fill.
					drawn === 0 ? "text-ink-3 hover:bg-ink/6 hover:text-ink-2" : "bg-abyss text-mesh-ink hover:bg-abyss-2",
				)}
			>
				{drawn === 0 ? (
					<span className="hidden sm:inline">Geen voorstellen</span>
				) : (
					<>
						{drawn}
						<span className="hidden sm:inline">{drawn === 1 ? "voorstel" : "voorstellen"} klaar</span>
					</>
				)}
			</Link>

			</div>

			<div className="flex shrink-0 items-center gap-1.5">
				{ask ? (
					<button
						type="button"
						onClick={onAskInsyte}
						className="flex h-[30px] items-center gap-1.5 rounded-md bg-arc-tint px-2.5 font-medium text-base text-arc-ink leading-none transition-colors hover:bg-arc-tint/70"
					>
						<Sparkles className="size-3.5" strokeWidth={1.75} />
						<span className="hidden sm:inline">Vraag Insyte</span>
					</button>
				) : null}

				<NotificationsInbox />

				<span className="hidden sm:flex">
					<TopbarIcon
						label="Marketplace"
						onClick={openMarketplace}
						icon={<LayoutGrid className="size-4" strokeWidth={1.75} />}
					/>
				</span>

				<NewMenu />
			</div>
				</>
			) : null}
		</header>
	);
}

/** The brand a supplier or affiliate works with, named in the bar and not switchable. */
function PartnerChip({ name, relation }: { name: string; relation: string }) {
	const initials = name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0])
		.join("")
		.toUpperCase();
	return (
		<span className="flex h-[30px] min-w-0 shrink items-center gap-2 rounded-md pr-1">
			<span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md bg-abyss font-medium text-2xs text-mesh-ink">
				{initials}
			</span>
			<span className="flex min-w-0 items-baseline gap-1.5 truncate">
				<span className="hidden text-ink-3 text-sm sm:inline">{relation}</span>
				<span className="truncate font-medium text-base text-ink">{name}</span>
			</span>
		</span>
	);
}

function TopbarIcon({
	label,
	onClick,
	icon,
}: {
	label: string;
	onClick: () => void;
	icon: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			title={label}
			className="flex size-[30px] items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink"
		>
			{icon}
		</button>
	);
}

/**
 * The search well. A real `<button>`, not a read-only `<input>` that blurs itself on focus — it opens
 * a palette, so it says so to the keyboard and to a screen reader instead of pretending to be a
 * field. The shortcut is set in the sans with tabular figures; the two `tabular-nums` keycaps that used
 * to sit here were the clearest case of mono worn as a costume in the whole console.
 */
/**
 * The search well, and below `sm` just the glyph.
 *
 * `min-w-0 flex-1` let it shrink all the way down, so at 390px it rendered a field advertising one
 * character of its own placeholder — a magnifier and a lone "S". A field that shows a letter of the
 * word it meant to show reads as breakage, not as a compact control. Narrow, it becomes the same
 * 30px well every other icon in this bar is, and opening it still opens the full palette.
 */
function SearchTrigger({ onOpenPalette, placeholder }: { onOpenPalette: () => void; placeholder: string }) {
	return (
		<button
			type="button"
			onClick={onOpenPalette}
			className="field flex size-[30px] shrink-0 items-center justify-center rounded-md transition-colors hover:field-hover sm:h-[30px] sm:w-auto sm:min-w-0 sm:max-w-[320px] sm:flex-1 sm:justify-start sm:gap-2 sm:px-2.5 sm:text-left"
			aria-label={placeholder.replace("…", "")}
			aria-keyshortcuts="Meta+Slash"
		>
			<Search className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
			<span className="hidden min-w-0 flex-1 truncate text-base text-ink-3 sm:inline">
				{placeholder}
			</span>
			<span
				className="hidden shrink-0 text-sm text-ink-3 tabular-nums sm:inline"
				aria-hidden
			>
				⌘ /
			</span>
		</button>
	);
}
