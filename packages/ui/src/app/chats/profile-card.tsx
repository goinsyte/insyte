import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/popover";
import { type ChatProfile, chatProfiles, conversations } from "../../data-source";
import { AtSign, Clock, Copy, MessageSquare, ShieldCheck, Sparkle, Sparkles, Ticket } from "../../icons";
import { personStyle } from "../lib/person-color";
import { cn } from "../lib/utils";
import { useChatStore } from "../stores/chat-store";
import { useWorkspace } from "../stores/workspace-store";

/*
 * Who someone is, where you met them: in the conversation. Their name or face opens a card with what
 * a colleague would want before writing to them: whether they are around, what time it is where they
 * are, what they are on, and the two moves that follow: write to them, or name them here. Insyte gets
 * a card too, but an agent's: the rules it follows and what it did, not a timezone.
 */

const PRESENCE: Record<ChatProfile["presence"], { label: string; dot: string }> = {
	online: { label: "Online", dot: "bg-signal-green" },
	away: { label: "Afwezig", dot: "bg-signal-amber" },
	offline: { label: "Offline", dot: "bg-ink-4" },
};

export function profileFor(senderId: string, fallbackName: string): ChatProfile {
	const known = chatProfiles[senderId];
	if (known) return known;
	const member = useWorkspace.getState().members.find((m) => m.id === senderId || `u_${m.name.split(" ")[0]?.toLowerCase()}` === senderId);
	return {
		name: member?.name ?? fallbackName,
		title: member?.role ?? "Teamlid",
		...(member?.email ? { email: member.email } : {}),
		timezone: "Europe/Amsterdam",
		presence: "offline",
		...(member ? { memberId: member.id } : {}),
	};
}

/** A person's direct-message thread: the seeded ones by their chat id, teammates by member id. */
export function dmIdFor(senderId: string): string {
	const seeded: Record<string, string> = { u_maya: "conv_dm_maya", u_marco: "conv_dm_marco" };
	if (seeded[senderId]) return seeded[senderId];
	const memberId = chatProfiles[senderId]?.memberId;
	return `conv_dm_${memberId ?? senderId}`;
}

export function Avatar({ senderId, name, size = 34, presence }: { senderId: string; name: string; size?: number; presence?: ChatProfile["presence"] }) {
	const agent = chatProfiles[senderId]?.agent;
	return (
		<span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
			{agent ? (
				<span className="flex size-full items-center justify-center rounded-lg bg-abyss text-mesh-ink shadow-[0_2px_8px_-2px_color-mix(in_oklch,var(--color-arc)_60%,transparent)]">
					<Sparkle style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={2} />
				</span>
			) : (
				<span aria-hidden className="flex size-full items-center justify-center rounded-lg font-medium" style={{ ...personStyle(senderId), fontSize: size * 0.42 }}>
					{name.charAt(0).toUpperCase()}
				</span>
			)}
			{presence ? <span className={cn("absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-paper", PRESENCE[presence].dot)} /> : null}
		</span>
	);
}

export function ProfilePopover({
	senderId,
	name,
	onMention,
	children,
}: {
	senderId: string;
	name: string;
	onMention?: (handle: string) => void;
	children: ReactElement;
}) {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent side="right" align="start" sideOffset={10} className="w-[300px] overflow-hidden p-0">
				<ProfileCard senderId={senderId} name={name} onMention={onMention} onDone={() => setOpen(false)} />
			</PopoverContent>
		</Popover>
	);
}

function ProfileCard({ senderId, name, onMention, onDone }: { senderId: string; name: string; onMention?: (handle: string) => void; onDone: () => void }) {
	const p = profileFor(senderId, name);
	const navigate = useNavigate();
	const tickets = useWorkspace((s) => s.tickets);
	const created = useChatStore((s) => s.created);
	const open = p.memberId ? tickets.filter((t) => t.assignee_ids.includes(p.memberId as string) && t.status !== "done").length : 0;
	const channels = [...created, ...conversations].filter((c) => c.type === "group" && c.participants.some((x) => x.id === senderId)).map((c) => c.name);
	const handle = p.name.split(" ")[0] ?? p.name;
	const time = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: p.timezone }).format(new Date());
	const offset = hoursFromHere(p.timezone);

	if (p.agent)
		return (
			<div className="flex flex-col">
				<div className="flex flex-col gap-3 bg-abyss px-4 pt-4 pb-4" style={{ backgroundImage: "radial-gradient(120% 100% at 100% 0%, color-mix(in oklch, var(--color-arc) 70%, transparent), transparent 70%)" }}>
					<Avatar senderId={senderId} name={p.name} size={52} />
					<div className="flex flex-col gap-0.5">
						<span className="font-medium text-lg text-mesh-ink">Insyte</span>
						<span className="text-mesh-ink-2 text-sm">{p.title} · {p.status}</span>
					</div>
				</div>
				<div className="flex flex-col gap-1 p-2">
					<CardButton icon={Sparkles} label="Vraag Insyte hier" onClick={() => (onMention?.("Insyte"), onDone())} />
					<CardButton icon={Clock} label="Wat Insyte deed" onClick={() => (navigate({ to: "/ask/activity" }), onDone())} />
					<CardButton icon={ShieldCheck} label="Zelfstandigheid instellen" onClick={() => (navigate({ to: "/settings/ai/autonomy" }), onDone())} />
				</div>
			</div>
		);

	return (
		<div className="flex flex-col">
			<div className="flex items-start gap-3 bg-arc-tint px-4 pt-4 pb-3.5">
				<Avatar senderId={senderId} name={p.name} size={52} presence={p.presence} />
				<div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
					<span className="truncate font-medium text-ink text-lg leading-tight">{p.name}</span>
					<span className="truncate text-ink-2 text-sm">{p.title}</span>
					<span className="mt-1 flex items-center gap-1.5 text-ink-2 text-sm">
						<span className={cn("size-2 rounded-full", PRESENCE[p.presence].dot)} />
						{PRESENCE[p.presence].label}
						{p.status ? <span className="truncate text-ink-3">· {p.status}</span> : null}
					</span>
				</div>
			</div>
			<dl className="flex flex-col gap-2 px-4 py-3 text-sm">
				<div className="flex items-center gap-2.5">
					<Clock className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
					<dt className="sr-only">Lokale tijd</dt>
					<dd className="text-ink-2">
						<span className="font-medium text-ink tabular-nums">{time}</span> bij {p.name.split(" ")[0]}
						{offset ? <span className="text-ink-3"> · {offset}</span> : null}
					</dd>
				</div>
				{p.email ? (
					<div className="flex items-center gap-2.5">
						<AtSign className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
						<dt className="sr-only">E-mail</dt>
						<dd className="min-w-0 flex-1 truncate text-ink-2">{p.email}</dd>
						<button
							type="button"
							aria-label="E-mailadres kopiëren"
							onClick={() => {
								void navigator.clipboard?.writeText(p.email ?? "");
								toast("E-mailadres gekopieerd");
							}}
							className="flex size-6 items-center justify-center rounded-md text-ink-3 hover:bg-ink/6 hover:text-ink"
						>
							<Copy className="size-3.5" strokeWidth={1.75} />
						</button>
					</div>
				) : null}
				{p.memberId ? (
					<div className="flex items-center gap-2.5">
						<Ticket className="size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
						<dt className="sr-only">Open tickets</dt>
						<dd className="text-ink-2">
							<span className="font-medium text-ink tabular-nums">{open}</span> open {open === 1 ? "ticket" : "tickets"}
						</dd>
					</div>
				) : null}
				{channels.length ? (
					<div className="flex items-start gap-2.5">
						<MessageSquare className="mt-0.5 size-3.5 shrink-0 text-ink-3" strokeWidth={1.75} />
						<dt className="sr-only">Kanalen</dt>
						<dd className="text-ink-2">{channels.map((c) => `#${c}`).join(", ")}</dd>
					</div>
				) : null}
			</dl>
			<div className="flex gap-2 px-4 pb-4">
				<button
					type="button"
					onClick={() => {
						navigate({ to: "/chats", search: { id: dmIdFor(senderId) } } as never);
						onDone();
					}}
					className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-abyss font-medium text-mesh-ink text-sm shadow-primary transition-colors hover:bg-abyss-2"
				>
					<MessageSquare className="size-3.5" strokeWidth={2} />
					Bericht
				</button>
				{onMention ? (
					<button
						type="button"
						onClick={() => {
							onMention(handle);
							onDone();
						}}
						className="flex h-8 items-center justify-center gap-1.5 rounded-md bg-arc-tint px-3 font-medium text-arc-ink text-sm transition-colors hover:bg-arc/15"
					>
						<AtSign className="size-3.5" strokeWidth={2} />
						Vermelden
					</button>
				) : null}
			</div>
		</div>
	);
}

function CardButton({ icon: Icon, label, onClick }: { icon: typeof Clock; label: string; onClick: () => void }) {
	return (
		<button type="button" onClick={onClick} className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-ink text-sm transition-colors hover:bg-arc-tint hover:text-arc-ink">
			<Icon className="size-4 text-arc-ink" strokeWidth={1.75} />
			{label}
		</button>
	);
}

/** "1 uur later", "6 uur eerder", or nothing when they are in the same zone. */
function hoursFromHere(tz: string): string | null {
	const at = new Date();
	const minutes = (zone?: string) => {
		const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(zone ? { timeZone: zone } : {}) }).formatToParts(at);
		const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
		return get("hour") * 60 + get("minute");
	};
	let diff = minutes(tz) - minutes();
	if (diff > 720) diff -= 1440;
	if (diff < -720) diff += 1440;
	const h = Math.round(diff / 60);
	if (h === 0) return null;
	return `${Math.abs(h)} uur ${h > 0 ? "later" : "eerder"} dan jij`;
}
