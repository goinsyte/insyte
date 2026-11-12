import { type ComponentType, createContext, type ReactNode, useContext } from "react";
import type { DataSource } from "../../data-source";
import type { WorkflowState } from "../automations/node-types";
import type { ActiveStore } from "../hooks/use-active-store";
import type { usePersonaSelection as PersonaSelectionHook } from "../hooks/use-persona";
import type { SupplierOrderRow } from "../hooks/use-supplier-orders";
import type { LoadingState } from "../loading/pace";
import type { AgentLogEntry } from "../lib/agent-log";
import type { Note } from "../lib/notifications";
import type { SubPanelConfig } from "../lib/types/sub-panel";
import type { Customer, Product } from "../lib/types/domain";
import type { QueueRow } from "../lib/queue-row";
import type { InboxState } from "../stores/inbox-store";
import type { Extension } from "../lib/types/domain";
import type { AccessState, useCurrentRole as CurrentRoleHook } from "../stores/access-store";
import type { AskState } from "../stores/ask-store";
import type { AutonomyState } from "../stores/autonomy-store";
import type { ChatState } from "../stores/chat-store";
import type { CoursesState } from "../stores/courses-store";
import type { HomeState } from "../stores/home-store";
import type { MarketplaceModalActions } from "../stores/marketplace-modal-store";
import type { NavActions, NavState } from "../stores/nav-store";
import type { NotificationsState } from "../stores/notifications-store";
import type { PanelState } from "../stores/panel-store";
import type { PinsState } from "../stores/pins-store";
import type { ReturnsState } from "../stores/returns-store";
import type { SettingsDepthState } from "../stores/settings-depth-store";
import type { SettingsState } from "../stores/settings-store";
import type { SheetsState } from "../stores/sheets-store";
import type { TeamState, useSeats as SeatsHook } from "../stores/team-store";
import type { ViewsState } from "../stores/views-store";
import type { WorkspaceState } from "../stores/workspace-store";
import type { useMarketplaceState as MarketplaceStateHook } from "../hooks/use-marketplace-state";
import type { useNavPrefs as NavPrefsHook } from "../hooks/use-nav-prefs";
import type { CreateKind } from "../stores/create-intent";

/**
 * What the frame reads and does, from whoever hosts it (as `team/source.tsx` for Team): the design app answers from
 * its demo stores (`DemoShellSource`), the console from the server (`Shell.frame`, preferences, notifications,
 * presence). Each part is the slice of a store the frame reads, under the store's own names, so the frame's parts
 * read it through `shell/state.ts` exactly as they read the stores. Records of areas a host does not have yet are
 * empty there, and the frame shows what it shows for an empty workspace.
 */
export interface ShellSource {
	panel: PanelState;
	pins: PinsState;
	views: ViewsState;
	notifications: Pick<NotificationsState, "notes" | "prefs" | "setRead" | "wake">;
	home: Pick<HomeState, "widgets" | "engine" | "add" | "remove" | "setEngine">;
	nav: NavState & NavActions;
	settingsDepth: Pick<SettingsDepthState, "keys" | "gotoOn">;
	access: Pick<AccessState, "viewAs" | "setViewAs">;
	autonomy: Pick<AutonomyState, "budget">;
	ask: Pick<AskState, "start">;
	marketplaceModal: Pick<MarketplaceModalActions, "openModal">;
	team: Pick<
		TeamState,
		| "workspaces"
		| "activeWorkspaceId"
		| "workspaceInvites"
		| "acceptWorkspaceInvite"
		| "declineWorkspaceInvite"
		| "restoreWorkspaceInvite"
		| "leaveWorkspace"
		| "switchWorkspace"
		| "setCreatingWorkspace"
	>;
	workspace: Pick<WorkspaceState, "tickets" | "orders" | "chargebacks" | "queue" | "members" | "integrations" | "createdCustomers">;
	returns: Pick<ReturnsState, "records">;
	sheets: Pick<SheetsState, "sheets" | "folders">;
	courses: Pick<CoursesState, "courses" | "questions">;
	chat: Pick<ChatState, "pinned" | "created">;
	settings: Pick<SettingsState, "roles">;
	loading: Pick<LoadingState, "pace" | "setPace">;
	/* What the stores' own hooks work out, worked out by the host. */
	persona: ReturnType<typeof PersonaSelectionHook>;
	activeStore: { active: ActiveStore | undefined; stores: ReadonlyArray<ActiveStore>; setActive: (id: string) => void };
	seats: ReturnType<typeof SeatsHook>;
	currentRole: ReturnType<typeof CurrentRoleHook>;
	workflows: Record<string, WorkflowState>;
	supplierOrders: ReadonlyArray<SupplierOrderRow>;
	marketplace: ReturnType<typeof MarketplaceStateHook>;
	navPrefs: ReturnType<typeof NavPrefsHook>;
	extensions: ReadonlyArray<Extension>;
	/** The persona's notifications, minus what their settings keep out of the app. */
	heardNotes: ReadonlyArray<Note>;
	inbox: Pick<InboxState, "threads">;
	/** What Insyte did, newest first (the agent log's rows). */
	agentEntries: ReadonlyArray<AgentLogEntry>;
	/** The forwarding queue's rows as of this minute. */
	queueRows: ReadonlyArray<QueueRow>;
	/**
	 * Parts of the frame that belong to features a host may not have yet: Customize (with Start's widgets), an
	 * installed app's detail, connecting a store. `null` leaves them out.
	 */
	slots: {
		Customize: ComponentType | null;
		AppDetail: ComponentType<{ extension: Extension | null; open: boolean; onOpenChange: (open: boolean) => void }> | null;
		WorkspaceSwitch: ComponentType | null;
		/** Inviting a colleague from the store menu (Team's own dialog, over the host's Team source). */
		Invite: ComponentType<{ open: boolean; onOpenChange: (open: boolean) => void }> | null;
		/** The welcome after joining or making a workspace. */
		FirstRunHint: ComponentType | null;
		ConnectStore: ComponentType<{
			open: boolean;
			onOpenChange: (open: boolean) => void;
			initialDomain?: string | undefined;
			onConnected: (store: { id: string; name: string }) => void;
		}> | null;
	};
	/**
	 * The palette's records for what is typed, as the host searches them (the console's `Search.records`). A hook,
	 * called on every render of the palette. `null` where the palette searches the workspace's own lists (the design
	 * app's).
	 */
	useRecordSearch: (query: string) => RecordHits | null;
	/** Why the host cannot make a kind of record yet, or `null` where it can: the + menu and the palette grey it out. */
	unavailable: (kind: CreateKind) => string | null;
	/** The area panel for a path, with the counts the host stands behind (`panelForPath`, or the server's figures). */
	panelFor: (pathname: string) => SubPanelConfig | null;
	/** The name of the workspace the console is in. */
	workspaceName: string;
	/** Automations' panel: flows Insyte recommends, flows that use AI, and what the panel shows under its list. */
	automationsPanel: { recommended: number; ai: number; Extras: ComponentType | null };
	/** The operator's products and customers as their lists show them (with this session's own). */
	operator: { products: ReadonlyArray<Product>; customers: ReadonlyArray<Customer> };
	/** The workspace's records and people as the frame reads them directly: names, presence, palette and panel lists. */
	data: Pick<
		DataSource,
		| "currentUserByPersona"
		| "navByPersona"
		| "members"
		| "presenceById"
		| "lastActionById"
		| "customers"
		| "products"
		| "automations"
		| "conversations"
	>;
}

/** What the palette lists under Bestellingen, Klanten, Tickets, Inbox and Chats. */
export type RecordHits = {
	orders: ReadonlyArray<{ id: string; number: string; customer: string }>;
	customers: ReadonlyArray<{ id: string; name: string; email: string }>;
	tickets: ReadonlyArray<{ id: string; number: string; title: string }>;
	/** Mail threads: the subject and who wrote in. */
	threads: ReadonlyArray<{ id: string; subject: string; from: string }>;
	/** Chat messages: the words around the match, where they were said (and by whom), and the address that opens them. */
	messages: ReadonlyArray<{ id: string; text: string; where: string; href: string }>;
};

const ShellSourceContext = createContext<ShellSource | null>(null);

export function ShellSourceProvider({ value, children }: { value: ShellSource; children: ReactNode }) {
	return <ShellSourceContext.Provider value={value}>{children}</ShellSourceContext.Provider>;
}

export function useShellSource(): ShellSource {
	const source = useContext(ShellSourceContext);
	if (source === null) throw new Error("The frame needs a ShellSourceProvider around it.");
	return source;
}
