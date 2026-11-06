// Active-store facade over the workspace: the org's Shopify stores and which one the console is
// looking at. `active` falls back to the first store when the selection is gone (store removed).
import { useStoreScope } from "../stores/access-store";
import { useWorkspace, type WorkspaceStore } from "../stores/workspace-store";

export type ActiveStore = {
	id: string;
	name: string;
	domain: string;
	connected: boolean;
	currency: string;
	status: WorkspaceStore["status"];
};

export function useActiveStore() {
	const stores = useWorkspace((s) => s.stores);
	const activeId = useWorkspace((s) => s.activeStoreId);
	const setActive = useWorkspace((s) => s.setActiveStore);

	// A role limited to some stores only switches between those.
	const scope = useStoreScope();
	const mapped: ActiveStore[] = stores.filter((s) => !scope || scope.includes(s.id)).map((s) => ({
		id: s.id,
		name: s.name,
		domain: s.domain,
		currency: s.currency,
		connected: s.status === "connected",
		status: s.status,
	}));
	const active = mapped.find((s) => s.id === activeId) ?? mapped[0];

	return { stores: mapped, active, setActive, loading: false };
}
