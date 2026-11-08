import { GOTO_DEFAULTS } from "../lib/settings-depth";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../../components/dialog";
import { MessagesSquare, Ticket } from "../../icons";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { isAssignedTo } from "../lib/assignees";
import { initials } from "../lib/format";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";
import { useActiveStore, useSettingsDepth, useShellData, useShellSlots, useWorkspace } from "./state";

/*
 * Dialogs the shell's menus open. A dialog rendered inside a dropdown unmounts when the menu closes,
 * so the avatar menu and the teammate cards ask for one here instead, and the app shell keeps them
 * mounted for the whole session.
 */

type ShellDialog = { kind: "connect-store" } | { kind: "shortcuts" } | { kind: "member"; memberId: string } | null;

export const useShellDialog = create<{ open: ShellDialog; show: (d: NonNullable<ShellDialog>) => void; close: () => void }>()(
	(set) => ({
		open: null,
		show: (open) => set({ open }),
		close: () => set({ open: null }),
	}),
);

export function ShellDialogs() {
	const open = useShellDialog((s) => s.open);
	const close = useShellDialog((s) => s.close);
	const { setActive } = useActiveStore();
	const { ConnectStore } = useShellSlots();
	return (
		<>
			{ConnectStore ? (
				<ConnectStore
					open={open?.kind === "connect-store"}
					onOpenChange={(v) => !v && close()}
					onConnected={(store) => {
						setActive(store.id);
						toast.success(`Je bekijkt nu ${store.name}`);
					}}
				/>
			) : null}
			<ShortcutsDialog open={open?.kind === "shortcuts"} onClose={close} />
			<MemberDialog memberId={open?.kind === "member" ? open.memberId : null} onClose={close} />
		</>
	);
}

/* ─── Keyboard shortcuts ────────────────────────────────────────────────── */

export const SHORTCUTS: ReadonlyArray<{ group: string; keys: ReadonlyArray<{ keys: string[]; what: string }> }> = [
	{
		group: "Overal",
		keys: [
			{ keys: ["⌘", "K"], what: "Opdrachtenpalet en zoeken" },
			{ keys: ["⌘", "J"], what: "Vraag Insyte" },
			{ keys: ["Esc"], what: "Sluit wat open staat" },
		],
	},
	{
		group: "Meldingen",
		keys: [
			{ keys: ["G", "N"], what: "Naar alle meldingen" },
			{ keys: ["J", "K"], what: "Volgende of vorige melding" },
			{ keys: ["E"], what: "Wissen" },
			{ keys: ["S"], what: "Later" },
			{ keys: ["U"], what: "Gelezen of ongelezen" },
		],
	},
	{
		group: "Wachtrij op Start",
		keys: [
			{ keys: ["J"], what: "Volgende rij" },
			{ keys: ["K"], what: "Vorige rij" },
			{ keys: ["E"], what: "Voorstel uitvoeren" },
			{ keys: ["R"], what: "Opnieuw opstellen" },
			{ keys: ["D"], what: "Negeren" },
		],
	},
	{
		group: "Lijsten met geselecteerde rijen",
		keys: [
			{ keys: ["⌘", "K"], what: "Acties voor de geselecteerde rijen" },
			{ keys: ["Esc"], what: "Selectie wissen" },
		],
	},
];

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const keys = useSettingsDepth((s) => s.keys);
	const gotoOn = useSettingsDepth((s) => s.gotoOn);
	return (
		<Dialog open={open} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Sneltoetsen</DialogTitle>
					<DialogDescription>Sneltoetsen werken nooit terwijl je typt.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4">
					{gotoOn ? (
						<section className="flex flex-col gap-1">
							<h3 className="font-medium text-ink-3 text-xs">Ga naar · te veranderen onder Instellingen → Sneltoetsen</h3>
							<div className="grid grid-cols-2 gap-1">
								{GOTO_DEFAULTS.slice(0, 8).map((g) => (
									<div key={g.id} className="flex h-8 items-center justify-between gap-2 rounded-md bg-mist px-2.5 text-base text-ink-2">
										{g.label}
										<span className="flex gap-1">
											{["G", keys[g.id] ?? g.key].map((key) => (
												<kbd key={key} className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-paper px-1 font-medium text-ink text-xs">
													{key}
												</kbd>
											))}
										</span>
									</div>
								))}
							</div>
						</section>
					) : null}
					{SHORTCUTS.map((g) => (
						<section key={g.group} className="flex flex-col gap-1">
							<h3 className="font-medium text-ink-3 text-xs">{g.group}</h3>
							{g.keys.map((k) => (
								<div key={k.what} className="flex h-8 items-center justify-between gap-3 rounded-md bg-mist px-2.5 text-base text-ink-2">
									{k.what}
									<span className="flex gap-1">
										{k.keys.map((key) => (
											<kbd key={key} className="flex h-5 min-w-5 items-center justify-center rounded-sm bg-paper px-1 font-medium text-ink text-xs">
												{key}
											</kbd>
										))}
									</span>
								</div>
							))}
						</section>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}

/* ─── A teammate ────────────────────────────────────────────────────────── */

const PRESENCE: Record<string, { dot: string; label: string }> = {
	online: { dot: "bg-signal-green", label: "Online" },
	away: { dot: "bg-signal-amber", label: "Afwezig" },
	offline: { dot: "bg-ink-4", label: "Offline" },
};

function MemberDialog({ memberId, onClose }: { memberId: string | null; onClose: () => void }) {
	const { presenceById, lastActionById } = useShellData();
	const member = useWorkspace((s) => s.members.find((m) => m.id === memberId));
	// Select the list and filter outside the selector: a selector that returns a new array every read
	// sends the store into an endless re-render.
	const all = useWorkspace((s) => s.tickets);
	const tickets = useMemo(
		() => all.filter((t) => memberId !== null && isAssignedTo(t.assignee_ids, memberId) && t.status !== "done"),
		[all, memberId],
	);
	const navigate = useNavigate();
	const presence = PRESENCE[presenceById[memberId ?? ""] ?? "offline"] ?? PRESENCE.offline;
	return (
		<Dialog open={member !== undefined} onOpenChange={(v) => !v && onClose()}>
			<DialogContent className="sm:max-w-md">
				{member ? (
					<>
						<DialogHeader>
							<div className="flex items-center gap-3">
								<span className="relative flex size-11 items-center justify-center rounded-full font-medium text-base" style={personStyle(member.id)}>
									{initials(member.name)}
									<span className={cn("absolute right-0 bottom-0 size-3 rounded-full ring-2 ring-paper", presence?.dot)} />
								</span>
								<div className="flex flex-col">
									<DialogTitle>{member.name}</DialogTitle>
									<DialogDescription>
										{member.role} · {presence?.label}
										{lastActionById[member.id] ? `, ${lastActionById[member.id]}` : ""}
									</DialogDescription>
								</div>
							</div>
						</DialogHeader>
						<div className="flex flex-col gap-1.5">
							<h3 className="font-medium text-ink-3 text-xs">Toegewezen open tickets</h3>
							{tickets.length === 0 ? (
								<p className="text-sm text-ink-3">Niets open.</p>
							) : (
								tickets.slice(0, 5).map((t) => (
									<button
										key={t.id}
										type="button"
										onClick={() => {
											onClose();
											void navigate({ to: "/tickets", search: { ticket: t.id } } as never);
										}}
										className="flex h-9 cursor-pointer items-center gap-2 rounded-md bg-mist px-2.5 text-left text-base text-ink-2 transition-colors hover:bg-ink/6 hover:text-ink"
									>
										<Ticket className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
										<span className="tabular-nums text-ink-3">{t.number}</span>
										<span className="truncate">{t.title}</span>
									</button>
								))
							)}
						</div>
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => {
									onClose();
									void navigate({ to: "/chats", search: { id: `conv_dm_${member.id}` } } as never);
								}}
								className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-abyss px-3 font-medium text-base text-mesh-ink shadow-primary hover:bg-abyss-2"
							>
								<MessagesSquare className="size-3.5" strokeWidth={1.75} />
								Bericht sturen
							</button>
							<button
								type="button"
								onClick={() => {
									onClose();
									void navigate({ to: "/settings/team" });
								}}
								className="flex h-9 cursor-pointer items-center rounded-md px-3 font-medium text-base text-ink-2 hover:bg-ink/6 hover:text-ink"
							>
								Teaminstellingen
							</button>
						</div>
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
