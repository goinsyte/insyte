import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { ChevronRight, Columns3, Copy, Edit3, Lock, MoreHorizontal, Plus, Trash2, UserCog, Users } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { Gate } from "../access/gate";
import { HolderDiscs, holdersLine, useHolders } from "./bits";
import { SectionAction, SettingCard, StatusPill } from "../settings/setting-card";
import { PersonDisc, WELL_BTN } from "../team/bits";
import { railItemsForPersona } from "../lib/app-shell-config";
import { formatRelative } from "../lib/format";
import { AREA_BY_ID, diff, levelLabel, type RoleDef, storeScopeLabel, summaryLine, SYSTEM_DEFAULTS } from "../lib/permissions";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { type AccessRequest, useAccess, useGate } from "../stores/access-store";
import { useSettings } from "../stores/settings-store";
import { useWorkspace } from "../stores/workspace-store";

/**
 * Every role in the workspace: the five every workspace has, then the team's own. A row says what
 * the role adds up to and who holds it, and opens the editor; its menu duplicates, renames,
 * compares and deletes. Requests for access sit above, because they are waiting on someone.
 */
export function RoleList({
	onNew,
	onDuplicate,
	onDelete,
	onCompare,
	highlight,
}: {
	onNew: (from?: string) => void;
	onDuplicate: (r: RoleDef) => void;
	onDelete: (r: RoleDef) => void;
	onCompare: (ids: string[]) => void;
	highlight?: string;
}) {
	const roles = useSettings((s) => s.roles);
	const system = roles.filter((r) => r.system);
	const custom = roles.filter((r) => r.custom);

	return (
		<>
			<AccessRequests highlight={highlight} />
			<SettingCard
				title={`In deze werkruimte · ${roles.length}`}
				icon={UserCog}
				action={
					<div className="flex items-center gap-1.5">
						<button type="button" onClick={() => onCompare([])} className={WELL_BTN}>
							<Columns3 className="size-3.5" strokeWidth={1.75} />
							<span className="hidden sm:inline">Vergelijk rollen</span>
						</button>
						<Gate perm="team" arg={3}>
							<SectionAction icon={<Plus className="size-3.5" strokeWidth={2} />} onClick={() => onNew()}>
								Nieuwe rol
							</SectionAction>
						</Gate>
					</div>
				}
			>
				<Group label="Systeemrollen">
					{system.map((r) => (
						<RoleRow key={r.id} role={r} onDuplicate={onDuplicate} onDelete={onDelete} onCompare={onCompare} />
					))}
				</Group>
				<Group label={`Eigen rollen · ${custom.length}`}>
					{custom.length === 0 ? (
						<li className="flex flex-col items-start gap-2 px-3.5 py-4">
							<span className="font-medium text-base text-ink">Nog geen eigen rollen</span>
							<span className="text-ink-2 text-sm">Voor als een systeemrol net niet past.</span>
							<div className="mt-1 flex flex-wrap gap-1.5">
								<Gate perm="team" arg={3}>
									<button type="button" onClick={() => onNew("service")} className={WELL_BTN}>
										<Copy className="size-3.5" strokeWidth={1.75} />
										Begin vanuit Klantenservice
									</button>
								</Gate>
								<Gate perm="team" arg={3}>
									<button type="button" onClick={() => onNew()} className={WELL_BTN}>
										<Plus className="size-3.5" strokeWidth={2} />
										Leeg beginnen
									</button>
								</Gate>
							</div>
						</li>
					) : (
						custom.map((r) => <RoleRow key={r.id} role={r} onDuplicate={onDuplicate} onDelete={onDelete} onCompare={onCompare} />)
					)}
				</Group>
			</SettingCard>
		</>
	);
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1.5">
			<h3 className="px-1 font-medium text-ink-3 text-xs">{label}</h3>
			<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
				{children}
			</ul>
		</div>
	);
}

function RoleRow({ role, onDuplicate, onDelete, onCompare }: { role: RoleDef; onDuplicate: (r: RoleDef) => void; onDelete: (r: RoleDef) => void; onCompare: (ids: string[]) => void }) {
	const navigate = useNavigate();
	const stores = useWorkspace((s) => s.stores);
	const holders = useHolders(role);
	const manage = useGate("team", 3);
	const owner = role.id === "owner";
	const base = SYSTEM_DEFAULTS[role.id];
	const altered = role.system && !owner && base !== undefined && diff(base, role, stores).length > 0;
	const open = () => void navigate({ to: "/settings/roles", search: { role: role.id } });
	const Icon = owner ? Lock : role.system ? UserCog : Users;

	return (
		<li className="group/item relative flex min-h-14 items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-ink/3">
			<span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", owner ? "bg-abyss text-mesh-ink" : "bg-mist text-ink-2")}>
				<Icon className="size-4" strokeWidth={1.75} />
			</span>
			<button type="button" onClick={open} className="flex min-w-0 flex-1 flex-col text-left after:absolute after:inset-0 after:content-['']">
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium text-base text-ink">{role.label}</span>
					{altered ? <StatusPill tone="neutral" label="Aangepast" /> : null}
				</span>
				<span className="truncate text-ink-3 text-sm">
					{summaryLine(role)} · {owner ? "alle winkels" : storeScopeLabel(role.stores, stores)}
				</span>
			</button>
			<span className="relative hidden items-center gap-2 sm:flex">
				<HolderDiscs members={holders.members} />
				<span className="min-w-[92px] whitespace-nowrap text-right text-ink-3 text-sm tabular-nums">{holdersLine({ ...holders, link: false })}</span>
			</span>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button type="button" aria-label={`Acties voor ${role.label}`} className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-ink/6 hover:text-ink">
						<MoreHorizontal className="size-4" strokeWidth={1.75} />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onClick={open}>
						<Edit3 />
						{manage.ok && !owner ? "Bewerken" : "Bekijken"}
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => onCompare([role.id])}>
						<Columns3 />
						Vergelijken
					</DropdownMenuItem>
					{owner ? null : (
						<DropdownMenuItem disabled={!manage.ok} onClick={() => onDuplicate(role)}>
							<Copy />
							Dupliceren
						</DropdownMenuItem>
					)}
					{role.custom ? (
						<>
							<DropdownMenuItem disabled={!manage.ok} onClick={() => void navigate({ to: "/settings/roles", search: { role: role.id, nieuw: "1" } })}>
								<Edit3 />
								Hernoemen
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem variant="destructive" disabled={!manage.ok} onClick={() => onDelete(role)}>
								<Trash2 />
								Verwijderen
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			<ChevronRight className="relative hidden size-4 shrink-0 text-ink-4 transition-transform group-hover/item:translate-x-0.5 sm:block" strokeWidth={1.75} />
		</li>
	);
}

/** "Tickets" for /tickets: the rail's name for the page a request was made from. */
function pageName(path: string) {
	return railItemsForPersona("admin").find((i) => path === i.to || path.startsWith(`${i.to}/`))?.label ?? path;
}

/** Requests from no-access pages, waiting for an owner or an admin. */
function AccessRequests({ highlight }: { highlight?: string }) {
	const requests = useAccess((s) => s.requests).filter((r) => r.state === "open");
	if (requests.length === 0) return null;
	return (
		<SettingCard title={`Toegangsverzoeken · ${requests.length}`} icon={Lock}>
			<ul className="flex flex-col overflow-hidden rounded-xl bg-paper shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&>li+li]:shadow-[inset_0_1px_0_color-mix(in_oklch,var(--ink)_7%,transparent)]">
				{requests.map((r) => (
					<RequestRow key={r.id} req={r} highlight={r.id === highlight} />
				))}
			</ul>
		</SettingCard>
	);
}

function RequestRow({ req, highlight }: { req: AccessRequest; highlight: boolean }) {
	const member = useWorkspace((s) => s.members.find((m) => m.id === req.memberId));
	const role = useSettings((s) => s.roles.find((r) => r.id === req.roleId));
	const manage = useGate("team", 3);
	const area = AREA_BY_ID[req.area];
	const name = member?.name ?? `Iemand met de rol ${role?.label ?? "die er niet meer is"}`;

	function grant() {
		if (!role) return;
		const before = role.levels[req.area];
		useSettings.getState().updateRole(role.id, { levels: { ...role.levels, [req.area]: Math.max(before, req.level) as typeof before } });
		useAccess.getState().resolve(req.id, "granted");
		undoable(`${role.label} kan nu ${area.can[req.level] ?? area.label.toLowerCase()}`, () => {
			const now = useSettings.getState().roles.find((r) => r.id === role.id);
			if (now) useSettings.getState().updateRole(role.id, { levels: { ...now.levels, [req.area]: before } });
			useAccess.getState().resolve(req.id, "open");
		}, `${name} ziet het meteen.`);
	}

	function decline() {
		useAccess.getState().resolve(req.id, "declined");
		undoable(`Verzoek van ${name} geweigerd`, () => useAccess.getState().resolve(req.id, "open"));
	}

	return (
		<li className={cn("flex flex-wrap items-center gap-3 px-3.5 py-2.5", highlight && "bg-arc-tint/60")}>
			{member ? <PersonDisc seed={member.id} name={member.name} size={32} /> : null}
			<div className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-base text-ink">
					<span className="font-medium">{name}</span> vraagt om{" "}
					<span className="rounded-md bg-mist px-1.5 py-0.5 font-medium text-sm">
						{area.label} · {levelLabel(req.level)}
					</span>
				</span>
				<span className="truncate text-ink-3 text-sm">
					Als {role?.label ?? "een verwijderde rol"} · {formatRelative(new Date(req.at))} · vanaf {pageName(req.path)}
				</span>
			</div>
			<div className="flex items-center gap-1.5">
				<Gate perm="team" arg={3}>
					<button type="button" onClick={decline} className="flex h-8 items-center rounded-md px-2.5 font-medium text-ink-2 text-sm transition-colors hover:bg-ink/6 hover:text-ink">
						Weigeren
					</button>
				</Gate>
				<Gate perm="team" arg={3}>
					<button type="button" disabled={!role || !manage.ok} onClick={grant} className="flex h-8 items-center rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2 disabled:opacity-50">
						Toekennen aan {role?.label ?? "rol"}
					</button>
				</Gate>
			</div>
		</li>
	);
}
