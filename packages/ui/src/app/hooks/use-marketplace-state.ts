// Backwards-compatible facade over the zustand marketplace store.
import { useCallback } from "react";
import { useMarketplaceStore } from "../stores/marketplace-store";

export function useMarketplaceState() {
	const records = useMarketplaceStore((s) => s.records);
	const install = useMarketplaceStore((s) => s.install);
	const uninstall = useMarketplaceStore((s) => s.uninstall);
	const markOpened = useMarketplaceStore((s) => s.markOpened);

	const isInstalled = useCallback((id: string) => !!records[id], [records]);
	const getRecord = useCallback((id: string) => records[id], [records]);

	return {
		records,
		installedIds: Object.keys(records),
		isInstalled,
		getRecord,
		install,
		uninstall,
		markOpened,
	};
}
