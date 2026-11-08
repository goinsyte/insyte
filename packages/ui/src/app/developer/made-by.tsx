import { fallbackName } from "../lib/developer";
import { useWorkspace } from "../stores/workspace-store";
import { MadeByName } from "./bits";

/** `MadeByName` over the workspace store's people, for the screens that read the demo stores directly. */
export function MadeBy({ memberId }: { memberId: string }) {
	const member = useWorkspace((s) => s.members.find((m) => m.id === memberId));
	return <MadeByName memberId={memberId} name={member?.name ?? fallbackName(memberId)} />;
}
