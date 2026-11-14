import { canOpen, canRole, type Level, type Permission } from "@insyte/domain/Permissions";
import { PERSONA_CHROME, type PersonaChrome } from "../lib/persona-chrome";
import type { Persona } from "../lib/types/persona";
import { type ShellSource, useShellSource } from "./source";

/*
 * The frame's stores, through the host's `ShellSource`: each under the store's own name and with its selector, so a
 * part of the frame reads `usePanel((s) => s.density)` here as it read the store, and the console can host the same
 * parts without the demo stores.
 */

function slice<K extends keyof ShellSource>(key: K) {
	return function useSlice<T>(selector: (state: ShellSource[K]) => T): T {
		return selector(useShellSource()[key]);
	};
}

export const usePanel = slice("panel");
export const usePins = slice("pins");
export const useViews = slice("views");
export const useNotifications = slice("notifications");
export const useHome = slice("home");
export const useNavStore = slice("nav");
export const useSettingsDepth = slice("settingsDepth");
export const useAccess = slice("access");
export const useAutonomy = slice("autonomy");
export const useAsk = slice("ask");
export const useMarketplaceModalStore = slice("marketplaceModal");
export const useTeam = slice("team");
export const useWorkspace = slice("workspace");
export const useReturns = slice("returns");
export const useSheets = slice("sheets");
export const useCourses = slice("courses");
export const useChatStore = slice("chat");
export const useSettings = slice("settings");
export const useLoading = slice("loading");

export const usePersonaSelection = () => useShellSource().persona;
export const useActiveStore = () => useShellSource().activeStore;
export const useSeats = () => useShellSource().seats;
export const useCurrentRole = () => useShellSource().currentRole;
export const useWorkflows = () => useShellSource().workflows;
export const useSupplierOrders = () => useShellSource().supplierOrders;
export const useMarketplaceState = () => useShellSource().marketplace;
export const useNavPrefs = () => useShellSource().navPrefs;
export const useExtensions = () => useShellSource().extensions;
export const useHeardNotes = () => useShellSource().heardNotes;
export const useShellData = () => useShellSource().data;
export const useInboxPanel = () => useShellSource().inbox;
export const useAgentLogEntries = () => useShellSource().agentEntries;
export const useForwardingRows = () => useShellSource().queueRows;
export const useSyncLine = () => useShellSource().syncLine;
export const useOperator = () => useShellSource().operator;
export const useAutomationsPanel = () => useShellSource().automationsPanel;
export const useShellSlots = () => useShellSource().slots;
export const useWorkspaceName = () => useShellSource().workspaceName;
/** The persona's chrome, with the brand and menu the host knows in place of the design's. */
export const usePersonaChrome = (persona: Persona): PersonaChrome => {
	const partner = useShellSource().partner;
	const chrome = PERSONA_CHROME[persona];
	if (partner === undefined || chrome.partner === undefined) return chrome;
	return { ...chrome, partner: { ...chrome.partner, name: partner.name }, menu: partner.menu };
};
export const usePanelFor = () => useShellSource().panelFor;
export const useRecordSearch = (query: string) => useShellSource().useRecordSearch(query);
export const useCreateUnavailable = () => useShellSource().unavailable;

/** The workspace the chrome is in. */
export const useActiveWorkspace = () => {
	const { workspaces, activeWorkspaceId } = useShellSource().team;
	return workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0]!;
};

/** `can("orders", 2)`: whether the current role may. */
export function useCan() {
	const role = useCurrentRole();
	return (perm: Permission, arg?: Level | number) => canRole(role, perm, arg);
}

export function useCanOpen() {
	const role = useCurrentRole();
	return (path: string) => canOpen(role, path);
}
