import { useRouterState } from "@tanstack/react-router";
import { type ReactNode, type RefObject, useEffect, useState } from "react";
import { panelForPath } from "../lib/app-shell-config";
import type { Persona } from "../lib/types/persona";
import { cn } from "../lib/utils";
import { GlobalTopbar } from "./global-topbar";
import { IconRail } from "./icon-rail";
import { SubPanel } from "./sub-panel";

/**
 * The frame: three adjacent fields and a work area.
 *
 * Nothing floats and nothing is rounded. The rail, the area panel and the top bar are all `mist`,
 * the work surface beneath is `paper` or a plate, and where two of them meet THAT is the boundary —
 * which is why there is no gap, no ring and no shadow in this file. The shell used to be three
 * rounded tiles on a `glacier` gap, each with a hairline ring: four edges to say what one change of
 * surface says.
 *
 * The top bar moved inside the work column rather than spanning the window. It belongs to the thing
 * being worked on — it carries that store, that search, that count — and a bar that spans the rail
 * claims to be chrome for the whole app, which it never was.
 *
 * Below `md` the two navigation fields leave the row and become one drawer over the work. Three
 * fixed columns — 52 + 224 + a 436px plate — need 712px before the work itself gets a pixel, so at
 * phone width the shell did not narrow, it overflowed: the queue was squeezed to nothing and the
 * document ran 857px wide inside a 390px window. The drawer is the same two fields, unchanged and
 * in the same order; only where they sit moves. It closes on navigation, because on a phone the
 * reason it was opened is gone the moment you arrive.
 *
 * Its parts read the host's `ShellSource`; what wraps the work and which overlays open from the bar are the host's
 * (`AppShell` in the design app, the console's own frame route).
 */
export function Frame({
	persona,
	main,
	above,
	onAskInsyte,
	onOpenPalette,
	onOpenManage,
	children,
}: {
	persona: Persona;
	main: RefObject<HTMLElement | null>;
	/** Over the top bar: the navigation line, a role being looked through. */
	above?: ReactNode;
	onAskInsyte: () => void;
	onOpenPalette: () => void;
	onOpenManage: (tab: "apps" | "people") => void;
	children: ReactNode;
}) {
	const [subPanelCollapsed, setSubPanelCollapsed] = useState(false);
	const [navOpen, setNavOpen] = useState(false);
	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const hasSubPanel = panelForPath(pathname) !== null;
	const showSubPanel = hasSubPanel && !subPanelCollapsed;

	// Arriving somewhere is what the drawer was opened for, so arriving closes it.
	useEffect(() => setNavOpen(false), [pathname]);

	return (
		<div className="flex h-svh bg-glacier">
			{/* The scrim exists only while the drawer is out, and only below `md`. */}
			{navOpen ? (
				<button
					type="button"
					aria-label="Navigatie sluiten"
					onClick={() => setNavOpen(false)}
					className="fixed inset-0 z-40 bg-ink/35 md:hidden"
				/>
			) : null}
			<div
				className={cn(
					"fixed inset-y-0 left-0 z-50 flex transition-transform duration-[220ms] ease-out md:static md:z-auto md:translate-x-0 md:transition-none",
					navOpen ? "translate-x-0" : "-translate-x-full",
				)}
			>
				<IconRail persona={persona} onOpenManage={() => onOpenManage("apps")} />
				{showSubPanel ? <SubPanel /> : null}
			</div>
			<div className="relative flex min-w-0 flex-1 flex-col">
				{above}
				<GlobalTopbar
					persona={persona}
					onAskInsyte={onAskInsyte}
					onOpenPalette={onOpenPalette}
					onOpenManage={() => onOpenManage("people")}
					subPanelAvailable={hasSubPanel}
					subPanelCollapsed={subPanelCollapsed}
					onToggleSubPanel={() => setSubPanelCollapsed((v) => !v)}
					onOpenNav={() => setNavOpen(true)}
				/>
				{/* `relative` so absolutely placed things inside a page (an sr-only label, say) scroll with it
				    rather than resolving against <body> and giving the document a second scrollbar. */}
				<main ref={main} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-paper">
					{children}
				</main>
			</div>
		</div>
	);
}
