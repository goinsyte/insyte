import { useGoToKeys } from "./goto-keys";
// The agent log lays its rows onto the records once, at load, so every screen sees what Insyte did.
import "../stores/agent-log-store";
import { usePanel } from "../stores/panel-store";
import { useRecentRecords } from "./panel-shortcuts";
import { ShellDialogs } from "./shell-dialogs";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ensurePersona } from "../hooks/use-persona";
import { BootScreen } from "../loading/boot-screen";
import { NavProgress, RouteArrival } from "../loading/stream";
import { RouteGate, ViewAsBanner } from "../access/route-gate";
import { MarketplaceModal } from "../marketplace/marketplace-modal";
import { useCommandPalette } from "../hooks/use-command-palette";
import { useApplyTheme } from "../hooks/use-theme";
import { panelForPath } from "../lib/app-shell-config";
import { cn } from "../lib/utils";
import type { Persona } from "../lib/types/persona";
import { AskInsyteContext } from "./ask-insyte-context";
import { AskInsytePanel } from "./ask-insyte-panel";
import { CommandPalette } from "./command-palette";
import { GlobalTopbar } from "./global-topbar";
import { IconRail } from "./icon-rail";
import { ManagePopup, type ManageTab } from "./manage-popup";
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
 */
export function AppShell({
	persona,
	children,
}: {
	persona: Persona;
	children?: ReactNode;
}) {
	useEffect(() => ensurePersona(persona), [persona]);
	const palette = useCommandPalette();
	useRecentRecords();
	useGoToKeys(persona === "admin");
	// The density the panel's Customize dialog chose, as one attribute the stylesheet reads.
	const density = usePanel((s) => s.density);
	useEffect(() => {
		document.documentElement.dataset.density = density;
	}, [density]);
	const [askOpen, setAskOpen] = useState(false);
	const [manageOpen, setManageOpen] = useState(false);
	const [manageInitialTab, setManageInitialTab] = useState<ManageTab>("apps");
	const [subPanelCollapsed, setSubPanelCollapsed] = useState(false);
	const [navOpen, setNavOpen] = useState(false);
	const askCtx = useMemo(() => ({ open: () => setAskOpen(true) }), []);
	const main = useRef<HTMLElement>(null);
	useApplyTheme();

	const pathname = useRouterState({ select: (s) => s.location.pathname });
	const hasSubPanel = panelForPath(pathname) !== null;
	const showSubPanel = hasSubPanel && !subPanelCollapsed;

	// Arriving somewhere is what the drawer was opened for, so arriving closes it.
	useEffect(() => setNavOpen(false), [pathname]);

	function openManage(tab: ManageTab = "apps") {
		setManageInitialTab(tab);
		setManageOpen(true);
	}

	return (
		<AskInsyteContext.Provider value={askCtx}>
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
					<IconRail persona={persona} onOpenManage={() => openManage("apps")} />
					{showSubPanel ? <SubPanel /> : null}
				</div>
				<div className="relative flex min-w-0 flex-1 flex-col">
					<NavProgress />
					{persona === "admin" ? <ViewAsBanner /> : null}
					<GlobalTopbar
						persona={persona}
						onAskInsyte={() => setAskOpen(true)}
						onOpenPalette={() => palette.setOpen(true)}
						onOpenManage={() => openManage("people")}
						subPanelAvailable={hasSubPanel}
						subPanelCollapsed={subPanelCollapsed}
						onToggleSubPanel={() => setSubPanelCollapsed((v) => !v)}
						onOpenNav={() => setNavOpen(true)}
					/>
					{/* `relative` so absolutely placed things inside a page (an sr-only label, say) scroll with it
					    rather than resolving against <body> and giving the document a second scrollbar. */}
					<main ref={main} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-paper">
						<RouteGate persona={persona}>
							<RouteArrival persona={persona} main={main}>
								{children ?? <Outlet />}
							</RouteArrival>
						</RouteGate>
					</main>
				</div>
			</div>
			<CommandPalette
				open={palette.open}
				onOpenChange={palette.setOpen}
				persona={persona}
				onAskInsyte={() => setAskOpen(true)}
			/>
			<AskInsytePanel open={askOpen} onOpenChange={setAskOpen} />
			<ShellDialogs />
			<ManagePopup
				open={manageOpen}
				onOpenChange={setManageOpen}
				initialTab={manageInitialTab}
			/>
			<MarketplaceModal />
			{/* Last, so it covers everything above, the dialogs included, for the moment it is up. */}
			<BootScreen persona={persona} />
		</AskInsyteContext.Provider>
	);
}
