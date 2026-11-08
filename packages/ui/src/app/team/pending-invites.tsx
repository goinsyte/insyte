import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/dropdown-menu";
import { Check, Copy, ExternalLink, MoreHorizontal, RotateCcw, Send } from "../../icons";
import { toast } from "sonner";
import { EmptyState } from "../common/empty-state";
import { BandedList, StatusPill } from "../settings/setting-card";
import { AddressDisc, WELL_BTN } from "./bits";
import { roleLabel, storeAccessLabel } from "./role-text";
import { useSourceInviteRoles, useTeamSource } from "./source";
import { formatRelative } from "../lib/format";
import { type Invite, isExpired } from "../lib/team-core";
import { undoable } from "../lib/undo";
import { cn } from "../lib/utils";

export async function copyInviteLink(url: string) {
	try {
		await navigator.clipboard.writeText(url);
		toast.success("Link gekopieerd", { description: "Alleen het adres waarvoor hij is, kan hem gebruiken." });
	} catch {
		toast.error("Kopiëren lukte niet", { description: url });
	}
}

/**
 * Invitations that have not been answered. Each says what it grants, who sent it and when it lapses;
 * a lapsed one stays on the list, marked, until it is sent again or taken back, because "they never
 * got in" is worth knowing. Revoking has Undo; changing the role applies to the invitation as sent.
 */
export function PendingInvites({ onInvite }: { onInvite: () => void }) {
	const invites = useTeamSource().invites;
	const sorted = [...invites].sort((a, b) => Number(isExpired(a)) - Number(isExpired(b)) || b.sentAt - a.sentAt);

	if (invites.length === 0) {
		return (
			<EmptyState
				compact
				kind="people"
				title="Geen uitnodigingen open."
				body="Wie je uitnodigt staat hier tot die accepteert, met wanneer de link verloopt. Je kunt hem opnieuw sturen, de rol aanpassen of intrekken."
				action={{ label: "Collega uitnodigen", onClick: onInvite }}
			/>
		);
	}

	return (
		<BandedList>
			{sorted.map((i) => (
				<InviteRow key={i.id} invite={i} />
			))}
		</BandedList>
	);
}

function InviteRow({ invite }: { invite: Invite }) {
	const roles = useSourceInviteRoles();
	const source = useTeamSource();
	const { stores, people: members } = source;
	const expired = isExpired(invite);
	const by = members.find((m) => m.id === invite.invitedBy)?.name ?? "Iemand uit je team";
	const url = source.inviteUrl(invite.id);

	function resend() {
		void source.resend(invite.id).then((ok) => {
			if (ok) undoable(`Opnieuw verstuurd naar ${invite.email}`, () => void source.undoResend(invite.id), "De nieuwe link is 7 dagen geldig; de oude werkt niet meer.");
		});
	}

	function revoke() {
		void source.revoke(invite.id).then((ok) => {
			if (ok) undoable(`Uitnodiging aan ${invite.email} ingetrokken`, () => void source.restoreInvite(invite.id), "De link werkt niet meer. De plek is weer vrij.");
		});
	}

	return (
		<li className="group flex min-h-14 flex-wrap items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-ink/3 sm:flex-nowrap">
			<AddressDisc email={invite.email} />
			<div className="flex min-w-0 flex-1 basis-[220px] flex-col">
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate font-medium text-base text-ink">{invite.email}</span>
					{expired ? <StatusPill tone="warning" label="Verlopen" /> : null}
				</span>
				<span className="truncate text-sm text-ink-2">
					{roleLabel(roles, invite.roleId)} · {storeAccessLabel(stores, invite.stores)} · {by}, {formatRelative(new Date(invite.sentAt))}
					{invite.resent > 0 ? ` · ${invite.resent}× opnieuw` : ""} ·{" "}
					<span className={cn(expired && "text-signal-amber")}>
						{expired ? `verlopen ${formatRelative(new Date(invite.expiresAt))}` : `verloopt ${formatRelative(new Date(invite.expiresAt))}`}
					</span>
				</span>
			</div>
			<div className="ml-auto flex shrink-0 items-center gap-1.5">
				<button type="button" onClick={resend} className={WELL_BTN}>
					{expired ? <RotateCcw className="size-3.5" strokeWidth={1.75} /> : <Send className="size-3.5" strokeWidth={1.75} />}
					{expired ? "Opnieuw versturen" : "Herinneren"}
				</button>
				<button
					type="button"
					aria-label={`Link voor ${invite.email} kopiëren`}
					title="Link kopiëren"
					disabled={expired || url === undefined}
					onClick={() => url && void copyInviteLink(url)}
					className={cn(WELL_BTN, "w-8 px-0")}
				>
					<Copy className="size-3.5" strokeWidth={1.75} />
				</button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							aria-label={`Meer voor ${invite.email}`}
							className="flex size-8 items-center justify-center rounded-md text-ink-3 transition hover:bg-ink/6 hover:text-ink data-[popup-open]:bg-ink/6"
						>
							<MoreHorizontal className="size-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-56">
						<DropdownMenuLabel>Rol</DropdownMenuLabel>
						{roles.map((r) => (
							<DropdownMenuItem
								key={r.id}
								onClick={() => {
									if (r.id === invite.roleId) return;
									const before = invite.roleId;
									void source.setInviteRole(invite.id, r.id).then((ok) => {
										if (ok) undoable(`${invite.email} wordt ${r.label}`, () => void source.setInviteRole(invite.id, before));
									});
								}}
							>
								<span className="flex-1">{r.label}</span>
								{r.id === invite.roleId ? <Check className="size-3.5 text-arc-ink" strokeWidth={2.25} /> : null}
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						{source.preview ? (
							<DropdownMenuItem onClick={() => source.preview?.(invite.id)}>
								<ExternalLink />
								Bekijken zoals {invite.email.split("@")[0]} het ziet
							</DropdownMenuItem>
						) : null}
						<DropdownMenuItem variant="destructive" onClick={revoke}>
							Uitnodiging intrekken
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</li>
	);
}
