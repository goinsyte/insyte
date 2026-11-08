import { Link } from "@tanstack/react-router";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { MessageSquare, UserPlus, UserSquare } from "../../icons";
import { initials } from "../lib/format";
import type { Presence } from "../../data-source";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";
import { useShellDialog } from "./shell-dialogs";
import { useNavPrefs, useShellData } from "./state";

const PRESENCE_DOT: Record<Presence, string> = {
	online: "bg-signal-green",
	away: "bg-signal-amber",
	offline: "bg-ink-4",
};

const PRESENCE_LABEL: Record<Presence, string> = {
	online: "Online",
	away: "Afwezig",
	offline: "Offline",
};

/**
 * Topbar-pinned colleagues. Up to 4 stacked avatars with online dots; each
 * one opens a tiny person card. Trailing `+` opens Manage → People to edit
 * the set.
 */
export function TopbarFriends({ onManage }: { onManage: () => void }) {
	const { state, isFriendPinned } = useNavPrefs();
	const { members, presenceById, lastActionById } = useShellData();
	const pinned = members.filter((m) => isFriendPinned(m.id));
	if (pinned.length === 0 && state.pinnedFriends.length === 0) {
		// No pins at all — show only the manage affordance.
		return <ManageButton onClick={onManage} />;
	}

	return (
		<div className="flex shrink-0 items-center">
			<div className="flex items-center">
				{pinned.map((m, idx) => {
					const presence = presenceById[m.id] ?? "offline";
					return (
						<DropdownMenu key={m.id}>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									title={`${m.name} · ${PRESENCE_LABEL[presence]}`}
									aria-label={`${m.name}, ${PRESENCE_LABEL[presence]}`}
									className={cn(
										"relative inline-flex size-7 items-center justify-center rounded-full font-medium text-xs leading-none ring-2 ring-glacier transition-transform hover:z-10 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arc focus-visible:ring-offset-2 focus-visible:ring-offset-glacier",
										idx > 0 && "-ml-1.5",
									)}
									style={personStyle(m.id)}
								>
									{initials(m.name)}
									<span
										className={cn(
											"absolute right-[-1px] bottom-[-1px] size-2.5 rounded-full ring-2 ring-glacier",
											PRESENCE_DOT[presence],
										)}
										aria-hidden
									/>
								</button>
							</DropdownMenuTrigger>
							<PersonCard
								id={m.id}
								name={m.name}
								role={m.role}
								presence={presence}
								lastAction={lastActionById[m.id]}
							/>
						</DropdownMenu>
					);
				})}
			</div>
			<ManageButton onClick={onManage} />
		</div>
	);
}

function ManageButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label="Vastgezette collega's beheren"
			title="Vastgezette collega's beheren"
			className="ml-1.5 flex size-7 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-mist hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-arc focus-visible:ring-offset-2 focus-visible:ring-offset-glacier"
		>
			<UserPlus className="size-3.5" strokeWidth={1.75} />
		</button>
	);
}

function PersonCard({
	id,
	name,
	role,
	presence,
	lastAction,
}: {
	id: string;
	name: string;
	role: string;
	presence: Presence;
	lastAction?: string;
}) {
	return (
		<DropdownMenuContent
			align="start"
			className="w-[260px] gap-0 overflow-hidden p-0"
		>
			<div className="flex items-center gap-2.5 border-hairline border-b p-3">
				<span
					className="relative flex size-9 items-center justify-center rounded-full font-medium text-base"
					style={personStyle(id)}
				>
					{initials(name)}
					<span
						className={cn(
							"absolute right-[-1px] bottom-[-1px] size-3 rounded-full ring-2 ring-paper",
							PRESENCE_DOT[presence],
						)}
						aria-hidden
					/>
				</span>
				<div className="flex min-w-0 flex-col">
					<span className="truncate font-medium text-base text-ink">
						{name}
					</span>
					<span className="truncate text-sm text-ink-3 leading-[1.4]">
						{PRESENCE_LABEL[presence]} · {role}
					</span>
				</div>
			</div>

			{lastAction ? (
				<div className="border-hairline border-b px-3 py-2 text-sm text-ink-3 leading-[1.4]">
					{lastAction}
				</div>
			) : null}

			<div className="px-1 py-1">
				<DropdownMenuItem asChild>
					<Link to={"/chats" as never} search={{ id: `conv_dm_${id}` } as never}>
						<MessageSquare className="size-3.5" />
						Bericht sturen
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => useShellDialog.getState().show({ kind: "member", memberId: id })}>
					<UserSquare className="size-3.5" />
					Profiel openen
				</DropdownMenuItem>
			</div>
		</DropdownMenuContent>
	);
}
