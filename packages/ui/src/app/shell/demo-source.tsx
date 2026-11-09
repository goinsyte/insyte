import { type ReactNode, useMemo } from "react";
import {
	automations,
	conversations,
	currentUserByPersona,
	customers,
	extensions,
	lastActionById,
	members,
	navByPersona,
	presenceById,
	products,
} from "../../data-source";
import { recommendations, usesAi } from "../automations/library";
import { AutomationsPanelExtras } from "../automations/panel-extras";
import { useWorkflows } from "../automations/workflow-store";
import { useActiveStore } from "../hooks/use-active-store";
import { useMarketplaceState } from "../hooks/use-marketplace-state";
import { useNavPrefs } from "../hooks/use-nav-prefs";
import { usePersonaSelection } from "../hooks/use-persona";
import { useSupplierOrders } from "../hooks/use-supplier-orders";
import { useCustomers, useProducts } from "../hooks/use-operator-data";
import { useLoading } from "../loading/pace";
import { useQueueRows } from "../orders/forwarding-demo";
import { useAgentEntries } from "../stores/agent-log-store";
import { useInbox } from "../stores/inbox-store";
import { useHeardNotes } from "../notifications/heard";
import { useAccess, useCurrentRole } from "../stores/access-store";
import { useAsk } from "../stores/ask-store";
import { useAutonomy } from "../stores/autonomy-store";
import { useChatStore } from "../stores/chat-store";
import { useCourses } from "../stores/courses-store";
import { useHome } from "../stores/home-store";
import { useMarketplaceModalStore } from "../stores/marketplace-modal-store";
import { useNavStore } from "../stores/nav-store";
import { useNotifications } from "../stores/notifications-store";
import { usePanel } from "../stores/panel-store";
import { usePins } from "../stores/pins-store";
import { useReturns } from "../stores/returns-store";
import { useSettingsDepth } from "../stores/settings-depth-store";
import { useSettings } from "../stores/settings-store";
import { useSheets } from "../stores/sheets-store";
import { useSeats, useTeam } from "../stores/team-store";
import { useViews } from "../stores/views-store";
import { useWorkspace } from "../stores/workspace-store";
import { FirstRunHint } from "../team/first-run-hint";
import { InviteDialog } from "../team/invite-dialog";
import { WorkspaceSwitchOverlay } from "../team/workspace-switch";
import { AppDetailModal } from "../marketplace/app-detail-modal";
import { ConnectStoreDialog } from "../shops/connect-store-dialog";
import { CustomizeButton } from "./customize-panel";
import { panelForPath } from "../lib/app-shell-config";
import { type ShellSource, ShellSourceProvider } from "./source";

/** The frame in the design app: every part answered from the demo stores, as before the seam. */
/* The design app's palette filters the workspace's own records as you type. */
const noSearch = () => null;
/* Everything can be made in the design app. */
const everything = () => null;

export function DemoShellSource({ children }: { children: ReactNode }) {
	const store = useActiveStore();
	const persona = usePersonaSelection();
	const { data: operatorProducts } = useProducts();
	const { data: operatorCustomers } = useCustomers();
	const workflows = useWorkflows();
	const workspace = useWorkspace();
	const recommended = useMemo(
		() =>
			recommendations(
				{ orders: workspace.orders, products: operatorProducts, customers: operatorCustomers, chargebacks: workspace.chargebacks, tickets: workspace.tickets },
				workflows,
			).length,
		[workspace.orders, operatorProducts, operatorCustomers, workspace.chargebacks, workspace.tickets, workflows],
	);
	const source: ShellSource = {
		panel: usePanel(),
		pins: usePins(),
		views: useViews(),
		notifications: useNotifications(),
		home: useHome(),
		nav: useNavStore(),
		settingsDepth: useSettingsDepth(),
		access: useAccess(),
		autonomy: useAutonomy(),
		ask: useAsk(),
		marketplaceModal: useMarketplaceModalStore(),
		team: useTeam(),
		workspace,
		returns: useReturns(),
		sheets: useSheets(),
		courses: useCourses(),
		chat: useChatStore(),
		settings: useSettings(),
		loading: useLoading(),
		persona,
		activeStore: { active: store.active, stores: store.stores, setActive: store.setActive },
		seats: useSeats(),
		currentRole: useCurrentRole(),
		workflows,
		supplierOrders: useSupplierOrders(),
		marketplace: useMarketplaceState(),
		navPrefs: useNavPrefs(),
		extensions,
		heardNotes: useHeardNotes(persona.persona),
		inbox: useInbox(),
		agentEntries: useAgentEntries(),
		queueRows: useQueueRows(Math.floor(Date.now() / 60_000) * 60_000),
		slots: { Customize: CustomizeButton, AppDetail: AppDetailModal, WorkspaceSwitch: WorkspaceSwitchOverlay, FirstRunHint, Invite: InviteDialog, ConnectStore: ConnectStoreDialog },
		workspaceName: workspace.account.workspace,
		panelFor: panelForPath,
		automationsPanel: { recommended, ai: Object.values(workflows).filter(usesAi).length, Extras: AutomationsPanelExtras },
		operator: { products: operatorProducts, customers: operatorCustomers },
		data: { currentUserByPersona, navByPersona, members, presenceById, lastActionById, customers, products, automations, conversations },
		useRecordSearch: noSearch,
		unavailable: everything,
	};
	return <ShellSourceProvider value={source}>{children}</ShellSourceProvider>;
}
