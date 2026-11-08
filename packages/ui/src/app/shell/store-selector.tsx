import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Check, ChevronDown, LogOut, Plus, Settings, UserPlus } from "../../icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "../common/confirm-dialog";
import type { ActiveStore } from "../hooks/use-active-store";
import { formatRelative } from "../lib/format";
import type { Workspace, WorkspaceInvite } from "../lib/team";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";
import { useActiveStore, useActiveWorkspace, useCan, useSeats, useShellSlots, useTeam, useWorkspace } from "./state";

const initialsOf = (name: string) =>
	name
		.split(/\s+/)
		.filter((w) => /[a-z0-9]/i.test(w[0] ?? ""))
		.map((w) => w[0])
		.slice(0, 2)
		.join("")
		.toUpperCase();

/**
 * The workspace and store switcher.
 *
 * Someone who works for more than one business sees every workspace they are in at the head of the
 * menu, and an invitation to another one as a row they can accept or decline right there. Switching
 * changes the name across the chrome after a short hand-over, so it is clear the console is now
 * someone else's. Below that, the stores of the workspace you are in, the way to start a new
 * workspace, to leave one you do not own, and the one filled action: inviting a colleague, which
 * becomes buying a seat when the plan is full.
 */
export function StoreSelector({
	variant = "wide",
}: {
	variant?: "wide" | "compact";
}) {
	const navigate = useNavigate();
	const { active, stores, setActive } = useActiveStore();
	const current = useActiveWorkspace();
	const team = useTeam((s) => s);
	const { WorkspaceSwitch, FirstRunHint, ConnectStore, Invite } = useShellSlots();
	const workspaces = team.workspaces;
	const pending = useTeam((s) => s.workspaceInvites);
	const memberCount = useWorkspace((s) => s.members.filter((m) => m.status === "active").length);
	const seats = useSeats();
	const can = useCan();
	const [inviting, setInviting] = useState(false);
	const [leaving, setLeaving] = useState<Workspace | null>(null);
	const [connecting, setConnecting] = useState<{ domain?: string } | null>(null);

	const countFor = (w: Workspace) => (w.home ? memberCount : w.members);
	const identityName = current.home ? (active?.name ?? current.name) : current.name;
	const several = workspaces.length > 1 || pending.length > 0;

	function accept(inv: WorkspaceInvite) {
		const ws = team.acceptWorkspaceInvite(inv.id);
		if (!ws) return;
		toast.success(`Je zit nu in ${ws.name}`, {
			description: `Als ${ws.role}. Je vindt het hier tussen je werkruimtes.`,
			action: { label: "Openen", onClick: () => team.switchWorkspace(ws.id) },
		});
	}

	function decline(inv: WorkspaceInvite) {
		const gone = team.declineWorkspaceInvite(inv.id);
		if (gone) undoable(`Uitnodiging van ${inv.workspace} geweigerd`, () => team.restoreWorkspaceInvite(gone.invite, gone.index), `${inv.invitedBy} krijgt te zien dat je niet meedoet.`);
	}

	const Trigger =
		variant === "compact" ? (
			<button
				type="button"
				className="flex h-8 shrink-0 items-center gap-2 rounded-md pr-1.5 pl-1 transition-colors hover:bg-ink/6 data-[popup-open]:bg-ink/6"
			>
				<span className="relative flex size-6 shrink-0 items-center justify-center rounded-md bg-abyss font-medium text-xs text-mesh-ink">
					{initialsOf(identityName)}
					{pending.length > 0 ? <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-arc ring-2 ring-mist" aria-hidden /> : null}
				</span>
				<span className="max-w-[180px] truncate font-medium text-base text-ink leading-none">{identityName}</span>
				{pending.length > 0 ? <span className="sr-only">{pending.length} uitnodiging open</span> : null}
				<ChevronDown className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
			</button>
		) : (
			<button
				type="button"
				className="flex h-10 w-full items-center gap-2.5 rounded-lg pr-2 pl-1 hover:bg-ink/6 data-[popup-open]:bg-ink/6"
			>
				<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-abyss font-medium text-sm text-mesh-ink">
					{initialsOf(identityName)}
				</span>
				<div className="flex min-w-0 flex-1 flex-col items-start">
					<span className="truncate font-medium text-base text-ink">{identityName}</span>
					<span className="truncate text-sm text-ink-3">
						{countFor(current)} {countFor(current) === 1 ? "lid" : "leden"} · {current.plan}
					</span>
				</div>
				<ChevronDown className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
			</button>
		);

	return (
		<div className="relative">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>{Trigger}</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="max-h-[min(640px,85vh)] w-[320px] gap-0 overflow-y-auto p-0">
					<div className="flex items-center gap-2.5 bg-mist px-3 py-3">
						<span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-abyss font-medium text-base text-mesh-ink">
							{initialsOf(current.name)}
						</span>
						<div className="flex min-w-0 flex-col">
							<span className="truncate font-medium text-base text-ink">{current.name}</span>
							<span className="truncate text-sm text-ink-2">
								{current.role} · {countFor(current)} {countFor(current) === 1 ? "lid" : "leden"} · {current.plan}
							</span>
						</div>
					</div>

					{several ? (
						<div className="flex flex-col gap-px p-1.5 pb-0">
							<div className="px-2 pt-1.5 pb-1 font-medium text-xs text-ink-3">Werkruimtes</div>
							{workspaces.map((w) => (
								<DropdownMenuItem
									key={w.id}
									onClick={() => w.id !== current.id && team.switchWorkspace(w.id)}
									className="h-11 gap-2.5 px-2"
								>
									<span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md font-medium text-2xs", w.id === current.id ? "bg-abyss text-mesh-ink" : "bg-ink/7 text-ink-2")}>
										{initialsOf(w.name)}
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-medium text-base text-ink">{w.name}</span>
										<span className="truncate text-sm text-ink-3">
											{w.role} · {countFor(w)} {countFor(w) === 1 ? "lid" : "leden"}
										</span>
									</span>
									{w.id === current.id ? <Check className="size-4 shrink-0 text-arc-ink" strokeWidth={2.25} /> : null}
								</DropdownMenuItem>
							))}
							{pending.map((inv) => (
								<div key={inv.id} className="flex flex-col gap-2 rounded-md bg-arc-tint px-2 py-2">
									<div className="flex items-center gap-2.5">
										<span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-paper font-medium text-2xs text-arc-ink">{initialsOf(inv.workspace)}</span>
										<span className="flex min-w-0 flex-1 flex-col">
											<span className="truncate font-medium text-base text-ink">{inv.workspace}</span>
											<span className="truncate text-sm text-ink-2">
												{inv.invitedBy} nodigt je uit als {inv.role} · {formatRelative(new Date(inv.sentAt))}
											</span>
										</span>
									</div>
									<div className="flex justify-end gap-1 pl-8">
										<button type="button" onClick={() => decline(inv)} className="flex h-7 items-center rounded-md px-2.5 font-medium text-ink-2 text-sm hover:bg-ink/6 hover:text-ink">
											Weigeren
										</button>
										<button type="button" onClick={() => accept(inv)} className="flex h-7 items-center rounded-md bg-abyss px-2.5 font-medium text-mesh-ink text-sm hover:bg-abyss-2">
											Accepteren
										</button>
									</div>
								</div>
							))}
						</div>
					) : null}

					<div className="flex flex-col gap-px p-1.5">
						<div className="px-2 pt-1.5 pb-1 font-medium text-xs text-ink-3">Winkels{current.home ? "" : ` in ${current.name}`}</div>
						{stores.map((s) => (
							<StoreRow
								key={s.id}
								store={s}
								active={s.id === active?.id}
								onSelect={() => {
									if (s.status !== "connected") {
										setConnecting({ domain: s.domain });
										return;
									}
									setActive(s.id);
								}}
							/>
						))}
						<DropdownMenuItem disabled={!can("settings", 3)} onClick={() => setConnecting({})} className="h-9 gap-2.5 px-2 font-medium text-arc-ink">
							<span className="flex size-6 items-center justify-center rounded-md bg-arc-tint">
								<Plus className="size-3.5 text-arc-ink" strokeWidth={2} />
							</span>
							Winkel koppelen
						</DropdownMenuItem>
					</div>

					<div className="flex flex-col gap-px px-1.5 pb-1.5">
						<DropdownMenuItem asChild className="h-8 gap-2.5 px-2">
							<Link to={"/settings/profile" as never}>
								<Settings />
								Werkruimte-instellingen
							</Link>
						</DropdownMenuItem>
						<DropdownMenuItem
							className="h-8 gap-2.5 px-2"
							onClick={() => {
								team.setCreatingWorkspace(true);
								void navigate({ to: "/onboarding", search: { persona: "admin", step: 3 } });
							}}
						>
							<Plus />
							Nieuwe werkruimte
						</DropdownMenuItem>
						{current.own ? null : (
							<DropdownMenuItem className="h-8 gap-2.5 px-2" variant="destructive" onClick={() => setLeaving(current)}>
								<LogOut />
								{current.name} verlaten
							</DropdownMenuItem>
						)}
					</div>

					{/* The one filled action: the thing that makes the workspace more than one person's. */}
					<div className="p-1.5 pt-0">
						<DropdownMenuItem
							disabled={!can("team", 2)}
							onClick={() => (seats.full ? void navigate({ to: "/settings/billing" as never, hash: "plekken" }) : setInviting(true))}
							className="h-auto gap-2.5 rounded-lg bg-abyss p-2.5 text-mesh-ink data-[highlighted]:bg-abyss-2 data-[highlighted]:text-mesh-ink"
						>
							<span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-mesh-ink/12">
								{seats.full ? <Plus className="size-3.5 text-mesh-ink" strokeWidth={1.75} /> : <UserPlus className="size-3.5 text-mesh-ink" strokeWidth={1.75} />}
							</span>
							<span className="flex flex-col">
								<span className="font-medium text-sm">{seats.full ? "Plek bijkopen" : "Collega uitnodigen"}</span>
								<span className="text-sm text-mesh-ink-2">
									{seats.full
										? `Alle ${seats.total} plekken zijn bezet. Een extra plek en je kunt weer uitnodigen.`
										: `${seats.free} van ${seats.total} plekken vrij. Ze werken in dezelfde wachtrij.`}
								</span>
							</span>
						</DropdownMenuItem>
					</div>
				</DropdownMenuContent>
			</DropdownMenu>

			{FirstRunHint ? <FirstRunHint /> : null}
			{WorkspaceSwitch ? <WorkspaceSwitch /> : null}
			{Invite ? <Invite open={inviting} onOpenChange={setInviting} /> : null}
			<ConfirmDialog
				open={leaving !== null}
				onOpenChange={(v) => !v && setLeaving(null)}
				tone="destructive"
				title={`${leaving?.name ?? ""} verlaten?`}
				description={`Je verliest meteen de toegang tot de bestellingen, tickets en chats van ${leaving?.name ?? "deze werkruimte"}. Wat je daar deed blijft op je naam staan. Terugkomen kan alleen met een nieuwe uitnodiging.`}
				confirmLabel="Werkruimte verlaten"
				onConfirm={() => {
					if (!leaving) return;
					const name = leaving.name;
					team.leaveWorkspace(leaving.id);
					setLeaving(null);
					toast.success(`Je hebt ${name} verlaten`);
					void navigate({ to: "/dashboard", search: {} as never });
				}}
			/>
			{ConnectStore ? (
				<ConnectStore
					open={connecting !== null}
					onOpenChange={(open) => !open && setConnecting(null)}
					initialDomain={connecting?.domain}
					onConnected={(store) => {
						setActive(store.id);
						toast.success(`Je bekijkt nu ${store.name}`);
					}}
				/>
			) : null}
		</div>
	);
}

function StoreRow({
	store,
	active,
	onSelect,
}: {
	store: ActiveStore;
	active: boolean;
	onSelect: () => void;
}) {
	const offline = store.status !== "connected";
	return (
		<DropdownMenuItem onClick={onSelect} className="h-11 gap-2.5 px-2">
			<span
				className={cn(
					"flex size-6 shrink-0 items-center justify-center rounded-md font-medium text-2xs",
					active ? "bg-abyss text-mesh-ink" : "bg-ink/7 text-ink-2",
				)}
			>
				{initialsOf(store.name)}
			</span>
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate font-medium text-base text-ink">{store.name}</span>
				<span className="truncate text-sm text-ink-3">{store.domain}</span>
			</span>
			{active ? (
				<Check className="size-4 shrink-0 text-arc-ink" strokeWidth={2.25} />
			) : offline ? (
				<span className="shrink-0 rounded-sm bg-signal-amber-bg px-1.5 font-medium text-signal-amber text-xs leading-5">
					{store.status === "connecting" ? "Koppelen…" : "Opnieuw koppelen"}
				</span>
			) : null}
		</DropdownMenuItem>
	);
}
