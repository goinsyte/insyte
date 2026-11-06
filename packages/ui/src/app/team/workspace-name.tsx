import { useWorkspace } from "../stores/workspace-store";

/** The name of the workspace the console is in, which changes when the person switches. */
export function WorkspaceName() {
	return <>{useWorkspace((s) => s.account.workspace)}</>;
}
