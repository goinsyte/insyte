import { BrandLogo } from "../marketplace/brand-logos";
import { InsyteMark } from "../../brand/mark";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../../components/tooltip";
import { Link, useRouterState } from "@tanstack/react-router";
import { MoreHorizontal } from "../../icons";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { AppDetailModal } from "../marketplace/app-detail-modal";
import { AvatarMenu } from "./avatar-menu";
import { useMarketplaceState } from "../hooks/use-marketplace-state";
import { useNavPrefs } from "../hooks/use-nav-prefs";
import { railItemsForPersona } from "../lib/app-shell-config";
import { extensions as allExtensions } from "../../data-source";
import type { Extension } from "../lib/types/domain";
import type { Persona } from "../lib/types/persona";
import { cn } from "../lib/utils";
import { PERSONA_CHROME } from "../lib/persona-chrome";
import { useCanOpen } from "../stores/access-store";

/**
 * The rail: 52px of `abyss`, the mark at its head, the avatar at its foot.
 *
 * It spent one revision as `mist` — the quietest field in the window — on the argument that `abyss`
 * is the plate colour, the ground a proposal is DRAWN on, and should not be spent on furniture. The
 * argument was sound and the result was wrong: a near-white rail beside a near-white panel left the
 * window with no anchor, and the product's own colour never appeared until something was selected.
 * The rail is the one piece of chrome present on every screen, which makes it the right place for
 * the blue. `abyss` on the plate still means "being decided"; a window edge is not a plate.
 *
 * Separation from the area panel beside it is the surface change at their meeting, so the rail draws
 * no edge of its own. The one rule in here is the hairline above the Manage tile, which marks a group
 * boundary — the single thing a line is allowed to do.
 *
 * Active is a filled `arc` tile, and it is ONE tile: `layoutId` moves the same element between icons
 * rather than fading one out and another in, so navigating reads as the marker travelling to where
 * you went. That is the rail's authored motion moment, and `useReducedMotion` turns the travel off
 * without taking the marker away.
 */
export function IconRail({
	persona,
	onOpenManage,
}: {
	persona: Persona;
	onOpenManage: () => void;
}) {
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const { installedIds, markOpened } = useMarketplaceState();
	const { isHidden, sortedRail, isAddonPinned } = useNavPrefs();
	const allItems = railItemsForPersona(persona);
	// A destination the role cannot open is not on the rail at all: the rail is where you can go.
	// Inside an area the panel keeps such links, dimmed, so it still says what is there.
	const canOpen = useCanOpen();

	const orderedKeys = sortedRail(allItems.map((i) => i.to));
	const itemByKey = new Map(allItems.map((i) => [i.to, i] as const));
	const visibleItems = orderedKeys
		.map((k) => itemByKey.get(k))
		.filter(
			(item): item is (typeof allItems)[number] =>
				item !== undefined && !isHidden(item.to) && (persona !== "admin" || canOpen(item.to)),
		);

	const admin = persona === "admin";
	// Apps the brand installed are the brand's: a supplier or affiliate never sees them.
	const installedApps = allExtensions
		.filter(() => admin)
		.filter((e) => installedIds.includes(e.id))
		.filter((e) => isAddonPinned(e.id));
	const [openApp, setOpenApp] = useState<Extension | null>(null);

	return (
		<TooltipProvider delayDuration={200} skipDelayDuration={100}>
			<nav className="flex min-h-0 w-[52px] shrink-0 flex-col items-center gap-[3px] bg-abyss py-2.5">
				<Link
					to={PERSONA_CHROME[persona].home}
					aria-label="Insyte start"
					className="mb-3.5 flex size-[26px] shrink-0 items-center justify-center rounded-md outline-none"
				>
					{/* The mark is the one thing in the rail that is not a destination among destinations,
					    so it is the one thing that answers a hover with a tilt rather than a wash. */}
					<motion.span
						className="flex"
						whileHover={{ rotate: -5, scale: 1.08 }}
						whileTap={{ scale: 0.94 }}
						transition={{ type: "spring", stiffness: 420, damping: 22 }}
					>
						<InsyteMark size={26} tone="white" />
					</motion.span>
				</Link>

				<div className="flex min-h-0 flex-1 flex-col items-center gap-[3px] overflow-y-auto">
					{visibleItems.map((item) => {
						const Icon = item.icon;
						const active = item.matchPrefix
							? pathname === item.to ||
								pathname.startsWith(`${item.matchPrefix}/`)
							: pathname === item.to;
						return (
							<RailItem
								key={item.to}
								to={item.to}
								active={active}
								icon={<Icon className="size-[17px]" strokeWidth={1.75} />}
								label={item.label}
							/>
						);
					})}

					{installedApps.length > 0 ? (
						<>
							<div className="my-2 h-px w-6 shrink-0 bg-mesh-ink/15" aria-hidden />
							{installedApps.map((app) => {
								return (
									<Tooltip key={app.id}>
										<TooltipTrigger asChild>
											<button
												type="button"
												onClick={() => {
													markOpened(app.id);
													setOpenApp(app);
												}}
												className="flex h-[30px] w-[34px] shrink-0 items-center justify-center rounded-md transition-colors hover:bg-mesh-ink/12 active:scale-90"
												aria-label={app.name}
											>
												{/* The app's own mark on a paper tile: on the rail, a pinned app is the vendor
												    the operator recognises, not another glyph in the house's line. */}
												<BrandLogo extId={app.id} name={app.name} size={22} />
											</button>
										</TooltipTrigger>
										<TooltipContent side="right" sideOffset={8}>
											{app.name}
										</TooltipContent>
									</Tooltip>
								);
							})}
						</>
					) : null}
				</div>

				<div className="flex shrink-0 flex-col items-center gap-[3px] pt-2">
					<div className="mb-1 h-px w-6 bg-mesh-ink/15" aria-hidden />
					{admin ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								onClick={onOpenManage}
								className="flex h-[30px] w-[34px] items-center justify-center rounded-md text-mesh-ink/60 transition hover:bg-mesh-ink/12 hover:text-mesh-ink active:scale-90"
								aria-label="Beheren"
							>
								<MoreHorizontal className="size-[17px]" strokeWidth={1.75} />
							</button>
						</TooltipTrigger>
						<TooltipContent side="right" sideOffset={8}>
							Beheren
						</TooltipContent>
					</Tooltip>
					) : null}
					<div className="pt-1">
						<AvatarMenu side="right" />
					</div>
				</div>
			</nav>
			<AppDetailModal extension={openApp} open={openApp !== null} onOpenChange={(o) => !o && setOpenApp(null)} />
		</TooltipProvider>
	);
}

/**
 * One tile. Active is a flood to `arc` with the icon in `mesh-ink` — the same thing a selected queue
 * row does, so "this is the one" is said once in the product and said the same way.
 *
 * The fill is a sibling element rather than a background on the link, because a background cannot
 * travel: `layoutId` only animates between two mounted elements, and only one tile mounts it.
 */
function RailItem({
	to,
	active,
	icon,
	label,
}: {
	to: string;
	active: boolean;
	icon: React.ReactNode;
	label: string;
}) {
	const still = useReducedMotion();
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Link
					to={to}
					className={cn(
						"relative flex h-[30px] w-[34px] shrink-0 items-center justify-center rounded-md transition-colors",
						active
							? "text-mesh-ink"
							: "text-mesh-ink/60 hover:bg-mesh-ink/12 hover:text-mesh-ink",
					)}
					aria-label={label}
					aria-current={active ? "page" : undefined}
				>
					{active ? (
						<motion.span
							layoutId="rail-active"
							className="absolute inset-0 rounded-md bg-arc"
							transition={
								still
									? { duration: 0 }
									: { type: "spring", stiffness: 460, damping: 36, mass: 0.7 }
							}
							aria-hidden
						/>
					) : null}
					{/* The icon settles into the tile that just arrived under it: the marker travels, the
					    glyph acknowledges. Both stop together under `prefers-reduced-motion`. */}
					<motion.span
						className="relative flex"
						animate={still ? undefined : { scale: active ? [0.86, 1] : 1 }}
						whileTap={still ? undefined : { scale: 0.9 }}
						transition={{ type: "spring", stiffness: 520, damping: 26, mass: 0.5 }}
					>
						{icon}
					</motion.span>
				</Link>
			</TooltipTrigger>
			<TooltipContent side="right" sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}
