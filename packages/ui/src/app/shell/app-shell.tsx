import { useGoToKeys } from "./goto-keys";
// The agent log lays its rows onto the records once, at load, so every screen sees what Insyte did.
import "../stores/agent-log-store";
import { useRecentRecords } from "./panel-shortcuts";
import { ShellDialogs } from "./shell-dialogs";
import { Outlet } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ensurePersona } from "../hooks/use-persona";
import { BootScreen } from "../loading/boot-screen";
import { NavProgress, RouteArrival } from "../loading/stream";
import { RouteGate, ViewAsBanner } from "../access/route-gate";
import { MarketplaceModal } from "../marketplace/marketplace-modal";
import { useCommandPalette } from "../hooks/use-command-palette";
import { useApplyTheme } from "../hooks/use-theme";
import type { Persona } from "../lib/types/persona";
import { AskInsyteContext } from "./ask-insyte-context";
import { AskInsytePanel } from "./ask-insyte-panel";
import { CommandPalette } from "./command-palette";
import { Frame } from "./frame";
import { ManagePopup, type ManageTab } from "./manage-popup";
import { usePanel } from "./state";

/**
 * The design app's frame: `Frame` with everything the demo opens from it — Ask Insyte, the palette, Manage, the
 * marketplace, the shell's dialogs and the boot screen — and the work wrapped in the role gate and the arrival.
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
	const askCtx = useMemo(() => ({ open: () => setAskOpen(true) }), []);
	const main = useRef<HTMLElement>(null);
	useApplyTheme();

	function openManage(tab: ManageTab = "apps") {
		setManageInitialTab(tab);
		setManageOpen(true);
	}

	return (
		<AskInsyteContext.Provider value={askCtx}>
			<Frame
				persona={persona}
				main={main}
				above={
					<>
						<NavProgress />
						{persona === "admin" ? <ViewAsBanner /> : null}
					</>
				}
				onAskInsyte={() => setAskOpen(true)}
				onOpenPalette={() => palette.setOpen(true)}
				onOpenManage={openManage}
			>
				<RouteGate persona={persona}>
					<RouteArrival persona={persona} main={main}>
						{children ?? <Outlet />}
					</RouteArrival>
				</RouteGate>
			</Frame>
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
