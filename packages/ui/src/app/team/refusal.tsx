import { DeniedPanel, DeniedRefusal } from "../access/denied";
import type { Denial } from "../access/denial";
import { joinNl, type Level, type Permission } from "../lib/permissions";
import { undoable } from "../lib/undo";
import { type RefusalScope, type TeamSource, useTeamSource } from "./source";

/** Asks for access, and says so with Undo and who will hear it. */
function asker(source: TeamSource, denial: Denial) {
	const askAccess = source.askAccess;
	if (!askAccess) return undefined;
	return async (perm: Permission, arg?: Level | number) => {
		const undo = await askAccess(perm, arg);
		if (!undo) return;
		const first = denial.granters.map((g) => g.name.split(" ")[0] ?? g.name);
		undoable(
			"Verzoek verstuurd",
			undo,
			first.length === 0 ? undefined : `${joinNl(first)} ${first.length === 1 ? "krijgt" : "krijgen"} een melding.`,
		);
	};
}

/** A refused write, said in the part of the team page where it was asked. */
export function TeamRefusalNotice({ scope, className }: { scope: RefusalScope; className?: string }) {
	const source = useTeamSource();
	const refusal = source.refusal;
	if (refusal === null || refusal.scope !== scope) return null;
	const { perm, arg } = refusal.denial;
	const ask = asker(source, refusal.denial);
	return (
		<DeniedRefusal
			denial={refusal.denial}
			onAsk={ask ? () => void ask(perm, arg) : undefined}
			onRetry={refusal.retry}
			onDismiss={source.dismissRefusal}
			className={className}
		/>
	);
}

/** In place of a team part the role may not see: what it takes, who has it, and the way to ask. */
export function TeamDenied({ level, title, size = "section" }: { level: Level; title: string; size?: "section" | "dialog" }) {
	const source = useTeamSource();
	const denial = source.denialFor("team", level);
	const ask = asker(source, denial);
	return <DeniedPanel denial={denial} title={title} size={size} onAsk={ask ? () => void ask("team", level) : undefined} />;
}
