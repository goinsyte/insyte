import type { ReactNode } from "react";
import { useWorkspace } from "../stores/workspace-store";
import { ConnectStoreDialog } from "./connect-store-dialog";
import { type StoresSource, StoresSourceProvider } from "./source";

/** Winkels' source in the design app: the demo workspace's stores, as the screen read them before it had a source. */
export function DemoStoresSource({ children }: { children: ReactNode }) {
	const stores = useWorkspace((s) => s.stores);
	const activeId = useWorkspace((s) => s.activeStoreId);
	const setActive = useWorkspace((s) => s.setActiveStore);
	const disconnectStore = useWorkspace((s) => s.disconnectStore);

	const source: StoresSource = {
		stores,
		activeId,
		setActive,
		disconnect: (id) => {
			disconnectStore(id);
			return Promise.resolve(true);
		},
		restore: (id) =>
			useWorkspace.setState((s) => ({
				stores: s.stores.map((st) => (st.id === id ? { ...st, status: "connected", connected: true } : st)),
			})),
		Connect: ConnectStoreDialog,
	};

	return <StoresSourceProvider value={source}>{children}</StoresSourceProvider>;
}
