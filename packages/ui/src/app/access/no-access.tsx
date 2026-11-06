import { Check, Link2, Lock } from "../../icons";
import { Link, useRouterState } from "@tanstack/react-router";
import { EmptyIcon } from "../common/empty-icon";
import { PersonDisc } from "../team/bits";
import { railItemsForPersona } from "../lib/app-shell-config";
import { formatRelative } from "../lib/format";
import { AREA_BY_ID, type AreaId, canOpen, canRole, type Level, levelLabel, lower } from "../lib/permissions";
import { undoable } from "../lib/undo";
import { useAccess, useCurrentRole } from "../stores/access-store";
import { useSettings } from "../stores/settings-store";
import { useWorkspace } from "../stores/workspace-store";
import { toast } from "sonner";

const ME = "mem_elena";

/**
 * What a page says to someone whose role may not open it, drawn as an empty state because that is
 * what it is: the slot where the records would be, with a lock in it. It says what is behind it,
 * which permission opens it, and who can grant that — the owner and the admins, by face — and it
 * offers to ask them, which lands in their notifications and on Rollen. A link to this page can be
 * copied to send along by hand. Under that, the places this role can go instead.
 */
export function NoAccess({ area, level }: { area: AreaId; level: Level }) {
	const role = useCurrentRole();
	const roles = useSettings((s) => s.roles);
	const members = useWorkspace((s) => s.members);
	const path = useRouterState({ select: (s) => s.location.pathname });
	const requests = useAccess((s) => s.requests);
	const a = AREA_BY_ID[area];
	const asked = requests.find((r) => r.roleId === role.id && r.area === area && r.state === "open");
	const declined = requests.find((r) => r.roleId === role.id && r.area === area && r.state === "declined");

	// The people whose role may manage the team: they are the ones who can say yes.
	const granters = members.filter((m) => {
		if (m.status !== "active") return false;
		const r = roles.find((x) => x.label === m.role);
		return r ? canRole(r, "team", 3) : false;
	});
	// Who is asking: in this demo, a teammate who holds the role; nobody does, then the role itself asks.
	const requester = members.find((m) => m.role === role.label && m.id !== ME);
	const elsewhere = railItemsForPersona("admin")
		.filter((i) => canOpen(role, i.to))
		.slice(0, 5);

	function ask() {
		const req = useAccess.getState().request({ roleId: role.id, area, level, path, memberId: requester?.id ?? "" });
		undoable("Verzoek verstuurd", () => useAccess.getState().withdraw(req.id), `${granters.map((g) => g.name.split(" ")[0]).join(" en ")} ${granters.length === 1 ? "krijgt" : "krijgen"} een melding.`);
	}

	function copy() {
		void navigator.clipboard?.writeText(window.location.href);
		toast.success("Link gekopieerd", { description: "Stuur hem naar wie je toegang kan geven." });
	}

	return (
		<div className="flex flex-1 items-start justify-center px-5 py-12 sm:py-20">
			<div className="flex w-full max-w-[520px] flex-col items-center gap-6 text-center">
				<EmptyIcon kind="locked" />
				<div className="flex flex-col gap-2">
					<h1 className="font-medium text-ink text-lg">Je hebt geen toegang tot {lower(a.label)}</h1>
					<p className="text-base text-ink-2 leading-[1.6]">
						Als {role.label} kun je {lower(a.label)} niet openen. Daarvoor is{" "}
						<span className="inline-flex items-center gap-1 rounded-md bg-mist px-1.5 font-medium text-ink">
							<Lock className="size-3" strokeWidth={2} />
							{a.label} · {levelLabel(level)}
						</span>{" "}
						nodig. De eigenaar of een beheerder kan het aan je rol toevoegen.
					</p>
				</div>

				<div className="flex w-full flex-col gap-1 rounded-xl bg-mist p-1.5 text-left">
					<span className="px-2.5 pt-1.5 pb-1 font-medium text-ink-3 text-xs">Wie toegang kan geven</span>
					{granters.map((g) => (
						<div key={g.id} className="flex items-center gap-2.5 rounded-lg bg-paper px-2.5 py-2">
							<PersonDisc seed={g.id} name={g.name} size={28} />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate font-medium text-base text-ink">{g.name}</span>
								<span className="truncate text-ink-3 text-sm">{g.role}</span>
							</span>
						</div>
					))}
				</div>

				<div className="flex flex-wrap items-center justify-center gap-2">
					{asked ? (
						<span className="flex h-9 items-center gap-1.5 rounded-lg bg-signal-green-bg px-3 font-medium text-base text-signal-green">
							<Check className="size-4" strokeWidth={2.25} />
							Gevraagd {formatRelative(new Date(asked.at))}
						</span>
					) : (
						<button
							type="button"
							onClick={ask}
							className="flex h-9 items-center gap-1.5 rounded-lg bg-abyss px-3.5 font-medium text-base text-mesh-ink shadow-primary transition-colors hover:bg-abyss-2"
						>
							Toegang vragen
						</button>
					)}
					<button type="button" onClick={copy} className="field flex h-9 items-center gap-1.5 rounded-lg px-3 font-medium text-base text-ink transition-colors hover:field-hover">
						<Link2 className="size-4" strokeWidth={1.75} />
						Link kopiëren
					</button>
				</div>
				{declined && !asked ? <p className="-mt-3 text-ink-3 text-sm">Een eerder verzoek is geweigerd. Je kunt het opnieuw vragen.</p> : null}

				{elsewhere.length ? (
					<div className="flex flex-col items-center gap-2">
						<span className="text-ink-3 text-sm">Wel open voor jou</span>
						<div className="flex flex-wrap justify-center gap-1.5">
							{elsewhere.map((i) => {
								const Icon = i.icon;
								return (
									<Link key={i.to} to={i.to} className="flex h-8 items-center gap-1.5 rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink">
										<Icon className="size-3.5" strokeWidth={1.75} />
										{i.label}
									</Link>
								);
							})}
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
