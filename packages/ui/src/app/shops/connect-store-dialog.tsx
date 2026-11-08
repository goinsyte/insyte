import { useWorkspace } from "../stores/workspace-store";
import { type ConnectStoreProps, ConnectStoreFlow } from "./connect-store-flow";

/** Connecting a store in the design app: the demo store's simulated connection, behind the same flow. */
export function ConnectStoreDialog(props: ConnectStoreProps) {
	const connectStore = useWorkspace((s) => s.connectStore);
	return <ConnectStoreFlow {...props} connect={connectStore} />;
}
