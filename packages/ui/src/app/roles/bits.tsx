import { PersonDisc } from "../team/bits";
import type { Level, RoleDef } from "../lib/permissions";
import type { Holders } from "../lib/role-actions";
import { cn } from "../lib/utils";
import { useDeveloper } from "../stores/developer-store";
import { useTeam } from "../stores/team-store";
import { useWorkspace } from "../stores/workspace-store";

/**
 * A level drawn as the mark's own device: three small squares, filled up to the level. Geen is three
 * empty ones. It sits beside the word, never instead of it.
 */
export function LevelMark({ level, className }: { level: Level; className?: string }) {
	return (
		<span aria-hidden className={cn("inline-flex shrink-0 items-center gap-[2px]", className)}>
			{[1, 2, 3].map((l) => (
				<span key={l} className={cn("size-[5px] rounded-[1px]", l <= level ? "bg-ink-2" : "bg-ink/12")} />
			))}
		</span>
	);
}

/** Who holds a role right now, read live so the counts move when someone's role changes. */
export function useHolders(role: Pick<RoleDef, "id" | "label">): Holders {
	const members = useWorkspace((s) => s.members);
	const invites = useTeam((s) => s.invites);
	const linkRole = useTeam((s) => s.link.roleId);
	const keys = useDeveloper((s) => s.apiKeys);
	return {
		members: members.filter((m) => m.role === role.label).map((m) => ({ id: m.id, name: m.name })),
		invites: invites.filter((i) => i.roleId === role.id).length,
		link: linkRole === role.id,
		keys: keys.filter((k) => k.status === "active" && k.access.kind === "role" && k.access.roleId === role.id).length,
	};
}

export function holdersLine(h: Holders): string {
	const parts = [h.members.length === 1 ? "1 teamlid" : `${h.members.length} teamleden`];
	if (h.invites) parts.push(h.invites === 1 ? "1 uitnodiging" : `${h.invites} uitnodigingen`);
	if (h.link) parts.push("de uitnodigingslink");
	if (h.keys) parts.push(h.keys === 1 ? "1 API-sleutel" : `${h.keys} API-sleutels`);
	return parts.join(" · ");
}

/** Up to three discs, overlapping, and a count for the rest. */
export function HolderDiscs({ members, max = 3 }: { members: Holders["members"]; max?: number }) {
	if (members.length === 0) return null;
	const shown = members.slice(0, max);
	return (
		<span className="flex items-center">
			{shown.map((m, i) => (
				<span key={m.id} className={cn("rounded-full ring-2 ring-paper", i > 0 && "-ml-1.5")}>
					<PersonDisc seed={m.id} name={m.name} size={22} />
				</span>
			))}
			{members.length > max ? <span className="ml-1.5 text-ink-3 text-xs tabular-nums">+{members.length - max}</span> : null}
		</span>
	);
}
