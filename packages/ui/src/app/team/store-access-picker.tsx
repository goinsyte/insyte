import type { StoreAccess } from "../lib/team-core";
import { useWorkspace } from "../stores/workspace-store";
import { StorePicker } from "./bits";

/** `StorePicker` over the workspace store's stores, for the screens that read the demo stores directly. */
export function StoreAccessPicker({ value, onChange }: { value: StoreAccess; onChange: (v: StoreAccess) => void }) {
	const stores = useWorkspace((s) => s.stores);
	return <StorePicker value={value} onChange={onChange} stores={stores} />;
}
